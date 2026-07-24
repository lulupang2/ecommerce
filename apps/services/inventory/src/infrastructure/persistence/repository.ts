import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

const crypto = require('node:crypto') as typeof import('node:crypto');
const { database } = require('@techzone/database/db') as { database(service: string): any };
import { stock } from './schema';
const { publish, registerReliability } = require('@techzone/messaging/bus') as {
  publish(event: string, payload: Record<string, unknown>): Promise<void>;
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
       ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name`,
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
    const completed: any[] = [];
    try {
      for (const item of payload.items) {
        const variantId = item.variantId || item.productId;
        const balance = await this.db.query(
          `UPDATE inventory_balances
           SET available_qty=available_qty-$1,reserved_qty=reserved_qty+$1,
               version=version+1,updated_at=now()
           WHERE warehouse_id=$2 AND (variant_id=$3 OR product_id=$4) AND available_qty >= $1
           RETURNING id,variant_id,product_id`,
          [Number(item.quantity), this.centralWarehouseId, variantId, item.productId],
        );
        if (!balance.rows[0]) throw new Error('OUT_OF_STOCK');
        completed.push({ ...balance.rows[0], quantity: Number(item.quantity) });
        await this.db.query(
          `INSERT INTO inventory_reservations(
            id,order_id,warehouse_id,variant_id,quantity,status,expires_at
          ) VALUES($1,$2,$3,$4,$5,'reserved',now()+interval '30 minutes')
           ON CONFLICT(order_id,variant_id) DO NOTHING`,
          [
            crypto.randomUUID(),
            payload.orderId,
            this.centralWarehouseId,
            balance.rows[0].variant_id,
            Number(item.quantity),
          ],
        );
        await this.db.query(
          `INSERT INTO inventory_movements(
            id,warehouse_id,product_id,variant_id,type,quantity,reason,reference_type,reference_id
          ) VALUES($1,$2,$3,$4,'reservation',$5,'주문 재고 예약','order',$6)`,
          [
            crypto.randomUUID(),
            this.centralWarehouseId,
            item.productId,
            balance.rows[0].variant_id,
            -Number(item.quantity),
            payload.orderId,
          ],
        );
        await this.db.orm
          .update(stock)
          .set({
            availableQty: sql`GREATEST(${stock.availableQty} - ${Number(item.quantity)},0)`,
            version: sql`${stock.version} + 1`,
          })
          .where(eq(stock.productId, item.productId));
      }
      await publish('inventory.reserved', { ...payload, warehouseId: this.centralWarehouseId });
    } catch (error) {
      for (const item of completed) {
        await this.db.query(
          `UPDATE inventory_balances
           SET available_qty=available_qty+$1,reserved_qty=GREATEST(reserved_qty-$1,0),
               version=version+1 WHERE id=$2`,
          [item.quantity, item.id],
        );
      }
      await publish('inventory.failed', {
        orderId: payload.orderId,
        userId: payload.userId,
        reason: error instanceof Error ? error.message : 'INVENTORY_FAILED',
      });
    }
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
    const quantity = Number(input.availableQty);
    const warehouseId = input.warehouseId || this.centralWarehouseId;
    const current = await this.db.query(
      `SELECT * FROM inventory_balances WHERE product_id=$1 AND warehouse_id=$2 LIMIT 1`,
      [productId, warehouseId],
    );
    const before = Number(current.rows[0]?.available_qty || 0);
    const variantId = current.rows[0]?.variant_id || productId;
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      if (current.rows[0]) {
        await client.query(
          `UPDATE inventory_balances
           SET available_qty=$1,version=version+1,updated_at=now() WHERE id=$2`,
          [quantity, current.rows[0].id],
        );
      } else {
        await client.query(
          `INSERT INTO inventory_balances(
            id,warehouse_id,product_id,variant_id,available_qty
          ) VALUES($1,$2,$3,$3,$4)`,
          [crypto.randomUUID(), warehouseId, productId, quantity],
        );
      }
      await client.query(
        `INSERT INTO stock(product_id,available_qty,version) VALUES($1,$2,0)
         ON CONFLICT(product_id) DO UPDATE SET
           available_qty=EXCLUDED.available_qty,version=stock.version+1`,
        [productId, quantity],
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
      reservedQty: Number(current.rows[0]?.reserved_qty || 0),
      actorId,
      reason: input.reason || '관리자 재고 조정',
    });
    return { product_id: productId, available_qty: quantity };
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
}
