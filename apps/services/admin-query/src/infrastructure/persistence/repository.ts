import { Injectable } from '@nestjs/common';

const crypto = require('node:crypto') as typeof import('node:crypto');
const { database } = require('@techzone/database/db') as { database(service: string): any };
const { publish, registerReliability } = require('@techzone/messaging/bus') as {
  publish(event: string, payload: Record<string, unknown>, options?: Record<string, unknown>): Promise<any>;
  registerReliability(service: string, database: any): Promise<void>;
};

type ResourceConfig = {
  permission: string;
  table: string;
  search: string[];
  status: string | null;
  date: string;
  sorts: string[];
  warehouse: boolean;
};

const RESOURCES: Record<string, ResourceConfig> = {
  orders: {
    permission: 'orders.read',
    table: 'admin_order_projection',
    search: ['order_number', 'recipient'],
    status: 'status',
    date: 'created_at',
    sorts: ['created_at', 'total_amount', 'order_number', 'status'],
    warehouse: false,
  },
  products: {
    permission: 'products.read',
    table: 'admin_product_projection',
    search: ['name', 'brand', 'sku', 'model_number'],
    status: 'status',
    date: 'created_at',
    sorts: ['created_at', 'price', 'name', 'status'],
    warehouse: false,
  },
  inventory: {
    permission: 'inventory.read',
    table: `(SELECT i.*,p.name,p.sku,p.brand
             FROM admin_inventory_projection i
             LEFT JOIN admin_product_projection p ON p.variant_id=i.variant_id) resource`,
    search: ['warehouse_name', 'warehouse_code', 'name', 'sku', 'brand'],
    status: null,
    date: 'updated_at',
    sorts: ['updated_at', 'available_qty', 'reserved_qty'],
    warehouse: true,
  },
  shipments: {
    permission: 'orders.read',
    table: `(SELECT s.*,o.order_number
             FROM admin_shipment_projection s
             LEFT JOIN admin_order_projection o ON o.order_id=s.order_id) resource`,
    search: ['shipment_number', 'tracking_number', 'recipient', 'order_number'],
    status: 'status',
    date: 'created_at',
    sorts: ['created_at', 'status', 'shipment_number'],
    warehouse: true,
  },
  returns: {
    permission: 'orders.read',
    table: `(SELECT r.*,o.order_number,o.recipient
             FROM admin_return_projection r
             LEFT JOIN admin_order_projection o ON o.order_id=r.order_id) resource`,
    search: ['return_number', 'reason', 'order_number', 'recipient'],
    status: 'status',
    date: 'requested_at',
    sorts: ['requested_at', 'status', 'refund_amount'],
    warehouse: false,
  },
  'purchase-orders': {
    permission: 'inventory.read',
    table: 'admin_purchase_order_projection',
    search: ['purchase_order_number', 'supplier_name'],
    status: 'status',
    date: 'created_at',
    sorts: ['created_at', 'status', 'total_amount'],
    warehouse: true,
  },
  members: {
    permission: 'members.read',
    table: 'admin_member_projection',
    search: ['name', 'email'],
    status: 'status',
    date: 'created_at',
    sorts: ['created_at', 'name', 'status'],
    warehouse: false,
  },
  reviews: {
    permission: 'reviews.update',
    table: 'admin_review_projection',
    search: ['user_name', 'body'],
    status: 'status',
    date: 'created_at',
    sorts: ['created_at', 'rating', 'status'],
    warehouse: false,
  },
  'audit-logs': {
    permission: 'audit.read',
    table: 'admin_audit_logs',
    search: ['action', 'entity_type', 'entity_id', 'reason'],
    status: null,
    date: 'occurred_at',
    sorts: ['occurred_at', 'action'],
    warehouse: false,
  },
  'dead-letters': {
    permission: 'admin.manage',
    table: 'admin_dead_letters',
    search: ['service', 'event_type', 'error'],
    status: 'status',
    date: 'created_at',
    sorts: ['created_at', 'service', 'event_type', 'status'],
    warehouse: false,
  },
};

