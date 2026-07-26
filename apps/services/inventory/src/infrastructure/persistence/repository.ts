import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

const crypto = require('node:crypto') as typeof import('node:crypto');
const { database } = require('@techzone/database/db') as { database(service: string): any };
import { stock } from './schema';
const { publish, registerReliability } = require('@techzone/messaging/bus') as {
  publish(
    event: string,
    payload: Record<string, unknown>,
    metadata?: {
      client?: { query: (...args: any[]) => Promise<any> };
      causationId?: string;
      correlationId?: string;
    },
  ): Promise<void>;
  registerReliability(service: string, database: any): Promise<void>;
};

@Injectable()
export class InventoryRepository {
  readonly owner = 'inventory';
  readonly db = database('inventory');
  centralWarehouseId = '';
  returnWarehouseId = '';

  async initialize(): Promise<void> {
    await this.db.wait();
    await registerReliability('inventory', this.db);
    this.centralWarehouseId = await this.seedWarehouse(
      'WH-SEOUL',
      '서울 중앙물류센터',
      'fulfillment',
      '경기도 김포시 고촌읍 물류로 24',
    );
    this.returnWarehouseId = await this.seedWarehouse(
      'WH-RETURN',
      '반품 검수센터',
      'returns',
      '인천광역시 서구 검단로 101',
    );
    await this.seedFromCatalog();
  }

  private async seedWarehouse(code: string, name: string, type: string, address: string): Promise<string> {
    await this.db.query(
      `INSERT INTO warehouses(id,code,name,type,address)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(code) DO UPDATE SET
         name=EXCLUDED.name,type=EXCLUDED.type,address=EXCLUDED.address`,
      [crypto.randomUUID(), code, name, type, address],
    );
    const result = await this.db.query(`SELECT id FROM warehouses WHERE code=$1`, [code]);
    await this.db.query(
      `INSERT INTO warehouse_bins(id,warehouse_id,code,name)
       VALUES($1,$2,'A-01','기본 적치구역')
       ON CONFLICT(warehouse_id,code) DO NOTHING`,
      [crypto.randomUUID(), result.rows[0].id],
    );
    return result.rows[0].id;
  }

