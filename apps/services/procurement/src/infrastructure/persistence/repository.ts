import { Injectable } from '@nestjs/common';

const crypto = require('node:crypto') as typeof import('node:crypto');
const { database } = require('@techzone/database/db') as { database(service: string): any };
const { publish, registerReliability } = require('@techzone/messaging/bus') as {
  publish(event: string, payload: Record<string, unknown>, options?: Record<string, unknown>): Promise<void>;
  registerReliability(service: string, database: any): Promise<void>;
};

@Injectable()
export class ProcurementRepository {
  readonly owner = 'procurement';
  readonly db = database('procurement');

  async initialize(): Promise<void> {
    await this.db.wait();
    await registerReliability('procurement', this.db);
  }

  async suppliers(): Promise<any[]> {
    const result = await this.db.query(
      `SELECT s.*,count(sp.id)::int product_count
       FROM suppliers s LEFT JOIN supplier_products sp ON sp.supplier_id=s.id
       GROUP BY s.id ORDER BY s.name`,
    );
    return result.rows;
  }

  async purchaseOrders(): Promise<any[]> {
    const result = await this.db.query(
      `SELECT po.*,s.name supplier_name,count(i.id)::int item_count,
              coalesce(sum(i.quantity-i.received_qty),0)::int outstanding_qty
       FROM purchase_orders po
       JOIN suppliers s ON s.id=po.supplier_id
       LEFT JOIN purchase_order_items i ON i.purchase_order_id=po.id
       GROUP BY po.id,s.name ORDER BY po.created_at DESC`,
    );
    return result.rows;
  }

  async create(input: any, actorId: string): Promise<any> {
    const id = crypto.randomUUID();
    const purchaseOrderNumber = `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`;
    const totalAmount = input.items.reduce(
      (sum: number, item: any) => sum + Number(item.quantity) * Number(item.unitCost),
      0,
    );
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO purchase_orders(
          id,purchase_order_number,supplier_id,warehouse_id,status,total_amount,expected_at
        ) VALUES($1,$2,$3,$4,'draft',$5,$6)`,
        [id, purchaseOrderNumber, input.supplierId, input.warehouseId, totalAmount,
          input.expectedAt || null],
      );
      for (const item of input.items) {
        await client.query(
          `INSERT INTO purchase_order_items(
            id,purchase_order_id,product_id,variant_id,sku,quantity,unit_cost
          ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [crypto.randomUUID(), id, item.productId || null, item.variantId, item.sku,
            Number(item.quantity), Number(item.unitCost)],
        );
      }
      await publish('purchase_order.created', {
        purchaseOrderId: id,
        purchaseOrderNumber,
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        status: 'draft',
        totalAmount,
        expectedAt: input.expectedAt,
        actorId,
      }, { client });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return { id, purchaseOrderNumber, status: 'draft' };
  }

  async approve(id: string, actorId: string): Promise<any | null> {
    const result = await this.db.query(
      `UPDATE purchase_orders
       SET status='approved',approved_by=$2,approved_at=now(),updated_at=now()
       WHERE id=$1 AND status='draft' RETURNING *`,
      [id, actorId],
    );
    if (!result.rows[0]) return null;
    await publish('purchase_order.approved', {
      purchaseOrderId: result.rows[0].id,
      purchaseOrderNumber: result.rows[0].purchase_order_number,
      supplierId: result.rows[0].supplier_id,
      warehouseId: result.rows[0].warehouse_id,
      status: 'approved',
      totalAmount: Number(result.rows[0].total_amount),
      actorId,
    });
    return result.rows[0];
  }

  async receive(id: string, input: any, actorId: string): Promise<any | null> {
    const order = await this.db.query(
      `SELECT * FROM purchase_orders
       WHERE id=$1 AND status IN('approved','partially_received')`,
      [id],
    );
    if (!order.rows[0]) return null;
    const receiptId = crypto.randomUUID();
    const receiptNumber = `GR-${Date.now().toString().slice(-9)}`;
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO goods_receipts(
          id,receipt_number,purchase_order_id,warehouse_id,received_by
        ) VALUES($1,$2,$3,$4,$5)`,
        [receiptId, receiptNumber, id, order.rows[0].warehouse_id, actorId],
      );
      for (const receipt of input.items) {
        const item = await client.query(
          `SELECT * FROM purchase_order_items WHERE id=$1 AND purchase_order_id=$2`,
          [receipt.itemId, id],
        );
        if (!item.rows[0]) continue;
        const remaining = Number(item.rows[0].quantity) - Number(item.rows[0].received_qty);
        const quantity = Math.min(Number(receipt.quantity), remaining);
        if (!Number.isInteger(quantity) || quantity <= 0) continue;
        await client.query(
          `UPDATE purchase_order_items SET received_qty=received_qty+$2 WHERE id=$1`,
          [receipt.itemId, quantity],
        );
        await client.query(
          `INSERT INTO goods_receipt_items(
            id,goods_receipt_id,purchase_order_item_id,variant_id,quantity,condition
          ) VALUES($1,$2,$3,$4,$5,$6)`,
          [crypto.randomUUID(), receiptId, receipt.itemId, item.rows[0].variant_id,
            quantity, receipt.condition || 'good'],
        );
        await publish('inventory.received', {
          purchaseOrderId: id,
          goodsReceiptId: receiptId,
          warehouseId: order.rows[0].warehouse_id,
          productId: item.rows[0].product_id,
          variantId: item.rows[0].variant_id,
          quantity,
        }, { client });
      }
      const outstanding = await client.query(
        `SELECT sum(quantity-received_qty)::int outstanding
         FROM purchase_order_items WHERE purchase_order_id=$1`,
        [id],
      );
      const status = Number(outstanding.rows[0].outstanding) === 0
        ? 'received'
        : 'partially_received';
      await client.query(
        `UPDATE purchase_orders SET status=$2,updated_at=now() WHERE id=$1`,
        [id, status],
      );
      await publish(
        `purchase_order.${status === 'received' ? 'received' : 'partially_received'}`,
        {
          purchaseOrderId: id,
          purchaseOrderNumber: order.rows[0].purchase_order_number,
          supplierId: order.rows[0].supplier_id,
          warehouseId: order.rows[0].warehouse_id,
          status,
          totalAmount: Number(order.rows[0].total_amount),
          goodsReceiptId: receiptId,
          actorId,
        },
        { client },
      );
      await client.query('COMMIT');
      return { receiptId, receiptNumber, status };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