@Injectable()
export class AdminQueryRepository {
  readonly owner = 'admin-query';
  readonly db = database('admin');
  private readonly internalKey = process.env.INTERNAL_API_KEY || 'techzone-internal';
  private readonly serviceUrls: Record<string, string> = {
    auth: process.env.AUTH_URL || 'http://localhost:3001',
    catalog: process.env.CATALOG_URL || 'http://localhost:3002',
    order: process.env.ORDER_URL || 'http://localhost:3004',
    payment: process.env.PAYMENT_URL || 'http://localhost:3005',
    inventory: process.env.INVENTORY_URL || 'http://localhost:3006',
    fulfillment: process.env.FULFILLMENT_URL || 'http://localhost:3010',
    procurement: process.env.PROCUREMENT_URL || 'http://localhost:3011',
  };

  async initialize(): Promise<void> {
    await this.db.wait();
    await registerReliability('admin', this.db);
  }

  permissionFor(resource: string): string | null {
    return RESOURCES[resource]?.permission || null;
  }

  async projectEvent(event: any): Promise<void> {
    const inserted = await this.db.query(
      `INSERT INTO processed_events(event_id,event_type) VALUES($1,$2)
       ON CONFLICT(event_id) DO NOTHING RETURNING event_id`,
      [event.id, event.type],
    );
    if (!inserted.rows[0]) return;
    const payload = event.payload || {};
    if (event.type.startsWith('product.')) await this.projectProduct(payload);
    else if (['order.created', 'order.status_changed', 'order.confirmed', 'order.cancelled'].includes(event.type)) {
      await this.projectOrder(payload);
    } else if (event.type.startsWith('payment.')) await this.projectPayment(payload);
    else if (event.type.startsWith('inventory.')) await this.projectInventory(payload);
    else if (event.type.startsWith('shipment.')) await this.projectShipment(payload);
    else if (event.type.startsWith('return.')) await this.projectReturn(payload);
    else if (event.type.startsWith('purchase_order.')) await this.projectPurchaseOrder(payload);
    else if (event.type === 'system.dead_lettered') await this.projectDeadLetter(payload);
    if (payload.actorId || event.type === 'admin.action' || event.type === 'admin.role_changed') {
      await this.audit(event.type, payload);
    }
  }

