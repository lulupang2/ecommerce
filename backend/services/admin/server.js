const { database } = require('../../shared/db');
const { server, listen } = require('../../shared/http');
const { publish, subscribe, registerReliability } = require('../../shared/bus');
const { requireAuth, requireCsrf, requireRole, requirePermission } = require('../../shared/auth');

const db = database('admin');
const app = server('admin');
const internalKey = process.env.INTERNAL_API_KEY || 'techzone-internal';
const serviceUrls = {
  auth: process.env.AUTH_URL || 'http://localhost:3001',
  catalog: process.env.CATALOG_URL || 'http://localhost:3002',
  order: process.env.ORDER_URL || 'http://localhost:3004',
  payment: process.env.PAYMENT_URL || 'http://localhost:3005',
  inventory: process.env.INVENTORY_URL || 'http://localhost:3006',
  fulfillment: process.env.FULFILLMENT_URL || 'http://localhost:3010',
  procurement: process.env.PROCUREMENT_URL || 'http://localhost:3011',
};

async function init() {
  await db.wait();
  await registerReliability('admin', db);
  await createTables();
  await subscribe('admin', ['product.*', 'order.*', 'payment.*', 'inventory.*', 'shipment.*', 'return.*', 'purchase_order.*', 'admin.*', 'user.*', 'system.*'], projectEvent);
  setTimeout(() => rebuild().catch(error => console.warn('admin rebuild retry:', error.message)), 3000);
}
async function createTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS processed_events(event_id UUID PRIMARY KEY,event_type TEXT NOT NULL,processed_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_product_projection(product_id UUID PRIMARY KEY,variant_id UUID,sku TEXT,model_number TEXT,name TEXT NOT NULL,brand TEXT,category TEXT,price INTEGER NOT NULL DEFAULT 0,cost_price INTEGER NOT NULL DEFAULT 0,status TEXT,image TEXT,display_stock INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_order_projection(order_id UUID PRIMARY KEY,order_number TEXT UNIQUE,user_id UUID,status TEXT,payment_status TEXT,fulfillment_status TEXT,total_amount INTEGER NOT NULL DEFAULT 0,discount_amount INTEGER NOT NULL DEFAULT 0,recipient TEXT,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ)`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_order_item_projection(id UUID PRIMARY KEY,order_id UUID NOT NULL,product_id UUID,variant_id UUID,sku TEXT,name TEXT,brand TEXT,unit_price INTEGER NOT NULL DEFAULT 0,quantity INTEGER NOT NULL DEFAULT 0)`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_inventory_projection(balance_id UUID PRIMARY KEY,warehouse_id UUID,warehouse_code TEXT,warehouse_name TEXT,product_id UUID,variant_id UUID,available_qty INTEGER NOT NULL DEFAULT 0,reserved_qty INTEGER NOT NULL DEFAULT 0,damaged_qty INTEGER NOT NULL DEFAULT 0,incoming_qty INTEGER NOT NULL DEFAULT 0,safety_qty INTEGER NOT NULL DEFAULT 5,reorder_qty INTEGER NOT NULL DEFAULT 20,updated_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_payment_projection(payment_id UUID PRIMARY KEY,order_id UUID UNIQUE,status TEXT,amount INTEGER NOT NULL DEFAULT 0,refunded_amount INTEGER NOT NULL DEFAULT 0,provider TEXT,approved_at TIMESTAMPTZ)`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_shipment_projection(shipment_id UUID PRIMARY KEY,order_id UUID UNIQUE,shipment_number TEXT,warehouse_id UUID,carrier TEXT,tracking_number TEXT,status TEXT,recipient TEXT,shipped_at TIMESTAMPTZ,delivered_at TIMESTAMPTZ,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ)`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_return_projection(return_id UUID PRIMARY KEY,order_id UUID,return_number TEXT,status TEXT,reason TEXT,refund_amount INTEGER NOT NULL DEFAULT 0,requested_at TIMESTAMPTZ,completed_at TIMESTAMPTZ,updated_at TIMESTAMPTZ)`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_purchase_order_projection(purchase_order_id UUID PRIMARY KEY,purchase_order_number TEXT,supplier_id UUID,supplier_name TEXT,warehouse_id UUID,status TEXT,total_amount INTEGER NOT NULL DEFAULT 0,item_count INTEGER NOT NULL DEFAULT 0,outstanding_qty INTEGER NOT NULL DEFAULT 0,expected_at TIMESTAMPTZ,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ)`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_member_projection(user_id UUID PRIMARY KEY,email TEXT,name TEXT,role TEXT,admin_role TEXT,status TEXT,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_review_projection(review_id UUID PRIMARY KEY,product_id UUID,user_name TEXT,rating INTEGER,body TEXT,status TEXT,created_at TIMESTAMPTZ)`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_audit_logs(id UUID PRIMARY KEY,actor_id UUID,action TEXT NOT NULL,entity_type TEXT,entity_id TEXT,reason TEXT,metadata JSONB NOT NULL DEFAULT '{}',occurred_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_dead_letters(id UUID PRIMARY KEY,service TEXT NOT NULL,event_id UUID NOT NULL,event_type TEXT NOT NULL,envelope JSONB NOT NULL,error TEXT NOT NULL,retry_count INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ NOT NULL DEFAULT now(),resolved_at TIMESTAMPTZ,resolved_by UUID)`);
}

async function projectEvent(event) {
  const inserted = await db.query(`INSERT INTO processed_events(event_id,event_type) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING RETURNING event_id`, [event.id, event.type]);
  if (!inserted.rows[0]) return;
  const payload = event.payload || {};
  if (event.type.startsWith('product.')) await projectProduct(payload);
  else if (event.type === 'order.created' || event.type === 'order.status_changed' || event.type === 'order.confirmed' || event.type === 'order.cancelled') await projectOrder(payload);
  else if (event.type.startsWith('payment.')) await projectPayment(payload);
  else if (event.type.startsWith('inventory.')) await projectInventory(payload);
  else if (event.type.startsWith('shipment.')) await projectShipment(payload);
  else if (event.type.startsWith('return.')) await projectReturn(payload);
  else if (event.type.startsWith('purchase_order.')) await projectPurchaseOrder(payload);
  else if (event.type === 'system.dead_lettered') await projectDeadLetter(payload);
  if (payload.actorId || event.type === 'admin.action' || event.type === 'admin.role_changed') await audit(event.type, payload);
}
async function projectDeadLetter(payload) {
  const original = payload.event || {};
  if (!original.id || !original.type) return;
  await db.query(
    `INSERT INTO admin_dead_letters(id,service,event_id,event_type,envelope,error,retry_count)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [crypto.randomUUID(), payload.service, original.id, original.type, original, payload.error || 'Unknown consumer error', Number(payload.retryCount || 0)],
  );
}
async function projectProduct(payload) {
  if (!payload.productId || !payload.name) return;
  await db.query(`INSERT INTO admin_product_projection(product_id,variant_id,sku,name,brand,category,price,cost_price,status,image,display_stock,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::timestamptz,now()),now()) ON CONFLICT(product_id) DO UPDATE SET variant_id=EXCLUDED.variant_id,sku=EXCLUDED.sku,name=EXCLUDED.name,brand=EXCLUDED.brand,category=EXCLUDED.category,price=EXCLUDED.price,cost_price=EXCLUDED.cost_price,status=EXCLUDED.status,image=EXCLUDED.image,display_stock=EXCLUDED.display_stock,updated_at=now()`, [payload.productId, payload.variantId || null, payload.sku || null, payload.name, payload.brand, payload.category, Number(payload.price || 0), Number(payload.costPrice || 0), payload.status, payload.image, Number(payload.stock || 0), payload.createdAt || null]);
}
async function projectOrder(payload) {
  if (!payload.orderId) return;
  const existing = await db.query(`SELECT * FROM admin_order_projection WHERE order_id=$1`, [payload.orderId]);
  const current = existing.rows[0] || {};
  await db.query(`INSERT INTO admin_order_projection(order_id,order_number,user_id,status,payment_status,fulfillment_status,total_amount,discount_amount,recipient,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz,now()),COALESCE($11::timestamptz,now())) ON CONFLICT(order_id) DO UPDATE SET order_number=COALESCE(EXCLUDED.order_number,admin_order_projection.order_number),user_id=COALESCE(EXCLUDED.user_id,admin_order_projection.user_id),status=COALESCE(EXCLUDED.status,admin_order_projection.status),payment_status=COALESCE(EXCLUDED.payment_status,admin_order_projection.payment_status),fulfillment_status=COALESCE(EXCLUDED.fulfillment_status,admin_order_projection.fulfillment_status),total_amount=CASE WHEN EXCLUDED.total_amount>0 THEN EXCLUDED.total_amount ELSE admin_order_projection.total_amount END,recipient=COALESCE(EXCLUDED.recipient,admin_order_projection.recipient),updated_at=now()`, [payload.orderId, payload.orderNumber || current.order_number || null, payload.userId || current.user_id || null, payload.status || (payload.reason ? 'cancelled' : current.status) || null, payload.paymentStatus || current.payment_status || null, payload.fulfillmentStatus || current.fulfillment_status || null, Number(payload.totalAmount || current.total_amount || 0), Number(payload.discountAmount || current.discount_amount || 0), payload.recipient || current.recipient || null, payload.createdAt || current.created_at || null, payload.updatedAt || null]);
  if (Array.isArray(payload.items)) for (const item of payload.items) {
    const id = item.id || stableUuid(`${payload.orderId}:${item.variantId || item.productId}`);
    await db.query(`INSERT INTO admin_order_item_projection(id,order_id,product_id,variant_id,sku,name,brand,unit_price,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET unit_price=EXCLUDED.unit_price,quantity=EXCLUDED.quantity`, [id, payload.orderId, item.productId, item.variantId || null, item.sku || null, item.name, item.brand, Number(item.price || item.unit_price || 0), Number(item.quantity || 0)]);
  }
}
async function projectPayment(payload) {
  if (!payload.orderId) return;
  const current = await db.query(`SELECT * FROM admin_payment_projection WHERE order_id=$1`, [payload.orderId]);
  const item = current.rows[0] || {};
  const refunded = Number(payload.refundedAmount || payload.refundAmount || item.refunded_amount || 0);
  const status = payload.status || (payload.refundAmount ? (refunded >= Number(item.amount || 0) ? 'refunded' : 'partially_refunded') : 'approved');
  await db.query(`INSERT INTO admin_payment_projection(payment_id,order_id,status,amount,refunded_amount,provider,approved_at) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now())) ON CONFLICT(order_id) DO UPDATE SET status=EXCLUDED.status,amount=CASE WHEN EXCLUDED.amount>0 THEN EXCLUDED.amount ELSE admin_payment_projection.amount END,refunded_amount=EXCLUDED.refunded_amount,provider=COALESCE(EXCLUDED.provider,admin_payment_projection.provider)`, [payload.paymentId || item.payment_id || stableUuid(`payment:${payload.orderId}`), payload.orderId, status, Number(payload.totalAmount || item.amount || 0), refunded, payload.provider || item.provider || 'mock', payload.approvedAt || null]);
  await db.query(`UPDATE admin_order_projection SET payment_status=$2,updated_at=now() WHERE order_id=$1`, [payload.orderId, status]);
}
async function projectInventory(payload) {
  if (!payload.variantId && !payload.productId) return;
  const existing = await db.query(`SELECT * FROM admin_inventory_projection WHERE (variant_id=$1 OR product_id=$2) AND ($3::uuid IS NULL OR warehouse_id=$3) LIMIT 1`, [payload.variantId || payload.productId, payload.productId || null, payload.warehouseId || null]);
  if (!existing.rows[0]) return;
  await db.query(`UPDATE admin_inventory_projection SET available_qty=COALESCE($2,available_qty),reserved_qty=COALESCE($3,reserved_qty),updated_at=now() WHERE balance_id=$1`, [existing.rows[0].balance_id, payload.availableQty ?? null, payload.reservedQty ?? null]);
}
async function projectShipment(payload) {
  if (!payload.shipmentId) return;
  await db.query(`INSERT INTO admin_shipment_projection(shipment_id,order_id,shipment_number,warehouse_id,carrier,tracking_number,status,recipient,shipped_at,delivered_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz,now()),now()) ON CONFLICT(shipment_id) DO UPDATE SET carrier=COALESCE(EXCLUDED.carrier,admin_shipment_projection.carrier),tracking_number=COALESCE(EXCLUDED.tracking_number,admin_shipment_projection.tracking_number),status=EXCLUDED.status,shipped_at=COALESCE(EXCLUDED.shipped_at,admin_shipment_projection.shipped_at),delivered_at=COALESCE(EXCLUDED.delivered_at,admin_shipment_projection.delivered_at),updated_at=now()`, [payload.shipmentId, payload.orderId, payload.shipmentNumber, payload.warehouseId || null, payload.carrier, payload.trackingNumber || null, payload.status || 'ready', payload.recipient || null, payload.shippedAt || null, payload.deliveredAt || null, payload.createdAt || null]);
  if (payload.orderId) await db.query(`UPDATE admin_order_projection SET fulfillment_status=$2,status=CASE WHEN $2='shipped' THEN 'shipped' WHEN $2='delivered' THEN 'delivered' WHEN $2 IN('ready','packed') THEN 'preparing' ELSE status END,updated_at=now() WHERE order_id=$1`, [payload.orderId, payload.status]);
}
async function projectReturn(payload) {
  if (!payload.returnId) return;
  await db.query(`INSERT INTO admin_return_projection(return_id,order_id,return_number,status,reason,refund_amount,requested_at,completed_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now()),$8,now()) ON CONFLICT(return_id) DO UPDATE SET status=EXCLUDED.status,refund_amount=CASE WHEN EXCLUDED.refund_amount>0 THEN EXCLUDED.refund_amount ELSE admin_return_projection.refund_amount END,completed_at=COALESCE(EXCLUDED.completed_at,admin_return_projection.completed_at),updated_at=now()`, [payload.returnId, payload.orderId, payload.returnNumber, payload.status || 'requested', payload.reason || null, Number(payload.refundAmount || 0), payload.requestedAt || null, payload.completedAt || null]);
}
async function projectPurchaseOrder(payload) {
  if (!payload.purchaseOrderId) return;
  await db.query(`INSERT INTO admin_purchase_order_projection(purchase_order_id,purchase_order_number,supplier_id,warehouse_id,status,total_amount,expected_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now(),now()) ON CONFLICT(purchase_order_id) DO UPDATE SET status=EXCLUDED.status,total_amount=CASE WHEN EXCLUDED.total_amount>0 THEN EXCLUDED.total_amount ELSE admin_purchase_order_projection.total_amount END,updated_at=now()`, [payload.purchaseOrderId, payload.purchaseOrderNumber, payload.supplierId || null, payload.warehouseId || null, payload.status || 'draft', Number(payload.totalAmount || 0), payload.expectedAt || null]);
}
async function audit(action, payload) {
  await db.query(`INSERT INTO admin_audit_logs(id,actor_id,action,entity_type,entity_id,reason,metadata,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())`, [crypto.randomUUID(), payload.actorId || null, action, payload.entityType || action.split('.')[0], String(payload.entityId || payload.orderId || payload.productId || payload.shipmentId || payload.returnId || payload.purchaseOrderId || payload.userId || ''), payload.reason || null, JSON.stringify(payload.metadata || payload)]);
}
function stableUuid(value) {
  const bytes = require('crypto').createHash('md5').update(value).digest('hex');
  return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-4${bytes.slice(13, 16)}-a${bytes.slice(17, 20)}-${bytes.slice(20, 32)}`;
}

