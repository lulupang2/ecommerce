import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

const crypto = require('node:crypto') as typeof import('node:crypto');
const { database } = require('@techzone/database/db') as { database(service: string): any };
import { orderItems, orders } from './schema';
const { publish, registerReliability } = require('@techzone/messaging/bus') as {
  publish(event: string, payload: Record<string, unknown>, options?: Record<string, unknown>): Promise<void>;
  registerReliability(service: string, database: any): Promise<void>;
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

@Injectable()
export class OrderRepository {
  readonly owner = 'order';
  readonly db = database('orders');

  async initialize(): Promise<void> {
    await this.db.wait();
    await registerReliability('order', this.db);
  }

  async calculateQuote(items: any[], couponCode?: string): Promise<any> {
    if (!Array.isArray(items) || !items.length) {
      throw Object.assign(new Error('INVALID_ITEMS'), { status: 400 });
    }
    const ids = items.map(item => item.variantId).filter(Boolean);
    if (ids.length !== items.length) {
      throw Object.assign(new Error('VARIANT_REQUIRED'), { status: 400 });
    }
    if (new Set(ids).size !== ids.length) {
      throw Object.assign(new Error('DUPLICATE_VARIANT'), { status: 400 });
    }
    const headers = { 'x-internal-key': process.env.INTERNAL_API_KEY || 'techzone-internal' };
    const [response, inventoryResponse] = await Promise.all([
      fetch(
        `${process.env.CATALOG_URL || 'http://localhost:3002'}/internal/variants?ids=${ids.join(',')}`,
        { headers },
      ),
      fetch(
        `${process.env.INVENTORY_URL || 'http://localhost:3006'}/internal/inventory/availability?variantIds=${ids.join(',')}`,
        { headers },
      ),
    ]);
    if (!response.ok) throw Object.assign(new Error('CATALOG_UNAVAILABLE'), { status: 503 });
    if (!inventoryResponse.ok) throw Object.assign(new Error('INVENTORY_UNAVAILABLE'), { status: 503 });
    const [payload, inventoryPayload] = await Promise.all([
      response.json() as Promise<any>,
      inventoryResponse.json() as Promise<any>,
    ]);
    const variants = payload.items || [];
    const availability = new Map(
      (inventoryPayload.items || []).map((item: any) => [
        item.variant_id,
        Number(item.available_qty),
      ]),
    );
    const lines = items.map(item => {
      const variant = variants.find((value: any) => value.variant_id === item.variantId);
      const quantity = Number(item.quantity);
      if (!variant || variant.status !== 'active' || variant.product_status !== 'published') {
        throw Object.assign(new Error('PRODUCT_UNAVAILABLE'), { status: 409 });
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw Object.assign(new Error('INVALID_QUANTITY'), { status: 400 });
      }
      const availableQty = Number(availability.get(item.variantId) || 0);
      if (quantity > availableQty) {
        throw Object.assign(new Error('INSUFFICIENT_STOCK'), {
          status: 409,
          details: { variantId: item.variantId, requestedQty: quantity, availableQty },
        });
      }
      return {
        productId: variant.product_id,
        variantId: variant.variant_id,
        sku: variant.sku,
        name: variant.name,
        brand: variant.brand,
        image: variant.image,
        optionValues: variant.option_values,
        price: Number(variant.sale_price),
        listPrice: Number(variant.list_price),
        quantity,
        availableQty,
      };
    });
    const subtotal = lines.reduce((sum: number, line: any) => sum + line.price * line.quantity, 0);
    let discount = 0;
    let coupon: any = null;
    if (couponCode) {
      const result = await this.db.query(
        `SELECT * FROM coupons
         WHERE upper(code)=upper($1) AND status='active'
           AND (starts_at IS NULL OR starts_at<=now())
           AND (ends_at IS NULL OR ends_at>=now())`,
        [couponCode],
      );
      coupon = result.rows[0];
      if (!coupon) throw Object.assign(new Error('INVALID_COUPON'), { status: 400 });
      if (subtotal < Number(coupon.min_order_amount)) {
        throw Object.assign(new Error('COUPON_MIN_ORDER'), { status: 409 });
      }
      discount = coupon.type === 'percent'
        ? Math.floor(subtotal * Number(coupon.value) / 100)
        : Number(coupon.value);
      if (coupon.max_discount_amount) {
        discount = Math.min(discount, Number(coupon.max_discount_amount));
      }
    }
    const shippingFee = subtotal >= 80_000 ? 0 : 3_000;
    const total = subtotal - discount + shippingFee;
    return {
      lines,
      subtotalAmount: subtotal,
      discountAmount: discount,
      shippingFee,
      taxAmount: Math.round(total / 11),
      totalAmount: total,
      coupon: coupon ? { id: coupon.id, code: coupon.code } : null,
    };
  }

  async couponUsed(couponId: string, ownerId: string): Promise<boolean> {
    const used = await this.db.query(
      `SELECT 1 FROM coupon_redemptions WHERE coupon_id=$1 AND owner_id=$2`,
      [couponId, ownerId],
    );
    return Boolean(used.rows[0]);
  }

  async publicCoupons(): Promise<any[]> {
    const result = await this.db.query(
      `SELECT code,type,value,min_order_amount,max_discount_amount,ends_at
       FROM coupons
       WHERE status='active'
         AND (starts_at IS NULL OR starts_at<=now())
         AND (ends_at IS NULL OR ends_at>=now())
       ORDER BY created_at`,
    );
    return result.rows;
  }

  async adminCoupons(): Promise<any[]> {
    const result = await this.db.query(
      `SELECT c.*,count(r.id)::int redemption_count,
              coalesce(sum(r.discount_amount),0)::int discount_total
       FROM coupons c
       LEFT JOIN coupon_redemptions r ON r.coupon_id=c.id
       GROUP BY c.id ORDER BY c.created_at DESC`,
    );
    return result.rows;
  }

  async createCoupon(input: any): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO coupons(
        id,code,type,value,min_order_amount,max_discount_amount,starts_at,
        ends_at,status,usage_limit,per_customer_limit
      ) VALUES($1,upper($2),$3,$4,$5,$6,$7,$8,$9,$10,1)`,
      [
        id,
        input.code,
        input.type || 'percent',
        Number(input.value),
        Number(input.minOrderAmount || 0),
        input.maxDiscountAmount ? Number(input.maxDiscountAmount) : null,
        input.startsAt || null,
        input.endsAt || null,
        input.status || 'active',
        input.usageLimit ? Number(input.usageLimit) : null,
      ],
    );
    return id;
  }

  async updateCoupon(id: string, input: any): Promise<any | null> {
    const result = await this.db.query(
      `UPDATE coupons SET status=COALESCE($2,status),ends_at=COALESCE($3,ends_at)
       WHERE id=$1 RETURNING *`,
      [id, input.status || null, input.endsAt || null],
    );
    return result.rows[0] || null;
  }

  async createOrder(value: {
    id: string;
    orderNumber: string;
    userId: string;
    items: any[];
    quote: any;
    shipping: any;
    guestOrder: boolean;
    paymentMethod: string;
    payload: any;
  }): Promise<void> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO orders(
          id,user_id,order_number,status,payment_status,fulfillment_status,
          subtotal_amount,discount_amount,shipping_fee,tax_amount,total_amount,
          coupon_code,guest_order,payment_method,recipient,phone,address,memo
        ) VALUES(
          $1,$2,$3,'pending','pending','unfulfilled',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
        )`,
        [
          value.id,
          value.userId,
          value.orderNumber,
          value.quote.subtotalAmount,
          value.quote.discountAmount,
          value.quote.shippingFee,
          value.quote.taxAmount,
          value.quote.totalAmount,
          value.quote.coupon?.code || null,
          value.guestOrder,
          value.paymentMethod,
          value.shipping.recipient,
          value.shipping.phone,
          value.shipping.address,
          value.shipping.memo || null,
        ],
      );
      for (const item of value.items) {
        await client.query(
          `INSERT INTO order_items(
            id,order_id,product_id,variant_id,sku,name,brand,image,unit_price,
            discount_amount,tax_amount,quantity
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11)`,
          [
            crypto.randomUUID(),
            value.id,
            item.productId,
            item.variantId || null,
            item.sku || null,
            item.name,
            item.brand,
            item.image,
            Number(item.price),
            Math.round(Number(item.price) * Number(item.quantity) / 11),
            Number(item.quantity),
          ],
        );
      }
      await client.query(
        `INSERT INTO order_addresses(
          id,order_id,type,recipient,phone,postal_code,address1,address2
        ) VALUES($1,$2,'shipping',$3,$4,$5,$6,$7)`,
        [
          crypto.randomUUID(),
          value.id,
          value.shipping.recipient,
          value.shipping.phone,
          value.shipping.postalCode || null,
          value.shipping.address,
          value.shipping.address2 || null,
        ],
      );
      if (value.quote.coupon) {
        await client.query(
          `INSERT INTO coupon_redemptions(
            id,coupon_id,order_id,owner_id,discount_amount
          ) VALUES($1,$2,$3,$4,$5)`,
          [
            crypto.randomUUID(),
            value.quote.coupon.id,
            value.id,
            value.userId,
            value.quote.discountAmount,
          ],
        );
      }
      await publish('order.created', value.payload, { client });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async guestOrderByNumber(orderNumber: string): Promise<any | null> {
    const result = await this.db.query(
      `SELECT id,order_number,phone FROM orders
       WHERE order_number=$1 AND guest_order=true`,
      [orderNumber],
    );
    return result.rows[0] || null;
  }

  async cancelGuestOrder(id: string, reason: string): Promise<any | null> {
    const result = await this.db.query(
      `UPDATE orders SET status='cancelled',payment_status='cancelled',updated_at=now()
       WHERE id=$1 AND status IN('pending','confirmed') RETURNING *`,
      [id],
    );
    if (!result.rows[0]) return null;
    await publish('order.cancelled', { ...this.orderEvent(result.rows[0]), reason });
    return { id, status: 'cancelled' };
  }

  async list(userId?: string): Promise<any[]> {
    const filter = userId ? eq(orders.userId, userId) : undefined;
    return this.db.orm
      .select({
        id: orders.id,
        order_number: orders.orderNumber,
        user_id: orders.userId,
        status: orders.status,
        payment_status: orders.paymentStatus,
        fulfillment_status: orders.fulfillmentStatus,
        total_amount: orders.totalAmount,
        recipient: orders.recipient,
        created_at: orders.createdAt,
        item_count: sql`count(${orderItems.id})::int`,
        image: sql`min(${orderItems.image})`,
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(filter)
      .groupBy(orders.id)
      .orderBy(desc(orders.createdAt))
      .limit(200);
  }

  async updateStatus(id: string, status: string, actorId: string, reason: string): Promise<any> {
    const current = await this.db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
    if (!current.rows[0]) return { kind: 'not_found' };
    if (
      !ALLOWED_TRANSITIONS[current.rows[0].status]?.includes(status)
      && current.rows[0].status !== status
    ) {
      return { kind: 'invalid', from: current.rows[0].status, to: status };
    }
    const fulfillment = status === 'preparing'
      ? 'ready'
      : status === 'shipped'
        ? 'shipped'
        : status === 'delivered'
          ? 'delivered'
          : current.rows[0].fulfillment_status;
    const result = await this.db.query(
      `UPDATE orders SET status=$2,fulfillment_status=$3,updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, status, fulfillment],
    );
    await publish('order.status_changed', {
      ...this.orderEvent(result.rows[0]),
      actorId,
      reason,
    });
    return { kind: 'updated', id: result.rows[0].id, status: result.rows[0].status };
  }

  async detail(id: string): Promise<any | null> {
    const rows = await this.db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
    if (!rows.rows[0]) return null;
    const [items, saga] = await Promise.all([
      this.db.query(`SELECT * FROM order_items WHERE order_id=$1 ORDER BY id`, [id]),
      this.db.query(
        `SELECT id,step,status,event_id,error_code,error_message,compensation_status,
                metadata,started_at,completed_at
         FROM order_saga_steps WHERE order_id=$1 ORDER BY started_at`,
        [id],
      ),
    ]);
    return { ...rows.rows[0], items: items.rows, sagaTimeline: saga.rows };
  }

  async internalOrders(): Promise<any[]> {
    const result = await this.db.query(
      `SELECT o.*,count(i.id)::int item_count,min(i.image) image
       FROM orders o LEFT JOIN order_items i ON i.order_id=o.id
       GROUP BY o.id ORDER BY o.created_at DESC`,
    );
    return result.rows;
  }

  async orderItems(id: string): Promise<any[]> {
    const result = await this.db.query(`SELECT * FROM order_items WHERE order_id=$1`, [id]);
    return result.rows;
  }

  async purchases(userId: string): Promise<string[]> {
    const result = await this.db.query(
      `SELECT DISTINCT i.product_id
       FROM orders o JOIN order_items i ON i.order_id=o.id
       WHERE o.user_id=$1 AND o.status='delivered'`,
      [userId],
    );
    return result.rows.map((row: any) => row.product_id);
  }

  async handleEvent(event: any): Promise<void> {
    const payload = event.payload;
    const orderId = payload.orderId;
    if (!orderId) return;
    const stepId = await this.recordSaga(orderId, event.type, 'processing', event);
    try {
      if (event.type === 'payment.approved') {
        await this.db.query(
          `UPDATE orders SET payment_status='approved',updated_at=now() WHERE id=$1`,
          [orderId],
        );
        await publish(
          'inventory.reserve',
          { orderId, userId: payload.userId, items: payload.items },
          { causationId: event.id, correlationId: event.correlationId },
        );
      } else if (event.type === 'payment.refunded') {
        await this.db.query(
          `UPDATE orders
           SET payment_status=CASE
             WHEN $2 >= total_amount THEN 'refunded'::payment_status
             ELSE 'partially_refunded'::payment_status END,updated_at=now()
           WHERE id=$1`,
          [orderId, Number(payload.refundAmount)],
        );
      } else if (event.type === 'inventory.reserved') {
        const updated = await this.db.orm
          .update(orders)
          .set({ status: 'confirmed', fulfillmentStatus: 'ready', updatedAt: new Date() })
          .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')))
          .returning({
            userId: orders.userId,
            totalAmount: orders.totalAmount,
            orderNumber: orders.orderNumber,
          });
        if (updated[0]) {
          await publish(
            'order.confirmed',
            {
              orderId,
              userId: updated[0].userId,
              totalAmount: updated[0].totalAmount,
              orderNumber: updated[0].orderNumber,
            },
            { causationId: event.id, correlationId: event.correlationId },
          );
        }
      } else if (event.type === 'inventory.failed') {
        const cancelled = await this.db.orm
          .update(orders)
          .set({ status: 'cancelled', paymentStatus: 'cancelled', updatedAt: new Date() })
          .where(eq(orders.id, orderId))
          .returning({ userId: orders.userId, orderNumber: orders.orderNumber });
        if (cancelled[0]) {
          await publish(
            'order.cancelled',
            {
              orderId,
              userId: cancelled[0].userId,
              orderNumber: cancelled[0].orderNumber,
              reason: payload.reason || 'OUT_OF_STOCK',
            },
            { causationId: event.id, correlationId: event.correlationId },
          );
        }
        await this.completeSaga(stepId, 'compensated', null, 'completed');
        return;
      } else if (event.type === 'shipment.created') {
        await this.transitionFromEvent(orderId, 'preparing', 'ready');
      } else if (event.type === 'shipment.shipped') {
        await this.transitionFromEvent(orderId, 'shipped', 'shipped');
      } else if (event.type === 'shipment.delivered') {
        await this.transitionFromEvent(orderId, 'delivered', 'delivered');
      } else if (event.type === 'return.received') {
        await this.db.query(
          `UPDATE orders SET fulfillment_status='returned',updated_at=now() WHERE id=$1`,
          [orderId],
        );
      }
      await this.completeSaga(stepId, 'completed');
    } catch (error) {
      await this.completeSaga(stepId, 'failed', error);
      throw error;
    }
  }

  private async recordSaga(orderId: string, step: string, status: string, event: any): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO order_saga_steps(id,order_id,step,status,event_id,metadata)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [
        id,
        orderId,
        step,
        status,
        event.id || null,
        {
          correlationId: event.correlationId,
          causationId: event.causationId,
          payload: event.payload || {},
        },
      ],
    );
    return id;
  }

  private async completeSaga(
    id: string,
    status: string,
    error?: any,
    compensationStatus: string | null = null,
  ): Promise<void> {
    await this.db.query(
      `UPDATE order_saga_steps
       SET status=$2,error_code=$3,error_message=$4,compensation_status=$5,completed_at=now()
       WHERE id=$1`,
      [id, status, error?.code || null, error?.message || null, compensationStatus],
    );
  }

  private async transitionFromEvent(
    orderId: string,
    status: string,
    fulfillmentStatus: string,
  ): Promise<void> {
    const result = await this.db.query(
      `UPDATE orders SET status=$2,fulfillment_status=$3,updated_at=now()
       WHERE id=$1 RETURNING *`,
      [orderId, status, fulfillmentStatus],
    );
    if (result.rows[0]) await publish('order.status_changed', this.orderEvent(result.rows[0]));
  }

  private orderEvent(order: any) {
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      userId: order.user_id,
      status: order.status,
      paymentStatus: order.payment_status,
      fulfillmentStatus: order.fulfillment_status,
      totalAmount: Number(order.total_amount),
      recipient: order.recipient,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  }
}