  private async projectDeadLetter(payload: any): Promise<void> {
    const original = payload.event || {};
    if (!original.id || !original.type) return;
    await this.db.query(
      `INSERT INTO admin_dead_letters(
        id,service,event_id,event_type,envelope,error,retry_count
      ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [crypto.randomUUID(), payload.service, original.id, original.type, original,
        payload.error || 'Unknown consumer error', Number(payload.retryCount || 0)],
    );
  }

  private async projectProduct(payload: any): Promise<void> {
    if (!payload.productId || !payload.name) return;
    await this.db.query(
      `INSERT INTO admin_product_projection(
        product_id,variant_id,sku,name,brand,category,price,cost_price,status,
        image,display_stock,created_at,updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::timestamptz,now()),now())
       ON CONFLICT(product_id) DO UPDATE SET
         variant_id=EXCLUDED.variant_id,sku=EXCLUDED.sku,name=EXCLUDED.name,
         brand=EXCLUDED.brand,category=EXCLUDED.category,price=EXCLUDED.price,
         cost_price=EXCLUDED.cost_price,status=EXCLUDED.status,image=EXCLUDED.image,
         display_stock=EXCLUDED.display_stock,updated_at=now()`,
      [payload.productId, payload.variantId || null, payload.sku || null, payload.name,
        payload.brand, payload.category, Number(payload.price || 0),
        Number(payload.costPrice || 0), payload.status, payload.image,
        Number(payload.stock || 0), payload.createdAt || null],
    );
  }

  private async projectOrder(payload: any): Promise<void> {
    if (!payload.orderId) return;
    const existing = await this.db.query(
      `SELECT * FROM admin_order_projection WHERE order_id=$1`,
      [payload.orderId],
    );
    const current = existing.rows[0] || {};
    await this.db.query(
      `INSERT INTO admin_order_projection(
        order_id,order_number,user_id,status,payment_status,fulfillment_status,
        total_amount,discount_amount,recipient,created_at,updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz,now()),
        COALESCE($11::timestamptz,now()))
       ON CONFLICT(order_id) DO UPDATE SET
         order_number=COALESCE(EXCLUDED.order_number,admin_order_projection.order_number),
         user_id=COALESCE(EXCLUDED.user_id,admin_order_projection.user_id),
         status=COALESCE(EXCLUDED.status,admin_order_projection.status),
         payment_status=COALESCE(EXCLUDED.payment_status,admin_order_projection.payment_status),
         fulfillment_status=COALESCE(EXCLUDED.fulfillment_status,admin_order_projection.fulfillment_status),
         total_amount=CASE WHEN EXCLUDED.total_amount>0
           THEN EXCLUDED.total_amount ELSE admin_order_projection.total_amount END,
         recipient=COALESCE(EXCLUDED.recipient,admin_order_projection.recipient),
         updated_at=now()`,
      [payload.orderId, payload.orderNumber || current.order_number || null,
        payload.userId || current.user_id || null,
        payload.status || (payload.reason ? 'cancelled' : current.status) || null,
        payload.paymentStatus || current.payment_status || null,
        payload.fulfillmentStatus || current.fulfillment_status || null,
        Number(payload.totalAmount || current.total_amount || 0),
        Number(payload.discountAmount || current.discount_amount || 0),
        payload.recipient || current.recipient || null,
        payload.createdAt || current.created_at || null, payload.updatedAt || null],
    );
    if (Array.isArray(payload.items)) {
      for (const item of payload.items) {
        const id = item.id || this.stableUuid(
          `${payload.orderId}:${item.variantId || item.productId}`,
        );
        await this.db.query(
          `INSERT INTO admin_order_item_projection(
            id,order_id,product_id,variant_id,sku,name,brand,unit_price,quantity
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT(id) DO UPDATE SET
             unit_price=EXCLUDED.unit_price,quantity=EXCLUDED.quantity`,
          [id, payload.orderId, item.productId, item.variantId || null, item.sku || null,
            item.name, item.brand, Number(item.price || item.unit_price || 0),
            Number(item.quantity || 0)],
        );
      }
    }
  }

  private async projectPayment(payload: any): Promise<void> {
    if (!payload.orderId) return;
    const current = await this.db.query(
      `SELECT * FROM admin_payment_projection WHERE order_id=$1`,
      [payload.orderId],
    );
    const item = current.rows[0] || {};
    const refunded = Number(
      payload.refundedAmount || payload.refundAmount || item.refunded_amount || 0,
    );
    const status = payload.status || (payload.refundAmount
      ? (refunded >= Number(item.amount || 0) ? 'refunded' : 'partially_refunded')
      : 'approved');
    await this.db.query(
      `INSERT INTO admin_payment_projection(
        payment_id,order_id,status,amount,refunded_amount,provider,approved_at
      ) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now()))
       ON CONFLICT(order_id) DO UPDATE SET
         status=EXCLUDED.status,
         amount=CASE WHEN EXCLUDED.amount>0
           THEN EXCLUDED.amount ELSE admin_payment_projection.amount END,
         refunded_amount=EXCLUDED.refunded_amount,
         provider=COALESCE(EXCLUDED.provider,admin_payment_projection.provider)`,
      [payload.paymentId || item.payment_id || this.stableUuid(`payment:${payload.orderId}`),
        payload.orderId, status, Number(payload.totalAmount || item.amount || 0),
        refunded, payload.provider || item.provider || 'mock', payload.approvedAt || null],
    );
    await this.db.query(
      `UPDATE admin_order_projection SET payment_status=$2,updated_at=now()
       WHERE order_id=$1`,
      [payload.orderId, status],
    );
  }

  private async projectInventory(payload: any): Promise<void> {
    if (!payload.variantId && !payload.productId) return;
    const existing = await this.db.query(
      `SELECT * FROM admin_inventory_projection
       WHERE (variant_id=$1 OR product_id=$2)
         AND ($3::uuid IS NULL OR warehouse_id=$3) LIMIT 1`,
      [payload.variantId || payload.productId, payload.productId || null,
        payload.warehouseId || null],
    );
    if (!existing.rows[0]) return;
    await this.db.query(
      `UPDATE admin_inventory_projection SET
         available_qty=COALESCE($2,available_qty),
         reserved_qty=COALESCE($3,reserved_qty),updated_at=now()
       WHERE balance_id=$1`,
      [existing.rows[0].balance_id, payload.availableQty ?? null,
        payload.reservedQty ?? null],
    );
  }

  private async projectShipment(payload: any): Promise<void> {
    if (!payload.shipmentId) return;
    await this.db.query(
      `INSERT INTO admin_shipment_projection(
        shipment_id,order_id,shipment_number,warehouse_id,carrier,tracking_number,
        status,recipient,shipped_at,delivered_at,created_at,updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz,now()),now())
       ON CONFLICT(shipment_id) DO UPDATE SET
         carrier=COALESCE(EXCLUDED.carrier,admin_shipment_projection.carrier),
         tracking_number=COALESCE(EXCLUDED.tracking_number,admin_shipment_projection.tracking_number),
         status=EXCLUDED.status,
         shipped_at=COALESCE(EXCLUDED.shipped_at,admin_shipment_projection.shipped_at),
         delivered_at=COALESCE(EXCLUDED.delivered_at,admin_shipment_projection.delivered_at),
         updated_at=now()`,
      [payload.shipmentId, payload.orderId, payload.shipmentNumber,
        payload.warehouseId || null, payload.carrier, payload.trackingNumber || null,
        payload.status || 'ready', payload.recipient || null, payload.shippedAt || null,
        payload.deliveredAt || null, payload.createdAt || null],
    );
    if (payload.orderId) {
      await this.db.query(
        `UPDATE admin_order_projection SET
           fulfillment_status=$2,
           status=CASE WHEN $2='shipped' THEN 'shipped'
             WHEN $2='delivered' THEN 'delivered'
             WHEN $2 IN('ready','packed') THEN 'preparing' ELSE status END,
           updated_at=now()
         WHERE order_id=$1`,
        [payload.orderId, payload.status],
      );
    }
  }

  private async projectReturn(payload: any): Promise<void> {
    if (!payload.returnId) return;
    await this.db.query(
      `INSERT INTO admin_return_projection(
        return_id,order_id,return_number,status,reason,refund_amount,
        requested_at,completed_at,updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now()),$8,now())
       ON CONFLICT(return_id) DO UPDATE SET
         status=EXCLUDED.status,
         refund_amount=CASE WHEN EXCLUDED.refund_amount>0
           THEN EXCLUDED.refund_amount ELSE admin_return_projection.refund_amount END,
         completed_at=COALESCE(EXCLUDED.completed_at,admin_return_projection.completed_at),
         updated_at=now()`,
      [payload.returnId, payload.orderId, payload.returnNumber,
        payload.status || 'requested', payload.reason || null,
        Number(payload.refundAmount || 0), payload.requestedAt || null,
        payload.completedAt || null],
    );
  }

  private async projectPurchaseOrder(payload: any): Promise<void> {
    if (!payload.purchaseOrderId) return;
    await this.db.query(
      `INSERT INTO admin_purchase_order_projection(
        purchase_order_id,purchase_order_number,supplier_id,warehouse_id,status,
        total_amount,expected_at,created_at,updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,now(),now())
       ON CONFLICT(purchase_order_id) DO UPDATE SET
         status=EXCLUDED.status,
         total_amount=CASE WHEN EXCLUDED.total_amount>0
           THEN EXCLUDED.total_amount ELSE admin_purchase_order_projection.total_amount END,
         updated_at=now()`,
      [payload.purchaseOrderId, payload.purchaseOrderNumber,
        payload.supplierId || null, payload.warehouseId || null,
        payload.status || 'draft', Number(payload.totalAmount || 0),
        payload.expectedAt || null],
    );
  }

  async audit(action: string, payload: any): Promise<void> {
    await this.db.query(
      `INSERT INTO admin_audit_logs(
        id,actor_id,action,entity_type,entity_id,reason,metadata,occurred_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,now())`,
      [crypto.randomUUID(), payload.actorId || null, action,
        payload.entityType || action.split('.')[0],
        String(payload.entityId || payload.orderId || payload.productId
          || payload.shipmentId || payload.returnId || payload.purchaseOrderId
          || payload.userId || ''),
        payload.reason || null, JSON.stringify(payload.metadata || payload)],
    );
  }

  private stableUuid(value: string): string {
    const bytes = crypto.createHash('md5').update(value).digest('hex');
    return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-4${bytes.slice(13, 16)}-a${bytes.slice(17, 20)}-${bytes.slice(20, 32)}`;
  }

  async fetchInternal(service: string, path: string): Promise<any> {
    const response = await fetch(`${this.serviceUrls[service]}${path}`, {
      headers: { 'x-internal-key': this.internalKey },
    });
    if (!response.ok) throw new Error(`${service}${path}: ${response.status}`);
    return response.json();
  }

  async rebuild(): Promise<any> {
    const [
      products, ordersData, payments, inventory, shipments, returnsData,
      purchaseOrders, members, reviews,
    ] = await Promise.all([
      this.fetchInternal('catalog', '/internal/products'),
      this.fetchInternal('order', '/internal/orders'),
      this.fetchInternal('payment', '/internal/payments'),
      this.fetchInternal('inventory', '/internal/inventory'),
      this.fetchInternal('fulfillment', '/internal/shipments'),
      this.fetchInternal('fulfillment', '/internal/returns'),
      this.fetchInternal('procurement', '/internal/purchase-orders'),
      this.fetchInternal('auth', '/internal/users'),
      this.fetchInternal('catalog', '/internal/reviews'),
    ]);
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      for (const table of [
        'admin_product_projection', 'admin_order_item_projection',
        'admin_order_projection', 'admin_payment_projection',
        'admin_inventory_projection', 'admin_shipment_projection',
        'admin_return_projection', 'admin_purchase_order_projection',
        'admin_member_projection', 'admin_review_projection',
      ]) await client.query(`TRUNCATE TABLE ${table}`);
      for (const item of products.items || []) {
        await client.query(
          `INSERT INTO admin_product_projection(
            product_id,variant_id,sku,model_number,name,brand,category,price,
            cost_price,status,image,display_stock,created_at,updated_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [item.id, item.variant_id, item.sku, item.model_number, item.name,
            item.brand, item.category, Number(item.price), Number(item.cost_price || 0),
            item.status, item.image, Number(item.stock || 0), item.created_at, item.created_at],
        );
      }
      for (const item of ordersData.items || []) {
        await client.query(
          `INSERT INTO admin_order_projection(
            order_id,order_number,user_id,status,payment_status,fulfillment_status,
            total_amount,discount_amount,recipient,created_at,updated_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [item.id, item.order_number, item.user_id, item.status, item.payment_status,
            item.fulfillment_status, Number(item.total_amount),
            Number(item.discount_amount || 0), item.recipient, item.created_at, item.updated_at],
        );
        const detail = await this.fetchInternal('order', `/internal/orders/${item.id}/items`);
        for (const row of detail.items || []) {
          await client.query(
            `INSERT INTO admin_order_item_projection(
              id,order_id,product_id,variant_id,sku,name,brand,unit_price,quantity
            ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [row.id, row.order_id, row.product_id, row.variant_id, row.sku,
              row.name, row.brand, Number(row.unit_price), Number(row.quantity)],
          );
        }
      }
      for (const item of payments.items || []) {
        await client.query(
          `INSERT INTO admin_payment_projection(
            payment_id,order_id,status,amount,refunded_amount,provider,approved_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [item.id, item.order_id, item.status, Number(item.amount),
            Number(item.refunded_amount || 0), item.provider, item.approved_at],
        );
      }
      for (const item of inventory.items || []) {
        await client.query(
          `INSERT INTO admin_inventory_projection(
            balance_id,warehouse_id,warehouse_code,warehouse_name,product_id,
            variant_id,available_qty,reserved_qty,damaged_qty,incoming_qty,
            safety_qty,reorder_qty,updated_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [item.id, item.warehouse_id, item.warehouse_code, item.warehouse_name,
            item.product_id, item.variant_id, Number(item.available_qty),
            Number(item.reserved_qty), Number(item.damaged_qty), Number(item.incoming_qty),
            Number(item.safety_qty || 5), Number(item.reorder_qty || 20), item.updated_at],
        );
      }
      for (const item of shipments.items || []) {
        await client.query(
          `INSERT INTO admin_shipment_projection(
            shipment_id,order_id,shipment_number,warehouse_id,carrier,tracking_number,
            status,recipient,shipped_at,delivered_at,created_at,updated_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [item.id, item.order_id, item.shipment_number, item.warehouse_id,
            item.carrier, item.tracking_number, item.status, item.recipient,
            item.shipped_at, item.delivered_at, item.created_at, item.updated_at],
        );
      }
      for (const item of returnsData.items || []) {
        await client.query(
          `INSERT INTO admin_return_projection(
            return_id,order_id,return_number,status,reason,refund_amount,
            requested_at,completed_at,updated_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [item.id, item.order_id, item.return_number, item.status, item.reason,
            Number(item.refund_amount), item.requested_at, item.completed_at, item.updated_at],
        );
      }
      for (const item of purchaseOrders.items || []) {
        await client.query(
          `INSERT INTO admin_purchase_order_projection(
            purchase_order_id,purchase_order_number,supplier_id,supplier_name,
            warehouse_id,status,total_amount,item_count,outstanding_qty,
            expected_at,created_at,updated_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [item.id, item.purchase_order_number, item.supplier_id, item.supplier_name,
            item.warehouse_id, item.status, Number(item.total_amount),
            Number(item.item_count || 0), Number(item.outstanding_qty || 0),
            item.expected_at, item.created_at, item.updated_at],
        );
      }
      for (const item of members.items || []) {
        await client.query(
          `INSERT INTO admin_member_projection(
            user_id,email,name,role,status,created_at
          ) VALUES($1,$2,$3,$4,$5,$6)`,
          [item.id, item.email, item.name, item.role, item.status || 'active', item.createdAt],
        );
      }
      for (const item of reviews.items || []) {
        await client.query(
          `INSERT INTO admin_review_projection(
            review_id,product_id,user_name,rating,body,status,created_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [item.id, item.product_id, item.user_name, Number(item.rating),
            item.body, item.status, item.created_at],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return {
      products: products.items.length,
      orders: ordersData.items.length,
      inventory: inventory.items.length,
      shipments: shipments.items.length,
      returns: returnsData.items.length,
      purchaseOrders: purchaseOrders.items.length,
    };
  }

  async dashboard(from: Date, to: Date): Promise<any> {
    const previousFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
    const [summary, previous, refund, operations, trend, funnel, categorySales,
      brandSales, recentOrders, riskInventory] = await Promise.all([
      this.db.query(
        `SELECT count(*) FILTER(WHERE status<>'cancelled')::int orders,
                COALESCE(sum(total_amount) FILTER(WHERE status<>'cancelled'),0)::int gross_sales,
                COALESCE(avg(total_amount) FILTER(WHERE status<>'cancelled'),0)::int average_order_value,
                count(*) FILTER(WHERE status='cancelled')::int cancelled
         FROM admin_order_projection WHERE created_at BETWEEN $1 AND $2`,
        [from, to],
      ),
      this.db.query(
        `SELECT count(*) FILTER(WHERE status<>'cancelled')::int orders,
                COALESCE(sum(total_amount) FILTER(WHERE status<>'cancelled'),0)::int gross_sales
         FROM admin_order_projection WHERE created_at BETWEEN $1 AND $2`,
        [previousFrom, from],
      ),
      this.db.query(
        `SELECT COALESCE(sum(refunded_amount),0)::int refunded,
                count(*) FILTER(WHERE status IN('partially_refunded','refunded'))::int refund_count,
                count(*) FILTER(WHERE status='approved')::int approved,count(*)::int total
         FROM admin_payment_projection WHERE approved_at BETWEEN $1 AND $2`,
        [from, to],
      ),
      this.db.query(
        `SELECT
          (SELECT count(*)::int FROM admin_shipment_projection
           WHERE status IN('ready','packed') AND created_at<now()-interval '24 hours') delayed_shipments,
          (SELECT count(*)::int FROM admin_inventory_projection
           WHERE available_qty<=safety_qty) inventory_risk,
          (SELECT count(*)::int FROM admin_return_projection
           WHERE status IN('requested','approved','received')) pending_returns,
          (SELECT count(*)::int FROM admin_purchase_order_projection
           WHERE status IN('draft','approved','partially_received')) open_purchase_orders`,
      ),
      this.db.query(
        `SELECT to_char(day,'MM.DD') label,day::date date,
                COALESCE(count(o.order_id) FILTER(WHERE o.status<>'cancelled'),0)::int orders,
                COALESCE(sum(o.total_amount) FILTER(WHERE o.status<>'cancelled'),0)::int revenue
         FROM generate_series($1::date,$2::date,'1 day') day
         LEFT JOIN admin_order_projection o ON o.created_at::date=day::date
         GROUP BY day ORDER BY day`,
        [from, to],
      ),
      this.db.query(
        `SELECT status,count(*)::int value FROM admin_order_projection
         WHERE created_at BETWEEN $1 AND $2 GROUP BY status ORDER BY status`,
        [from, to],
      ),
      this.db.query(
        `SELECT COALESCE(p.category,'기타') name,
                sum(i.unit_price*i.quantity)::int value
         FROM admin_order_item_projection i
         JOIN admin_order_projection o ON o.order_id=i.order_id
         LEFT JOIN admin_product_projection p ON p.product_id=i.product_id
         WHERE o.created_at BETWEEN $1 AND $2 AND o.status<>'cancelled'
         GROUP BY p.category ORDER BY value DESC LIMIT 6`,
        [from, to],
      ),
      this.db.query(
        `SELECT COALESCE(i.brand,'기타') name,sum(i.unit_price*i.quantity)::int value
         FROM admin_order_item_projection i
         JOIN admin_order_projection o ON o.order_id=i.order_id
         WHERE o.created_at BETWEEN $1 AND $2 AND o.status<>'cancelled'
         GROUP BY i.brand ORDER BY value DESC LIMIT 6`,
        [from, to],
      ),
      this.db.query(`SELECT * FROM admin_order_projection ORDER BY created_at DESC LIMIT 6`),
      this.db.query(
        `SELECT i.*,p.name,p.sku FROM admin_inventory_projection i
         LEFT JOIN admin_product_projection p ON p.variant_id=i.variant_id
         WHERE i.available_qty<=i.safety_qty ORDER BY i.available_qty LIMIT 8`,
      ),
    ]);
    const current = summary.rows[0];
    const prior = previous.rows[0];
    const refunds = refund.rows[0];
    const ops = operations.rows[0];
    const change = (value: number, old: number) => old
      ? Math.round(((value - old) / old) * 1000) / 10
      : value ? 100 : 0;
    return {
      range: { from, to },
      kpis: {
        grossSales: {
          value: current.gross_sales,
          change: change(current.gross_sales, prior.gross_sales),
        },
        netSales: {
          value: current.gross_sales - refunds.refunded,
          change: change(current.gross_sales - refunds.refunded, prior.gross_sales),
        },
        orders: { value: current.orders, change: change(current.orders, prior.orders) },
        averageOrderValue: {
          value: current.average_order_value,
          change: change(
            current.average_order_value,
            prior.orders ? Math.round(prior.gross_sales / prior.orders) : 0,
          ),
        },
        refundRate: {
          value: refunds.total
            ? Math.round((refunds.refund_count / refunds.total) * 1000) / 10 : 0,
        },
        approvalRate: {
          value: refunds.total
            ? Math.round((refunds.approved / refunds.total) * 1000) / 10 : 0,
        },
        delayedShipments: { value: ops.delayed_shipments },
        inventoryRisk: { value: ops.inventory_risk },
      },
      queues: {
        pendingReturns: ops.pending_returns,
        openPurchaseOrders: ops.open_purchase_orders,
        delayedShipments: ops.delayed_shipments,
        inventoryRisk: ops.inventory_risk,
      },
      trend: trend.rows,
      funnel: funnel.rows,
      categorySales: categorySales.rows,
      brandSales: brandSales.rows,
      recentOrders: recentOrders.rows,
      riskInventory: riskInventory.rows,
    };
  }

  async listResource(resource: string, query: any): Promise<any | null> {
    const config = RESOURCES[resource];
    if (!config) return null;
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize || 20)));
    const params: unknown[] = [];
    const where: string[] = [];
    if (query.q) {
      params.push(`%${query.q}%`);
      where.push(`(${config.search.map(column => `${column} ILIKE $${params.length}`).join(' OR ')})`);
    }
    if (config.status && query.status && query.status !== 'all') {
      params.push(query.status);
      where.push(`${config.status}=$${params.length}`);
    }
    if (query.from) {
      params.push(query.from);
      where.push(`${config.date} >= $${params.length}::date`);
    }
    if (query.to) {
      params.push(query.to);
      where.push(`${config.date} < ($${params.length}::date + interval '1 day')`);
    }
    if (query.warehouseId && config.warehouse) {
      params.push(query.warehouseId);
      where.push(`warehouse_id=$${params.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sort = config.sorts.includes(query.sort) ? query.sort : config.date;
    const direction = query.direction === 'asc' ? 'ASC' : 'DESC';
    const count = await this.db.query(
      `SELECT count(*)::int total FROM ${config.table} ${clause}`,
      params,
    );
    params.push(pageSize, (page - 1) * pageSize);
    const rows = await this.db.query(
      `SELECT * FROM ${config.table} ${clause}
       ORDER BY ${sort} ${direction} NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      items: rows.rows,
      page,
      pageSize,
      total: count.rows[0].total,
      pageCount: Math.max(1, Math.ceil(count.rows[0].total / pageSize)),
    };
  }

  async alerts(): Promise<any[]> {
    const [inventory, shipping] = await Promise.all([
      this.db.query(
        `SELECT 'inventory' type,'재고 부족' title,
                p.name||' · '||i.warehouse_name message,'high' severity,
                i.product_id entity_id
         FROM admin_inventory_projection i
         LEFT JOIN admin_product_projection p ON p.variant_id=i.variant_id
         WHERE i.available_qty<=i.safety_qty ORDER BY i.available_qty LIMIT 20`,
      ),
      this.db.query(
        `SELECT 'shipment' type,'출고 지연' title,
                shipment_number||' · '||recipient message,'medium' severity,
                shipment_id entity_id
         FROM admin_shipment_projection
         WHERE status IN('ready','packed') AND created_at<now()-interval '24 hours'
         ORDER BY created_at LIMIT 20`,
      ),
    ]);
    return [...inventory.rows, ...shipping.rows];
  }

  async roles(authorization: string): Promise<{ status: number; body: string }> {
    const response = await fetch(`${this.serviceUrls.auth}/auth/roles`, {
      headers: { authorization },
    });
    return { status: response.status, body: await response.text() };
  }

  async reprocessDeadLetter(id: string, actorId: string, reason?: string): Promise<any | null> {
    const result = await this.db.query(
      `UPDATE admin_dead_letters
       SET status='reprocessed',resolved_at=now(),resolved_by=$2
       WHERE id=$1 AND status='pending' RETURNING *`,
      [id, actorId],
    );
    if (!result.rows[0]) return null;
    const original = result.rows[0].envelope;
    const replay = await publish(original.type, original.payload, {
      correlationId: original.correlationId,
      causationId: original.id,
      actorId,
    });
    await this.audit('admin.dead_letter_reprocessed', {
      actorId,
      entityType: 'dead_letter',
      entityId: id,
      reason,
      metadata: { originalEventId: original.id, replayEventId: replay.id },
    });
    return { id, status: 'reprocessed', replayEventId: replay.id };
  }

  async discardDeadLetter(id: string, actorId: string, reason?: string): Promise<any | null> {
    const result = await this.db.query(
      `UPDATE admin_dead_letters
       SET status='discarded',resolved_at=now(),resolved_by=$2
       WHERE id=$1 AND status='pending' RETURNING id`,
      [id, actorId],
    );
    if (!result.rows[0]) return null;
    await this.audit('admin.dead_letter_discarded', {
      actorId,
      entityType: 'dead_letter',
      entityId: id,
      reason: reason || '관리자 폐기',
    });
    return { id, status: 'discarded' };
  }

  async systemStatus(): Promise<any> {
    const [deadLetters, outbox, processed] = await Promise.all([
      this.db.query(`SELECT count(*)::int count FROM admin_dead_letters WHERE status='pending'`),
      this.db.query(
        `SELECT count(*)::int count,
                COALESCE(EXTRACT(EPOCH FROM (now()-min(occurred_at))),0)::int oldest_seconds
         FROM outbox_events WHERE published_at IS NULL`,
      ),
      this.db.query(
        `SELECT count(*)::int count FROM inbox_events
         WHERE processed_at>now()-interval '24 hours'`,
      ),
    ]);
    return {
      service: 'admin-query',
      status: Number(outbox.rows[0].oldest_seconds) > 300 ? 'degraded' : 'healthy',
      pendingDeadLetters: deadLetters.rows[0].count,
      pendingOutbox: outbox.rows[0].count,
      oldestOutboxSeconds: outbox.rows[0].oldest_seconds,
      processedEvents24h: processed.rows[0].count,
      traceUrl: process.env.GRAFANA_URL || 'http://localhost:13000',
    };
  }
}