  private async seedFromCatalog(): Promise<void> {
    const base = process.env.CATALOG_URL || 'http://localhost:3002';
    for (let attempt = 0; attempt < 15; attempt += 1) {
      try {
        const response = await fetch(`${base}/internal/products`, {
          headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || 'techzone-internal' },
        });
        if (!response.ok) throw new Error('catalog not ready');
        const payload = await response.json() as any;
        for (const product of payload.items || []) {
          const variantId = product.variant_id || product.id;
          await this.db.query(
            `INSERT INTO stock(product_id,available_qty) VALUES($1,$2)
             ON CONFLICT(product_id) DO UPDATE SET available_qty=EXCLUDED.available_qty`,
            [product.id, Number(product.stock || 0)],
          );
          await this.db.query(
            `INSERT INTO inventory_balances(
              id,warehouse_id,product_id,variant_id,available_qty
            ) VALUES($1,$2,$3,$4,$5)
             ON CONFLICT(warehouse_id,variant_id) DO NOTHING`,
            [crypto.randomUUID(), this.centralWarehouseId, product.id, variantId, Number(product.stock || 0)],
          );
          await this.db.query(
            `INSERT INTO stock_alert_rules(
              id,warehouse_id,variant_id,safety_qty,reorder_qty
            ) VALUES($1,$2,$3,5,20)
             ON CONFLICT(warehouse_id,variant_id) DO NOTHING`,
            [crypto.randomUUID(), this.centralWarehouseId, variantId],
          );
          for (let index = 0; index < Math.min(Number(product.stock || 0), 3); index += 1) {
            await this.db.query(
              `INSERT INTO serial_numbers(
                id,variant_id,warehouse_id,serial_number,status
              ) VALUES($1,$2,$3,$4,'available')
               ON CONFLICT(serial_number) DO NOTHING`,
              [
                crypto.randomUUID(),
                variantId,
                this.centralWarehouseId,
                `${product.sku || 'TZ'}-${String(index + 1).padStart(5, '0')}`,
              ],
            );
          }
        }
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async reserve(event: any): Promise<void> {
    const payload = event.payload;
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        `SELECT variant_id,warehouse_id,quantity,status
         FROM inventory_reservations
         WHERE order_id=$1
         FOR UPDATE`,
        [payload.orderId],
      );
      if (existing.rowCount) {
        const active = existing.rows.filter((row: any) =>
          ['reserved', 'confirmed', 'committed'].includes(row.status));
        const requested = new Map<string, number>(
          payload.items.map((item: any) => [
            item.variantId || item.productId,
            Number(item.quantity),
          ]),
        );
        const allocated = new Map<string, number>();
        for (const row of active) {
          allocated.set(
            row.variant_id,
            (allocated.get(row.variant_id) || 0) + Number(row.quantity),
          );
        }
        const matches = active.length > 0
          && requested.size === allocated.size
          && [...requested].every(([variantId, quantity]) =>
            allocated.get(variantId) === quantity);
        if (!matches) throw new Error('RESERVATION_CONFLICT');
        await publish(
          'inventory.reserved',
          {
            ...payload,
            warehouseIds: [...new Set(active.map((row: any) => row.warehouse_id))],
            replayed: true,
          },
          {
            client,
            causationId: event.id,
            correlationId: event.correlationId,
          },
        );
        await client.query('COMMIT');
        return;
      }

      for (const item of payload.items) {
        const variantId = item.variantId || item.productId;
        const quantity = Number(item.quantity);
        if (!variantId || !Number.isInteger(quantity) || quantity < 1) {
          throw new Error('INVALID_RESERVATION_ITEM');
        }
        const balances = await client.query(
          `SELECT b.id,b.warehouse_id,b.variant_id,b.product_id,b.available_qty
           FROM inventory_balances b
           JOIN warehouses w ON w.id=b.warehouse_id
           WHERE b.variant_id=$1
             AND b.available_qty>0
             AND w.active=true
             AND w.type IN ('central','fulfillment')
           ORDER BY (b.warehouse_id=$2) DESC,b.available_qty DESC,b.id
           FOR UPDATE OF b`,
          [variantId, this.centralWarehouseId],
        );
        const totalAvailable = balances.rows.reduce(
          (sum: number, row: any) => sum + Number(row.available_qty),
          0,
        );
        if (totalAvailable < quantity) throw new Error('OUT_OF_STOCK');

        let remaining = quantity;
        for (const balance of balances.rows) {
          if (remaining === 0) break;
          const allocated = Math.min(remaining, Number(balance.available_qty));
          await client.query(
            `UPDATE inventory_balances
             SET available_qty=available_qty-$1,reserved_qty=reserved_qty+$1,
                 version=version+1,updated_at=now()
             WHERE id=$2`,
            [allocated, balance.id],
          );
          await client.query(
            `INSERT INTO inventory_reservations(
              id,order_id,warehouse_id,variant_id,quantity,status,expires_at
            ) VALUES($1,$2,$3,$4,$5,'reserved',now()+interval '30 minutes')`,
            [
              crypto.randomUUID(),
              payload.orderId,
              balance.warehouse_id,
              variantId,
              allocated,
            ],
          );
          await client.query(
            `INSERT INTO inventory_movements(
              id,warehouse_id,product_id,variant_id,type,quantity,reason,reference_type,reference_id
            ) VALUES($1,$2,$3,$4,'reservation',$5,'주문 재고 예약','order',$6)`,
            [
              crypto.randomUUID(),
              balance.warehouse_id,
              balance.product_id || item.productId,
              variantId,
              -allocated,
              payload.orderId,
            ],
          );
          remaining -= allocated;
        }
        await client.query(
          `UPDATE stock
           SET available_qty=GREATEST(available_qty-$2,0),version=version+1
           WHERE product_id=$1`,
          [item.productId, quantity],
        );
      }
      const reservations = await client.query(
        `SELECT DISTINCT warehouse_id
         FROM inventory_reservations
         WHERE order_id=$1 AND status='reserved'`,
        [payload.orderId],
      );
      await publish(
        'inventory.reserved',
        {
          ...payload,
          warehouseId: reservations.rows[0]?.warehouse_id || this.centralWarehouseId,
          warehouseIds: reservations.rows.map((row: any) => row.warehouse_id),
        },
        {
          client,
          causationId: event.id,
          correlationId: event.correlationId,
        },
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      await publish('inventory.failed', {
        orderId: payload.orderId,
        userId: payload.userId,
        reason: error instanceof Error ? error.message : 'INVENTORY_FAILED',
      }, {
        causationId: event.id,
        correlationId: event.correlationId,
      });
    } finally {
      client.release();
    }
  }

  async confirmReservations(orderId: string): Promise<void> {
    await this.db.query(
      `UPDATE inventory_reservations
       SET status='confirmed',expires_at=NULL,updated_at=now()
       WHERE order_id=$1 AND status='reserved'`,
      [orderId],
    );
  }

  async commitReservations(orderId: string): Promise<void> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const reservations = await client.query(
        `SELECT r.id,r.warehouse_id,r.variant_id,r.quantity
         FROM inventory_reservations r
         WHERE r.order_id=$1 AND r.status IN ('reserved','confirmed')
         FOR UPDATE`,
        [orderId],
      );
      for (const reservation of reservations.rows) {
        const updated = await client.query(
          `UPDATE inventory_balances
           SET reserved_qty=reserved_qty-$1,version=version+1,updated_at=now()
           WHERE warehouse_id=$2 AND variant_id=$3 AND reserved_qty >= $1
           RETURNING id`,
          [
            Number(reservation.quantity),
            reservation.warehouse_id,
            reservation.variant_id,
          ],
        );
        if (!updated.rowCount) throw new Error('RESERVED_STOCK_MISMATCH');
      }
      await client.query(
        `UPDATE inventory_reservations
         SET status='committed',expires_at=NULL,updated_at=now()
         WHERE order_id=$1 AND status IN ('reserved','confirmed')`,
        [orderId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async releaseReservations(
    orderId: string,
    reason: string,
    event?: any,
  ): Promise<boolean> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const reservations = await client.query(
        `SELECT r.id,r.warehouse_id,r.variant_id,r.quantity,b.product_id
         FROM inventory_reservations r
         JOIN inventory_balances b
           ON b.warehouse_id=r.warehouse_id AND b.variant_id=r.variant_id
         WHERE r.order_id=$1 AND r.status IN ('reserved','confirmed')
         FOR UPDATE OF r,b`,
        [orderId],
      );
      if (!reservations.rowCount) {
        await client.query('COMMIT');
        return false;
      }
      const productTotals = new Map<string, number>();
      for (const reservation of reservations.rows) {
        const quantity = Number(reservation.quantity);
        const updated = await client.query(
          `UPDATE inventory_balances
           SET available_qty=available_qty+$1,reserved_qty=reserved_qty-$1,
               version=version+1,updated_at=now()
           WHERE warehouse_id=$2 AND variant_id=$3 AND reserved_qty >= $1
           RETURNING id`,
          [quantity, reservation.warehouse_id, reservation.variant_id],
        );
        if (!updated.rowCount) throw new Error('RESERVED_STOCK_MISMATCH');
        await client.query(
          `INSERT INTO inventory_movements(
            id,warehouse_id,product_id,variant_id,type,quantity,reason,reference_type,reference_id
          ) VALUES($1,$2,$3,$4,'release',$5,$6,'order',$7)`,
          [
            crypto.randomUUID(),
            reservation.warehouse_id,
            reservation.product_id,
            reservation.variant_id,
            quantity,
            reason,
            orderId,
          ],
        );
        if (reservation.product_id) {
          productTotals.set(
            reservation.product_id,
            (productTotals.get(reservation.product_id) || 0) + quantity,
          );
        }
      }
      for (const [productId, quantity] of productTotals) {
        await client.query(
          `UPDATE stock
           SET available_qty=available_qty+$2,version=version+1
           WHERE product_id=$1`,
          [productId, quantity],
        );
      }
      await client.query(
        `UPDATE inventory_reservations
         SET status='released',expires_at=NULL,released_at=now(),
             release_reason=$2,updated_at=now()
         WHERE order_id=$1 AND status IN ('reserved','confirmed')`,
        [orderId, reason],
      );
      await publish(
        'inventory.released',
        { orderId, reason },
        {
          client,
          causationId: event?.id,
          correlationId: event?.correlationId,
        },
      );
      if (reason === 'RESERVATION_EXPIRED') {
        await publish(
          'inventory.reservation_expired',
          { orderId, reason },
          {
            client,
            causationId: event?.id,
            correlationId: event?.correlationId,
          },
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async expireReservations(): Promise<number> {
    const expired = await this.db.query(
      `SELECT DISTINCT order_id
       FROM inventory_reservations
       WHERE status='reserved' AND expires_at<=now()
       ORDER BY order_id
       LIMIT 100`,
    );
    let released = 0;
    for (const row of expired.rows) {
      if (await this.releaseReservations(row.order_id, 'RESERVATION_EXPIRED')) {
        released += 1;
      }
    }
    return released;
  }

  async receive(payload: any): Promise<void> {
    await this.increaseBalance(
      payload.warehouseId || this.centralWarehouseId,
      payload.variantId,
      payload.productId,
      Number(payload.quantity),
      'receipt',
      payload.purchaseOrderId,
      '발주 입고',
    );
  }

  private async increaseBalance(
    warehouseId: string,
    variantId: string,
    productId: string | undefined,
    quantity: number,
    referenceType: string,
    referenceId: string | undefined,
    reason: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO inventory_balances(
        id,warehouse_id,product_id,variant_id,available_qty
      ) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(warehouse_id,variant_id) DO UPDATE SET
         available_qty=inventory_balances.available_qty+EXCLUDED.available_qty,
         incoming_qty=GREATEST(inventory_balances.incoming_qty-EXCLUDED.available_qty,0),
         version=inventory_balances.version+1,updated_at=now()`,
      [crypto.randomUUID(), warehouseId, productId || null, variantId, quantity],
    );
    await this.db.query(
      `INSERT INTO inventory_movements(
        id,warehouse_id,product_id,variant_id,type,quantity,reason,reference_type,reference_id
      ) VALUES($1,$2,$3,$4,'receipt',$5,$6,$7,$8)`,
      [
        crypto.randomUUID(),
        warehouseId,
        productId || null,
        variantId,
        quantity,
        reason,
        referenceType,
        referenceId || null,
      ],
    );
    await publish('inventory.received_projected', {
      warehouseId,
      variantId,
      productId,
      quantity,
    });
  }

  async list(): Promise<any[]> {
    const result = await this.db.query(
      `SELECT b.id,b.product_id,b.variant_id,b.available_qty,b.reserved_qty,
              b.damaged_qty,b.incoming_qty,b.version,b.updated_at,
              w.id warehouse_id,w.code warehouse_code,w.name warehouse_name,
              r.safety_qty,r.reorder_qty
       FROM inventory_balances b
       JOIN warehouses w ON w.id=b.warehouse_id
       LEFT JOIN stock_alert_rules r
         ON r.warehouse_id=b.warehouse_id AND r.variant_id=b.variant_id
       ORDER BY w.name,b.updated_at DESC`,
    );
    return result.rows;
  }

  async movements(variantId?: string): Promise<any[]> {
    const params: unknown[] = [];
    const where: string[] = [];
    if (variantId) {
      params.push(variantId);
      where.push(`variant_id=$${params.length}`);
    }
    const result = await this.db.query(
      `SELECT * FROM inventory_movements
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC LIMIT 200`,
      params,
    );
    return result.rows;
  }

  async serials(): Promise<any[]> {
    const result = await this.db.query(
      `SELECT s.*,w.name warehouse_name
       FROM serial_numbers s JOIN warehouses w ON w.id=s.warehouse_id
       ORDER BY received_at DESC LIMIT 200`,
    );
    return result.rows;
  }

  async warehouses(): Promise<any[]> {
    const result = await this.db.query(`SELECT * FROM warehouses ORDER BY name`);
    return result.rows;
  }

  async stock(productId: string): Promise<any> {
    const rows = await this.db.orm
      .select()
      .from(stock)
      .where(eq(stock.productId, productId))
      .limit(1);
    const item = rows[0];
    return item
      ? { product_id: item.productId, available_qty: item.availableQty, version: item.version }
      : { product_id: productId, available_qty: 0, version: 0 };
  }

  async adjust(productId: string, input: any, actorId: string): Promise<any> {
    const warehouseId = input.warehouseId || this.centralWarehouseId;
    const current = await this.db.query(
      `SELECT * FROM inventory_balances
       WHERE product_id=$1 AND warehouse_id=$2
       ORDER BY updated_at DESC,id
       LIMIT 1`,
      [productId, warehouseId],
    );
    const variantId = current.rows[0]?.variant_id;
    if (!variantId) throw new Error('INVENTORY_BALANCE_NOT_FOUND');
    return this.adjustVariant(variantId, input, actorId);
  }

  async adjustVariant(variantId: string, input: any, actorId: string): Promise<any> {
    const quantity = Number(input.availableQty);
    const warehouseId = input.warehouseId || this.centralWarehouseId;
    let productId = '';
    let reservedQty = 0;
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT * FROM inventory_balances
         WHERE variant_id=$1 AND warehouse_id=$2
         FOR UPDATE`,
        [variantId, warehouseId],
      );
      if (!current.rows[0]) throw new Error('INVENTORY_BALANCE_NOT_FOUND');
      productId = current.rows[0].product_id;
      reservedQty = Number(current.rows[0].reserved_qty || 0);
      const before = Number(current.rows[0].available_qty);
      await client.query(
        `UPDATE inventory_balances
         SET available_qty=$1,version=version+1,updated_at=now() WHERE id=$2`,
        [quantity, current.rows[0].id],
      );
      await client.query(
        `INSERT INTO stock(product_id,available_qty,version)
         SELECT $1,coalesce(sum(b.available_qty),0)::int,0
         FROM inventory_balances b
         JOIN warehouses w ON w.id=b.warehouse_id
         WHERE b.product_id=$1
           AND w.active=true
           AND w.type IN ('central','fulfillment')
         ON CONFLICT(product_id) DO UPDATE SET
           available_qty=EXCLUDED.available_qty,version=stock.version+1`,
        [productId],
      );
      await client.query(
        `INSERT INTO inventory_movements(
          id,warehouse_id,product_id,variant_id,type,quantity,reason,actor_id
        ) VALUES($1,$2,$3,$4,'adjustment',$5,$6,$7)`,
        [
          crypto.randomUUID(),
          warehouseId,
          productId,
          variantId,
          quantity - before,
          input.reason || '관리자 재고 조정',
          actorId,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await publish('inventory.adjusted', {
      productId,
      variantId,
      warehouseId,
      availableQty: quantity,
      reservedQty,
      actorId,
      reason: input.reason || '관리자 재고 조정',
    });
    return {
      product_id: productId,
      variant_id: variantId,
      warehouse_id: warehouseId,
      available_qty: quantity,
    };
  }

  async transfer(input: any, actorId: string): Promise<any | null> {
    const quantity = Number(input.quantity);
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const moved = await client.query(
        `UPDATE inventory_balances
         SET available_qty=available_qty-$1,version=version+1
         WHERE warehouse_id=$2 AND variant_id=$3 AND available_qty >= $1
         RETURNING id`,
        [quantity, input.fromWarehouseId, input.variantId],
      );
      if (!moved.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query(
        `INSERT INTO inventory_balances(
          id,warehouse_id,product_id,variant_id,available_qty
        ) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(warehouse_id,variant_id) DO UPDATE SET
           available_qty=inventory_balances.available_qty+EXCLUDED.available_qty,
           version=inventory_balances.version+1`,
        [
          crypto.randomUUID(),
          input.toWarehouseId,
          input.productId || null,
          input.variantId,
          quantity,
        ],
      );
      for (const [warehouseId, delta] of [
        [input.fromWarehouseId, -quantity],
        [input.toWarehouseId, quantity],
      ]) {
        await client.query(
          `INSERT INTO inventory_movements(
            id,warehouse_id,product_id,variant_id,type,quantity,reason,actor_id
          ) VALUES($1,$2,$3,$4,'transfer',$5,$6,$7)`,
          [
            crypto.randomUUID(),
            warehouseId,
            input.productId || null,
            input.variantId,
            delta,
            input.reason || '창고 이동',
            actorId,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await publish('inventory.transferred', {
      variantId: input.variantId,
      productId: input.productId,
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      quantity,
      actorId,
    });
    return { status: 'transferred' };
  }

  async internalInventory(): Promise<any[]> {
    const result = await this.db.query(
      `SELECT b.*,w.code warehouse_code,w.name warehouse_name,
              r.safety_qty,r.reorder_qty
       FROM inventory_balances b
       JOIN warehouses w ON w.id=b.warehouse_id
       LEFT JOIN stock_alert_rules r
         ON r.warehouse_id=b.warehouse_id AND r.variant_id=b.variant_id
       ORDER BY b.updated_at DESC`,
    );
    return result.rows;
  }

  async availability(variantIds: string[]): Promise<any[]> {
    if (!variantIds.length) return [];
    const result = await this.db.query(
      `SELECT b.variant_id,
              coalesce(sum(b.available_qty),0)::int available_qty
       FROM inventory_balances b
       JOIN warehouses w ON w.id=b.warehouse_id
       WHERE b.variant_id=ANY($1::uuid[])
         AND w.active=true
         AND w.type IN ('central','fulfillment')
       GROUP BY b.variant_id`,
      [variantIds],
    );
    const quantities = new Map(
      result.rows.map((row: any) => [row.variant_id, Number(row.available_qty)]),
    );
    return variantIds.map(variantId => ({
      variant_id: variantId,
      available_qty: quantities.get(variantId) || 0,
    }));
  }
}