async function fetchInternal(service, path) {
  const response = await fetch(`${serviceUrls[service]}${path}`, { headers: { 'x-internal-key': internalKey } });
  if (!response.ok) throw new Error(`${service}${path}: ${response.status}`);
  return response.json();
}
async function rebuild() {
  const [products, orders, payments, inventory, shipments, returns, purchaseOrders, members, reviews] = await Promise.all([
    fetchInternal('catalog', '/internal/products'), fetchInternal('order', '/internal/orders'), fetchInternal('payment', '/internal/payments'),
    fetchInternal('inventory', '/internal/inventory'), fetchInternal('fulfillment', '/internal/shipments'), fetchInternal('fulfillment', '/internal/returns'),
    fetchInternal('procurement', '/internal/purchase-orders'), fetchInternal('auth', '/internal/users'), fetchInternal('catalog', '/internal/reviews'),
  ]);
  for (const table of ['admin_product_projection', 'admin_order_item_projection', 'admin_order_projection', 'admin_payment_projection', 'admin_inventory_projection', 'admin_shipment_projection', 'admin_return_projection', 'admin_purchase_order_projection', 'admin_member_projection', 'admin_review_projection']) await db.query(`TRUNCATE TABLE ${table}`);
  for (const item of products.items || []) await db.query(`INSERT INTO admin_product_projection(product_id,variant_id,sku,model_number,name,brand,category,price,cost_price,status,image,display_stock,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [item.id, item.variant_id, item.sku, item.model_number, item.name, item.brand, item.category, Number(item.price), Number(item.cost_price || 0), item.status, item.image, Number(item.stock || 0), item.created_at, item.created_at]);
  for (const item of orders.items || []) {
    await db.query(`INSERT INTO admin_order_projection(order_id,order_number,user_id,status,payment_status,fulfillment_status,total_amount,discount_amount,recipient,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [item.id, item.order_number, item.user_id, item.status, item.payment_status, item.fulfillment_status, Number(item.total_amount), Number(item.discount_amount || 0), item.recipient, item.created_at, item.updated_at]);
    const detail = await fetchInternal('order', `/internal/orders/${item.id}/items`);
    for (const row of detail.items || []) await db.query(`INSERT INTO admin_order_item_projection(id,order_id,product_id,variant_id,sku,name,brand,unit_price,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [row.id, row.order_id, row.product_id, row.variant_id, row.sku, row.name, row.brand, Number(row.unit_price), Number(row.quantity)]);
  }
  for (const item of payments.items || []) await db.query(`INSERT INTO admin_payment_projection(payment_id,order_id,status,amount,refunded_amount,provider,approved_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, [item.id, item.order_id, item.status, Number(item.amount), Number(item.refunded_amount || 0), item.provider, item.approved_at]);
  for (const item of inventory.items || []) await db.query(`INSERT INTO admin_inventory_projection(balance_id,warehouse_id,warehouse_code,warehouse_name,product_id,variant_id,available_qty,reserved_qty,damaged_qty,incoming_qty,safety_qty,reorder_qty,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [item.id, item.warehouse_id, item.warehouse_code, item.warehouse_name, item.product_id, item.variant_id, Number(item.available_qty), Number(item.reserved_qty), Number(item.damaged_qty), Number(item.incoming_qty), Number(item.safety_qty || 5), Number(item.reorder_qty || 20), item.updated_at]);
  for (const item of shipments.items || []) await db.query(`INSERT INTO admin_shipment_projection(shipment_id,order_id,shipment_number,warehouse_id,carrier,tracking_number,status,recipient,shipped_at,delivered_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [item.id, item.order_id, item.shipment_number, item.warehouse_id, item.carrier, item.tracking_number, item.status, item.recipient, item.shipped_at, item.delivered_at, item.created_at, item.updated_at]);
  for (const item of returns.items || []) await db.query(`INSERT INTO admin_return_projection(return_id,order_id,return_number,status,reason,refund_amount,requested_at,completed_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [item.id, item.order_id, item.return_number, item.status, item.reason, Number(item.refund_amount), item.requested_at, item.completed_at, item.updated_at]);
  for (const item of purchaseOrders.items || []) await db.query(`INSERT INTO admin_purchase_order_projection(purchase_order_id,purchase_order_number,supplier_id,supplier_name,warehouse_id,status,total_amount,item_count,outstanding_qty,expected_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [item.id, item.purchase_order_number, item.supplier_id, item.supplier_name, item.warehouse_id, item.status, Number(item.total_amount), Number(item.item_count || 0), Number(item.outstanding_qty || 0), item.expected_at, item.created_at, item.updated_at]);
  for (const item of members.items || []) await db.query(`INSERT INTO admin_member_projection(user_id,email,name,role,status,created_at) VALUES($1,$2,$3,$4,$5,$6)`, [item.id, item.email, item.name, item.role, item.status || 'active', item.createdAt]);
  for (const item of reviews.items || []) await db.query(`INSERT INTO admin_review_projection(review_id,product_id,user_name,rating,body,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, [item.id, item.product_id, item.user_name, Number(item.rating), item.body, item.status, item.created_at]);
  return { products: products.items.length, orders: orders.items.length, inventory: inventory.items.length, shipments: shipments.items.length, returns: returns.items.length, purchaseOrders: purchaseOrders.items.length };
}

function range(req) {
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59+09:00`) : new Date();
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00+09:00`) : new Date(to.getTime() - 29 * 86400000);
  return { from, to };
}
app.get('/admin/dashboard', requireAuth, requireRole('admin'), requirePermission('dashboard.read'), async (req, res) => {
  const { from, to } = range(req);
  const previousFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
  const summary = await db.query(`SELECT count(*) FILTER(WHERE status<>'cancelled')::int orders,COALESCE(sum(total_amount) FILTER(WHERE status<>'cancelled'),0)::int gross_sales,COALESCE(avg(total_amount) FILTER(WHERE status<>'cancelled'),0)::int average_order_value,count(*) FILTER(WHERE status='cancelled')::int cancelled FROM admin_order_projection WHERE created_at BETWEEN $1 AND $2`, [from, to]);
  const previous = await db.query(`SELECT count(*) FILTER(WHERE status<>'cancelled')::int orders,COALESCE(sum(total_amount) FILTER(WHERE status<>'cancelled'),0)::int gross_sales FROM admin_order_projection WHERE created_at BETWEEN $1 AND $2`, [previousFrom, from]);
  const refund = await db.query(`SELECT COALESCE(sum(refunded_amount),0)::int refunded,count(*) FILTER(WHERE status IN('partially_refunded','refunded'))::int refund_count,count(*) FILTER(WHERE status='approved')::int approved,count(*)::int total FROM admin_payment_projection WHERE approved_at BETWEEN $1 AND $2`, [from, to]);
  const operations = await db.query(`SELECT (SELECT count(*)::int FROM admin_shipment_projection WHERE status IN('ready','packed') AND created_at<now()-interval '24 hours') delayed_shipments,(SELECT count(*)::int FROM admin_inventory_projection WHERE available_qty<=safety_qty) inventory_risk,(SELECT count(*)::int FROM admin_return_projection WHERE status IN('requested','approved','received')) pending_returns,(SELECT count(*)::int FROM admin_purchase_order_projection WHERE status IN('draft','approved','partially_received')) open_purchase_orders`);
  const trend = await db.query(`SELECT to_char(day,'MM.DD') label,day::date date,COALESCE(count(o.order_id) FILTER(WHERE o.status<>'cancelled'),0)::int orders,COALESCE(sum(o.total_amount) FILTER(WHERE o.status<>'cancelled'),0)::int revenue FROM generate_series($1::date,$2::date,'1 day') day LEFT JOIN admin_order_projection o ON o.created_at::date=day::date GROUP BY day ORDER BY day`, [from, to]);
  const funnel = await db.query(`SELECT status,count(*)::int value FROM admin_order_projection WHERE created_at BETWEEN $1 AND $2 GROUP BY status ORDER BY status`, [from, to]);
  const categorySales = await db.query(`SELECT COALESCE(p.category,'기타') name,sum(i.unit_price*i.quantity)::int value FROM admin_order_item_projection i JOIN admin_order_projection o ON o.order_id=i.order_id LEFT JOIN admin_product_projection p ON p.product_id=i.product_id WHERE o.created_at BETWEEN $1 AND $2 AND o.status<>'cancelled' GROUP BY p.category ORDER BY value DESC LIMIT 6`, [from, to]);
  const brandSales = await db.query(`SELECT COALESCE(i.brand,'기타') name,sum(i.unit_price*i.quantity)::int value FROM admin_order_item_projection i JOIN admin_order_projection o ON o.order_id=i.order_id WHERE o.created_at BETWEEN $1 AND $2 AND o.status<>'cancelled' GROUP BY i.brand ORDER BY value DESC LIMIT 6`, [from, to]);
  const recentOrders = await db.query(`SELECT * FROM admin_order_projection ORDER BY created_at DESC LIMIT 6`);
  const riskInventory = await db.query(`SELECT i.*,p.name,p.sku FROM admin_inventory_projection i LEFT JOIN admin_product_projection p ON p.variant_id=i.variant_id WHERE i.available_qty<=i.safety_qty ORDER BY i.available_qty LIMIT 8`);
  const current = summary.rows[0]; const prior = previous.rows[0]; const refunds = refund.rows[0]; const ops = operations.rows[0];
  const change = (value, old) => old ? Math.round(((value - old) / old) * 1000) / 10 : value ? 100 : 0;
  res.json({ range: { from, to }, kpis: {
    grossSales: { value: current.gross_sales, change: change(current.gross_sales, prior.gross_sales) },
    netSales: { value: current.gross_sales - refunds.refunded, change: change(current.gross_sales - refunds.refunded, prior.gross_sales) },
    orders: { value: current.orders, change: change(current.orders, prior.orders) },
    averageOrderValue: { value: current.average_order_value, change: change(current.average_order_value, prior.orders ? Math.round(prior.gross_sales / prior.orders) : 0) },
    refundRate: { value: refunds.total ? Math.round((refunds.refund_count / refunds.total) * 1000) / 10 : 0 },
    approvalRate: { value: refunds.total ? Math.round((refunds.approved / refunds.total) * 1000) / 10 : 0 },
    delayedShipments: { value: ops.delayed_shipments }, inventoryRisk: { value: ops.inventory_risk },
  }, queues: { pendingReturns: ops.pending_returns, openPurchaseOrders: ops.open_purchase_orders, delayedShipments: ops.delayed_shipments, inventoryRisk: ops.inventory_risk }, trend: trend.rows, funnel: funnel.rows, categorySales: categorySales.rows, brandSales: brandSales.rows, recentOrders: recentOrders.rows, riskInventory: riskInventory.rows });
});

const resources = {
  orders: { permission: 'orders.read', table: 'admin_order_projection', search: ['order_number', 'recipient'], status: 'status', date: 'created_at', id: 'order_id', sorts: ['created_at', 'total_amount', 'order_number', 'status'] },
  products: { permission: 'products.read', table: 'admin_product_projection', search: ['name', 'brand', 'sku', 'model_number'], status: 'status', date: 'created_at', id: 'product_id', sorts: ['created_at', 'price', 'name', 'status'] },
  inventory: { permission: 'inventory.read', table: '(SELECT i.*,p.name,p.sku,p.brand FROM admin_inventory_projection i LEFT JOIN admin_product_projection p ON p.variant_id=i.variant_id) resource', search: ['warehouse_name', 'warehouse_code', 'name', 'sku', 'brand'], status: null, date: 'updated_at', id: 'balance_id', sorts: ['updated_at', 'available_qty', 'reserved_qty'] },
  shipments: { permission: 'orders.read', table: '(SELECT s.*,o.order_number FROM admin_shipment_projection s LEFT JOIN admin_order_projection o ON o.order_id=s.order_id) resource', search: ['shipment_number', 'tracking_number', 'recipient', 'order_number'], status: 'status', date: 'created_at', id: 'shipment_id', sorts: ['created_at', 'status', 'shipment_number'] },
  returns: { permission: 'orders.read', table: '(SELECT r.*,o.order_number,o.recipient FROM admin_return_projection r LEFT JOIN admin_order_projection o ON o.order_id=r.order_id) resource', search: ['return_number', 'reason', 'order_number', 'recipient'], status: 'status', date: 'requested_at', id: 'return_id', sorts: ['requested_at', 'status', 'refund_amount'] },
  'purchase-orders': { permission: 'inventory.read', table: 'admin_purchase_order_projection', search: ['purchase_order_number', 'supplier_name'], status: 'status', date: 'created_at', id: 'purchase_order_id', sorts: ['created_at', 'status', 'total_amount'] },
  members: { permission: 'members.read', table: 'admin_member_projection', search: ['name', 'email'], status: 'status', date: 'created_at', id: 'user_id', sorts: ['created_at', 'name', 'status'] },
  reviews: { permission: 'reviews.update', table: 'admin_review_projection', search: ['user_name', 'body'], status: 'status', date: 'created_at', id: 'review_id', sorts: ['created_at', 'rating', 'status'] },
  'audit-logs': { permission: 'audit.read', table: 'admin_audit_logs', search: ['action', 'entity_type', 'entity_id', 'reason'], status: null, date: 'occurred_at', id: 'id', sorts: ['occurred_at', 'action'] },
  'dead-letters': { permission: 'admin.manage', table: 'admin_dead_letters', search: ['service', 'event_type', 'error'], status: 'status', date: 'created_at', id: 'id', sorts: ['created_at', 'service', 'event_type', 'status'] },
};
for (const [path, config] of Object.entries(resources)) app.get(`/admin/${path}`, requireAuth, requireRole('admin'), requirePermission(config.permission), async (req, res) => listResource(req, res, config));
async function listResource(req, res, config) {
  const page = Math.max(1, Number(req.query.page || 1)); const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize || 20)));
  const params = []; const where = [];
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(${config.search.map(column => `${column} ILIKE $${params.length}`).join(' OR ')})`); }
  if (config.status && req.query.status && req.query.status !== 'all') { params.push(req.query.status); where.push(`${config.status}=$${params.length}`); }
  if (req.query.from) { params.push(req.query.from); where.push(`${config.date} >= $${params.length}::date`); }
  if (req.query.to) { params.push(req.query.to); where.push(`${config.date} < ($${params.length}::date + interval '1 day')`); }
  if (req.query.warehouseId && ['inventory', 'shipments', 'purchase-orders'].includes(req.path.split('/').pop())) { params.push(req.query.warehouseId); where.push(`warehouse_id=$${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sort = config.sorts.includes(req.query.sort) ? req.query.sort : config.date; const direction = req.query.direction === 'asc' ? 'ASC' : 'DESC';
  const count = await db.query(`SELECT count(*)::int total FROM ${config.table} ${clause}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await db.query(`SELECT * FROM ${config.table} ${clause} ORDER BY ${sort} ${direction} NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  res.json({ items: rows.rows, page, pageSize, total: count.rows[0].total, pageCount: Math.max(1, Math.ceil(count.rows[0].total / pageSize)) });
}
app.get('/admin/alerts', requireAuth, requireRole('admin'), async (_, res) => {
  const inventory = await db.query(`SELECT 'inventory' type,'재고 부족' title,p.name||' · '||i.warehouse_name message,'high' severity,i.product_id entity_id FROM admin_inventory_projection i LEFT JOIN admin_product_projection p ON p.variant_id=i.variant_id WHERE i.available_qty<=i.safety_qty ORDER BY i.available_qty LIMIT 20`);
  const shipping = await db.query(`SELECT 'shipment' type,'출고 지연' title,shipment_number||' · '||recipient message,'medium' severity,shipment_id entity_id FROM admin_shipment_projection WHERE status IN('ready','packed') AND created_at<now()-interval '24 hours' ORDER BY created_at LIMIT 20`);
  res.json({ items: [...inventory.rows, ...shipping.rows] });
});
app.get('/admin/warehouses', requireAuth, requireRole('admin'), async (_, res) => { const data = await fetchInternal('inventory', '/internal/warehouses'); res.json(data); });
app.get('/admin/roles', requireAuth, requireRole('admin'), async (req, res) => {
  const authorization = req.headers.authorization || (req.cookies?.tz_access ? `Bearer ${req.cookies.tz_access}` : '');
  const response = await fetch(`${serviceUrls.auth}/auth/roles`, { headers: { authorization } });
  res.status(response.status).send(await response.text());
});
app.post('/admin/dead-letters/:id/reprocess', requireAuth, requireRole('admin'), requirePermission('admin.manage'), requireCsrf, async (req, res) => {
  const result = await db.query(`UPDATE admin_dead_letters SET status='reprocessed',resolved_at=now(),resolved_by=$2 WHERE id=$1 AND status='pending' RETURNING *`, [req.params.id, req.user.sub]);
  if (!result.rows[0]) return res.status(404).json({ code: 'DEAD_LETTER_NOT_FOUND' });
  const original = result.rows[0].envelope;
  const replay = await publish(original.type, original.payload, {
    correlationId: original.correlationId,
    causationId: original.id,
    actorId: req.user.sub,
  });
  await audit('admin.dead_letter_reprocessed', { actorId: req.user.sub, entityType: 'dead_letter', entityId: req.params.id, reason: req.body?.reason, metadata: { originalEventId: original.id, replayEventId: replay.id } });
  res.json({ id: req.params.id, status: 'reprocessed', replayEventId: replay.id });
});
app.post('/admin/dead-letters/:id/discard', requireAuth, requireRole('admin'), requirePermission('admin.manage'), requireCsrf, async (req, res) => {
  const result = await db.query(`UPDATE admin_dead_letters SET status='discarded',resolved_at=now(),resolved_by=$2 WHERE id=$1 AND status='pending' RETURNING id`, [req.params.id, req.user.sub]);
  if (!result.rows[0]) return res.status(404).json({ code: 'DEAD_LETTER_NOT_FOUND' });
  await audit('admin.dead_letter_discarded', { actorId: req.user.sub, entityType: 'dead_letter', entityId: req.params.id, reason: req.body?.reason || '관리자 폐기' });
  res.json({ id: req.params.id, status: 'discarded' });
});
app.get('/admin/system-status', requireAuth, requireRole('admin'), requirePermission('admin.manage'), async (req, res) => {
  const [deadLetters, outbox, processed] = await Promise.all([
    db.query(`SELECT count(*)::int count FROM admin_dead_letters WHERE status='pending'`),
    db.query(`SELECT count(*)::int count,COALESCE(EXTRACT(EPOCH FROM (now()-min(occurred_at))),0)::int oldest_seconds FROM outbox_events WHERE published_at IS NULL`),
    db.query(`SELECT count(*)::int count FROM inbox_events WHERE processed_at>now()-interval '24 hours'`),
  ]);
  res.json({
    service: 'admin-query',
    status: Number(outbox.rows[0].oldest_seconds) > 300 ? 'degraded' : 'healthy',
    pendingDeadLetters: deadLetters.rows[0].count,
    pendingOutbox: outbox.rows[0].count,
    oldestOutboxSeconds: outbox.rows[0].oldest_seconds,
    processedEvents24h: processed.rows[0].count,
    traceUrl: process.env.GRAFANA_URL || 'http://localhost:13000',
  });
});
app.post('/admin/rebuild', requireAuth, requireRole('admin'), requirePermission('admin.manage'), requireCsrf, async (req, res) => {
  const result = await rebuild();
  await audit('admin.projection_rebuilt', { actorId: req.user.sub, entityType: 'admin_projection', metadata: result, reason: req.body?.reason || '수동 재구축' });
  res.json(result);
});

init().then(() => listen(app, 'admin')).catch(error => { console.error(error); process.exitCode = 1; });
