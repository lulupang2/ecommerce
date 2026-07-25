import { Injectable } from '@nestjs/common';

const crypto = require('node:crypto') as typeof import('node:crypto');
const { database } = require('@techzone/database/db') as { database(service: string): any };
const { publish, registerReliability } = require('@techzone/messaging/bus') as {
  publish(
    event: string,
    payload: Record<string, unknown>,
    metadata?: { client?: { query: (...args: any[]) => Promise<any> } },
  ): Promise<void>;
  registerReliability(service: string, database: any): Promise<void>;
};

const SHIPMENT_TRANSITIONS: Record<string, string[]> = {
  ready: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

const RETURN_TRANSITIONS: Record<string, string[]> = {
  requested: ['approved', 'rejected'],
  approved: ['received'],
  received: ['refunded'],
  refunded: [],
  rejected: [],
};

@Injectable()
export class FulfillmentRepository {
  readonly owner = 'fulfillment';
  readonly db = database('fulfillment');

  async initialize(): Promise<void> {
    await this.db.wait();
    await registerReliability('fulfillment', this.db);
  }

  private internalHeaders() {
    return { 'x-internal-key': process.env.INTERNAL_API_KEY || 'techzone-internal' };
  }

  private async warehouseId(): Promise<string | undefined> {
    const response = await fetch(
      `${process.env.INVENTORY_URL || 'http://localhost:3006'}/internal/warehouses`,
      { headers: this.internalHeaders() },
    );
    const payload = await response.json() as any;
    return payload.items.find((item: any) => item.code === 'WH-SEOUL')?.id
      || payload.items[0]?.id;
  }

  async createShipment(payload: any): Promise<any> {
    const existing = await this.db.query(`SELECT * FROM shipments WHERE order_id=$1`, [payload.orderId]);
    if (existing.rows[0]) {
      return {
        shipmentId: existing.rows[0].id,
        shipmentNumber: existing.rows[0].shipment_number,
        orderId: existing.rows[0].order_id,
        warehouseId: existing.rows[0].warehouse_id,
        status: existing.rows[0].status,
        carrier: existing.rows[0].carrier,
        recipient: existing.rows[0].recipient,
        createdAt: existing.rows[0].created_at,
      };
    }
    const warehouseId = await this.warehouseId();
    if (!warehouseId) throw new Error('WAREHOUSE_NOT_READY');
    const id = crypto.randomUUID();
    const shipmentNumber = `SHP-${Date.now().toString().slice(-10)}`;
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO shipments(
          id,order_id,shipment_number,warehouse_id,carrier,status,recipient
        ) VALUES($1,$2,$3,$4,'CJ대한통운','ready',$5)`,
        [id, payload.orderId, shipmentNumber, warehouseId, payload.recipient || '고객'],
      );
      try {
        const response = await fetch(
          `${process.env.ORDER_URL || 'http://localhost:3004'}/internal/orders/${payload.orderId}/items`,
          { headers: this.internalHeaders() },
        );
        const items = ((await response.json()) as any).items || [];
        for (const item of items) {
          await client.query(
            `INSERT INTO shipment_items(
              id,shipment_id,order_item_id,variant_id,sku,quantity
            ) VALUES($1,$2,$3,$4,$5,$6)`,
            [crypto.randomUUID(), id, item.id, item.variant_id, item.sku, item.quantity],
          );
        }
      } catch {}
      const eventPayload = {
        shipmentId: id,
        shipmentNumber,
        orderId: payload.orderId,
        warehouseId,
        status: 'ready',
        carrier: 'CJ대한통운',
        recipient: payload.recipient,
        createdAt: new Date().toISOString(),
      };
      await publish('shipment.created', eventPayload, { client });
      await client.query('COMMIT');
      return eventPayload;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async shipments(): Promise<any[]> {
    const result = await this.db.query(`SELECT * FROM shipments ORDER BY created_at DESC`);
    return result.rows;
  }

  async updateShipment(id: string, input: any, actorId: string): Promise<any> {
    const current = await this.db.query(`SELECT * FROM shipments WHERE id=$1`, [id]);
    if (!current.rows[0]) return { kind: 'not_found' };
    if (!SHIPMENT_TRANSITIONS[current.rows[0].status]?.includes(input.status)) {
      return { kind: 'invalid' };
    }
    const trackingNumber = input.trackingNumber
      || current.rows[0].tracking_number
      || (input.status === 'shipped' ? `6890${Date.now().toString().slice(-8)}` : null);
    const result = await this.db.query(
      `UPDATE shipments SET
         status=$2::shipment_status,tracking_number=$3,
         shipped_at=CASE WHEN $2::text='shipped' THEN now() ELSE shipped_at END,
         delivered_at=CASE WHEN $2::text='delivered' THEN now() ELSE delivered_at END,
         updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, input.status, trackingNumber],
    );
    await this.db.query(
      `INSERT INTO tracking_events(
        id,shipment_id,status,location,message,occurred_at
      ) VALUES($1,$2,$3,$4,$5,now())`,
      [crypto.randomUUID(), id, input.status, input.location || 'TECHZONE 물류센터',
        input.reason || `배송 상태가 ${input.status}(으)로 변경되었습니다.`],
    );
    await publish(`shipment.${input.status}`, {
      shipmentId: id,
      shipmentNumber: result.rows[0].shipment_number,
      orderId: result.rows[0].order_id,
      status: input.status,
      trackingNumber,
      carrier: result.rows[0].carrier,
      actorId,
    });
    return { kind: 'updated', value: result.rows[0] };
  }

  async returns(): Promise<any[]> {
    const result = await this.db.query(`SELECT * FROM returns ORDER BY requested_at DESC`);
    return result.rows;
  }

  async createReturn(input: any, actorId?: string): Promise<any> {
    const id = crypto.randomUUID();
    const returnNumber = `RET-${Date.now().toString().slice(-9)}`;
    await this.db.query(
      `INSERT INTO returns(
        id,order_id,return_number,status,reason,refund_amount
      ) VALUES($1,$2,$3,'requested',$4,$5)`,
      [id, input.orderId, returnNumber, input.reason, Number(input.refundAmount || 0)],
    );
    await publish('return.requested', {
      returnId: id,
      returnNumber,
      orderId: input.orderId,
      status: 'requested',
      reason: input.reason,
      refundAmount: Number(input.refundAmount || 0),
      ...(actorId ? { actorId } : {}),
    });
    return { id, returnNumber, status: 'requested' };
  }

  async findDeliveredOrder(orderId: string): Promise<any | null> {
    const response = await fetch(
      `${process.env.ORDER_URL || 'http://localhost:3004'}/internal/orders`,
      { headers: this.internalHeaders() },
    );
    if (!response.ok) return null;
    return ((await response.json()) as any).items.find((item: any) => item.id === orderId) || null;
  }

  async updateReturn(id: string, input: any, actorId: string): Promise<any> {
    const current = await this.db.query(`SELECT * FROM returns WHERE id=$1`, [id]);
    if (!current.rows[0]) return { kind: 'not_found' };
    if (!RETURN_TRANSITIONS[current.rows[0].status]?.includes(input.status)) {
      return { kind: 'invalid' };
    }
    const result = await this.db.query(
      `UPDATE returns SET
         status=$2::return_status,
         completed_at=CASE WHEN $2::text IN('refunded','rejected') THEN now() ELSE completed_at END,
         updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, input.status],
    );
    await publish(`return.${input.status}`, {
      returnId: result.rows[0].id,
      returnNumber: result.rows[0].return_number,
      orderId: result.rows[0].order_id,
      status: result.rows[0].status,
      refundAmount: Number(result.rows[0].refund_amount),
      actorId,
      reason: input.reason,
    });
    return { kind: 'updated', value: result.rows[0] };
  }

  async receivedReturn(id: string): Promise<any | null> {
    const result = await this.db.query(
      `SELECT * FROM returns WHERE id=$1 AND status='received'`,
      [id],
    );
    return result.rows[0] || null;
  }

  async completeRefund(id: string, current: any, payload: any, actorId: string): Promise<any> {
    await this.db.query(
      `UPDATE returns SET status='refunded',completed_at=now(),updated_at=now() WHERE id=$1`,
      [id],
    );
    await publish('return.refunded', {
      returnId: id,
      returnNumber: current.return_number,
      orderId: current.order_id,
      status: 'refunded',
      refundAmount: payload.refundAmount,
      actorId,
    });
    return { ...payload, returnId: id };
  }
}
