const { eq, and, desc, sql } = require('drizzle-orm');
const { database } = require('../../shared/db');
const { orders, orderItems } = require('../../shared/schema');
const { server, listen } = require('../../shared/http');
const { publish, subscribe } = require('../../shared/bus');
const { requireAuth, requireRole, requireInternal, requirePermission } = require('../../shared/auth');

const db = database('orders');
const app = server('order');
const allowedTransitions = {
  pending: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['shipped', 'cancelled'],
  shipped: ['delivered'], delivered: [], cancelled: [],
};

async function init() {
  await db.wait();
  await db.query(`DO $$ BEGIN CREATE TYPE order_status AS ENUM ('pending','confirmed','preparing','shipped','delivered','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.query(`DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('pending','approved','partially_refunded','refunded','cancelled','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.query(`DO $$ BEGIN CREATE TYPE fulfillment_status AS ENUM ('unfulfilled','ready','shipped','delivered','returned'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.query(`CREATE TABLE IF NOT EXISTS orders(id UUID PRIMARY KEY,user_id UUID NOT NULL,order_number TEXT UNIQUE NOT NULL,status order_status NOT NULL,payment_status payment_status NOT NULL DEFAULT 'pending',fulfillment_status fulfillment_status NOT NULL DEFAULT 'unfulfilled',subtotal_amount INTEGER NOT NULL DEFAULT 0,discount_amount INTEGER NOT NULL DEFAULT 0,tax_amount INTEGER NOT NULL DEFAULT 0,total_amount INTEGER NOT NULL CHECK(total_amount>=0),recipient TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,memo TEXT,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS order_items(id UUID PRIMARY KEY,order_id UUID NOT NULL REFERENCES orders(id),product_id UUID NOT NULL,variant_id UUID,sku TEXT,name TEXT NOT NULL,brand TEXT NOT NULL,image TEXT,unit_price INTEGER NOT NULL,discount_amount INTEGER NOT NULL DEFAULT 0,tax_amount INTEGER NOT NULL DEFAULT 0,quantity INTEGER NOT NULL CHECK(quantity>0))`);
  await db.query(`CREATE TABLE IF NOT EXISTS order_addresses(id UUID PRIMARY KEY,order_id UUID NOT NULL,type TEXT NOT NULL,recipient TEXT NOT NULL,phone TEXT NOT NULL,postal_code TEXT,address1 TEXT NOT NULL,address2 TEXT)`);
  await seedOrders();
  await subscribe('order', ['payment.approved', 'payment.refunded', 'inventory.reserved', 'inventory.failed', 'shipment.created', 'shipment.shipped', 'shipment.delivered', 'return.received'], onEvent);
}

async function seedOrders() {
  const count = await db.query(`SELECT count(*)::int count FROM orders`);
  if (count.rows[0].count) return;
  try {
    const headers = { 'x-internal-key': process.env.INTERNAL_API_KEY || 'techzone-internal' };
    const [catalogResponse, usersResponse] = await Promise.all([
      fetch(`${process.env.CATALOG_URL || 'http://localhost:3002'}/internal/products`, { headers }),
      fetch(`${process.env.AUTH_URL || 'http://localhost:3001'}/internal/users`, { headers }),
    ]);
    if (!catalogResponse.ok || !usersResponse.ok) return;
    const catalog = (await catalogResponse.json()).items;
    const customers = (await usersResponse.json()).items.filter(user => user.role === 'customer');
    const fallbackUsers = customers.length ? customers : [{ id: crypto.randomUUID(), name: '김테크' }, { id: crypto.randomUUID(), name: '박디지털' }];
    const statuses = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'delivered', 'cancelled'];
    for (let index = 0; index < 18; index += 1) {
      const product = catalog[index % catalog.length];
      const user = fallbackUsers[index % fallbackUsers.length];
      const status = statuses[index % statuses.length];
      const createdAt = new Date(Date.now() - index * 12 * 60 * 60 * 1000);
      const id = crypto.randomUUID();
      const quantity = (index % 3) + 1;
      const subtotal = Number(product.price) * quantity;
      const discount = index % 4 === 0 ? 20000 : 0;
      const total = subtotal - discount;
      const payment = status === 'pending' ? 'pending' : status === 'cancelled' ? 'cancelled' : 'approved';
      const fulfillment = status === 'preparing' ? 'ready' : status === 'shipped' ? 'shipped' : status === 'delivered' ? 'delivered' : 'unfulfilled';
      await db.query(`INSERT INTO orders(id,user_id,order_number,status,payment_status,fulfillment_status,subtotal_amount,discount_amount,tax_amount,total_amount,recipient,phone,address,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'010-1234-5678','서울특별시 강남구 테헤란로 123',$12,$12)`, [id, user.id, `TZ-${createdAt.getFullYear()}-${String(index + 1).padStart(6, '0')}`, status, payment, fulfillment, subtotal, discount, Math.round(total / 11), total, user.name || '고객', createdAt]);
      await db.query(`INSERT INTO order_items(id,order_id,product_id,variant_id,sku,name,brand,image,unit_price,discount_amount,tax_amount,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [crypto.randomUUID(), id, product.id, product.variant_id, product.sku, product.name, product.brand, product.image, Number(product.price), discount, Math.round(total / 11), quantity]);
      await db.query(`INSERT INTO order_addresses(id,order_id,type,recipient,phone,postal_code,address1) VALUES($1,$2,'shipping',$3,'010-1234-5678','06134','서울특별시 강남구 테헤란로 123')`, [crypto.randomUUID(), id, user.name || '고객']);
    }
  } catch (error) { console.warn('order seed skipped:', error.message); }
}

async function onEvent(event) {
  const payload = event.payload;
  const orderId = payload.orderId;
  if (!orderId) return;
  if (event.type === 'payment.approved') {
    await db.query(`UPDATE orders SET payment_status='approved',updated_at=now() WHERE id=$1`, [orderId]);
    await publish('inventory.reserve', { orderId, userId: payload.userId, items: payload.items });
  } else if (event.type === 'payment.refunded') {
    await db.query(`UPDATE orders SET payment_status=CASE WHEN $2 >= total_amount THEN 'refunded'::payment_status ELSE 'partially_refunded'::payment_status END,updated_at=now() WHERE id=$1`, [orderId, Number(payload.refundAmount)]);
  } else if (event.type === 'inventory.reserved') {
    const updated = await db.orm.update(orders).set({ status: 'confirmed', fulfillmentStatus: 'ready', updatedAt: new Date() }).where(and(eq(orders.id, orderId), eq(orders.status, 'pending'))).returning({ userId: orders.userId, totalAmount: orders.totalAmount, orderNumber: orders.orderNumber });
    if (updated[0]) await publish('order.confirmed', { orderId, userId: updated[0].userId, totalAmount: updated[0].totalAmount, orderNumber: updated[0].orderNumber });
  } else if (event.type === 'inventory.failed') {
    const cancelled = await db.orm.update(orders).set({ status: 'cancelled', paymentStatus: 'cancelled', updatedAt: new Date() }).where(eq(orders.id, orderId)).returning({ userId: orders.userId, orderNumber: orders.orderNumber });
    if (cancelled[0]) await publish('order.cancelled', { orderId, userId: cancelled[0].userId, orderNumber: cancelled[0].orderNumber, reason: payload.reason || 'OUT_OF_STOCK' });
  } else if (event.type === 'shipment.created') await transitionFromEvent(orderId, 'preparing', 'ready');
  else if (event.type === 'shipment.shipped') await transitionFromEvent(orderId, 'shipped', 'shipped');
  else if (event.type === 'shipment.delivered') await transitionFromEvent(orderId, 'delivered', 'delivered');
  else if (event.type === 'return.received') await db.query(`UPDATE orders SET fulfillment_status='returned',updated_at=now() WHERE id=$1`, [orderId]);
}
async function transitionFromEvent(orderId, status, fulfillmentStatus) {
  const result = await db.query(`UPDATE orders SET status=$2,fulfillment_status=$3,updated_at=now() WHERE id=$1 RETURNING *`, [orderId, status, fulfillmentStatus]);
  if (result.rows[0]) await publish('order.status_changed', orderEvent(result.rows[0]));
}
function orderEvent(order) { return { orderId: order.id, orderNumber: order.order_number, userId: order.user_id, status: order.status, paymentStatus: order.payment_status, fulfillmentStatus: order.fulfillment_status, totalAmount: Number(order.total_amount), recipient: order.recipient, createdAt: order.created_at, updatedAt: order.updated_at }; }

app.post('/orders', async (req, res) => {
  const { userId, items, shipping } = req.body;
  if (!userId || !Array.isArray(items) || !items.length || !shipping?.recipient || !shipping?.phone || !shipping?.address) return res.status(400).json({ code: 'INVALID_ORDER' });
  if (items.some(item => !item.productId || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isInteger(Number(item.price)) || Number(item.price) < 0)) return res.status(400).json({ code: 'INVALID_ORDER_ITEM' });
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const discount = 0; const total = subtotal - discount; const tax = Math.round(total / 11);
  const id = crypto.randomUUID(); const orderNumber = `TZ-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
  await db.orm.insert(orders).values({ id, userId, orderNumber, status: 'pending', paymentStatus: 'pending', fulfillmentStatus: 'unfulfilled', subtotalAmount: subtotal, discountAmount: discount, taxAmount: tax, totalAmount: total, recipient: shipping.recipient, phone: shipping.phone, address: shipping.address, memo: shipping.memo });
  await db.orm.insert(orderItems).values(items.map(item => ({ id: crypto.randomUUID(), orderId: id, productId: item.productId, variantId: item.variantId, sku: item.sku, name: item.name, brand: item.brand, image: item.image, unitPrice: Number(item.price), discountAmount: 0, taxAmount: Math.round((Number(item.price) * Number(item.quantity)) / 11), quantity: Number(item.quantity) })));
  await db.query(`INSERT INTO order_addresses(id,order_id,type,recipient,phone,postal_code,address1,address2) VALUES($1,$2,'shipping',$3,$4,$5,$6,$7)`, [crypto.randomUUID(), id, shipping.recipient, shipping.phone, shipping.postalCode || null, shipping.address, shipping.address2 || null]);
  const payload = { orderId: id, orderNumber, userId, items, subtotalAmount: subtotal, discountAmount: discount, taxAmount: tax, totalAmount: total, status: 'pending', paymentStatus: 'pending', fulfillmentStatus: 'unfulfilled', recipient: shipping.recipient, createdAt: new Date().toISOString() };
  await publish('order.created', payload);
  res.status(201).json({ id, orderNumber, status: 'pending', totalAmount: total });
});
app.get('/orders', async (req, res, next) => {
  if (!req.query.userId) return requireAuth(req, res, () => requireRole('admin')(req, res, next));
  next();
}, async (req, res) => {
  const filter = req.query.userId ? eq(orders.userId, req.query.userId) : undefined;
  const rows = await db.orm.select({ id: orders.id, order_number: orders.orderNumber, user_id: orders.userId, status: orders.status, payment_status: orders.paymentStatus, fulfillment_status: orders.fulfillmentStatus, total_amount: orders.totalAmount, recipient: orders.recipient, created_at: orders.createdAt, item_count: sql`count(${orderItems.id})::int`, image: sql`min(${orderItems.image})` }).from(orders).leftJoin(orderItems, eq(orderItems.orderId, orders.id)).where(filter).groupBy(orders.id).orderBy(desc(orders.createdAt)).limit(200);
  res.json({ items: rows });
});
app.patch('/orders/:id/status', requireAuth, requireRole('admin'), requirePermission('orders.update'), async (req, res) => {
  const current = await db.query(`SELECT * FROM orders WHERE id=$1`, [req.params.id]);
  if (!current.rows[0]) return res.status(404).json({ code: 'NOT_FOUND' });
  if (!allowedTransitions[current.rows[0].status]?.includes(req.body.status) && current.rows[0].status !== req.body.status) return res.status(409).json({ code: 'INVALID_STATUS_TRANSITION', from: current.rows[0].status, to: req.body.status });
  const fulfillment = req.body.status === 'preparing' ? 'ready' : req.body.status === 'shipped' ? 'shipped' : req.body.status === 'delivered' ? 'delivered' : current.rows[0].fulfillment_status;
  const result = await db.query(`UPDATE orders SET status=$2,fulfillment_status=$3,updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id, req.body.status, fulfillment]);
  await publish('order.status_changed', { ...orderEvent(result.rows[0]), actorId: req.user.sub, reason: req.body.reason || '관리자 상태 변경' });
  res.json({ id: result.rows[0].id, status: result.rows[0].status });
});
app.get('/orders/:id', async (req, res) => {
  const rows = await db.orm.select().from(orders).where(eq(orders.id, req.params.id)).limit(1);
  if (!rows[0]) return res.status(404).json({ code: 'NOT_FOUND' });
  const items = await db.orm.select().from(orderItems).where(eq(orderItems.orderId, req.params.id));
  const order = rows[0];
  res.json({ id: order.id, user_id: order.userId, order_number: order.orderNumber, status: order.status, payment_status: order.paymentStatus, fulfillment_status: order.fulfillmentStatus, subtotal_amount: order.subtotalAmount, discount_amount: order.discountAmount, tax_amount: order.taxAmount, total_amount: order.totalAmount, recipient: order.recipient, phone: order.phone, address: order.address, memo: order.memo, created_at: order.createdAt, updated_at: order.updatedAt, items: items.map(item => ({ id: item.id, order_id: item.orderId, product_id: item.productId, variant_id: item.variantId, sku: item.sku, name: item.name, brand: item.brand, image: item.image, unit_price: item.unitPrice, quantity: item.quantity })) });
});
app.get('/internal/orders', requireInternal, async (_, res) => {
  const result = await db.query(`SELECT o.*,count(i.id)::int item_count,min(i.image) image FROM orders o LEFT JOIN order_items i ON i.order_id=o.id GROUP BY o.id ORDER BY o.created_at DESC`);
  res.json({ items: result.rows });
});
app.get('/internal/orders/:id/items', requireInternal, async (req, res) => { const result = await db.query(`SELECT * FROM order_items WHERE order_id=$1`, [req.params.id]); res.json({ items: result.rows }); });

init().then(() => listen(app, 'order')).catch(error => { console.error(error); process.exitCode = 1; });
