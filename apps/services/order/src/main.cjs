const { eq, and, desc, sql } = require('drizzle-orm');
const { database } = require('@techzone/database/db');
const { orders, orderItems } = require('@techzone/database/schema');
const { server, listen } = require('@techzone/config/http');
const { publish, subscribe, registerReliability } = require('@techzone/messaging/bus');
const { requireAuth, optionalAuth, requireCsrf, requireRole, requireInternal, requirePermission } = require('@techzone/auth-platform/auth');
const jwt = require('jsonwebtoken');
const { idempotency } = require('@techzone/messaging/idempotency');
const { validateDto } = require('@techzone/config/validation');
const { GuestAccessDto } = require('@techzone/contracts/dtos');

const db = database('orders');
const app = server('order');
const allowedTransitions = {
  pending: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['shipped', 'cancelled'],
  shipped: ['delivered'], delivered: [], cancelled: [],
};

async function init() {
  await db.wait();
  await registerReliability('order', db);
  await db.query(`DO $$ BEGIN CREATE TYPE order_status AS ENUM ('pending','confirmed','preparing','shipped','delivered','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.query(`DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('pending','approved','partially_refunded','refunded','cancelled','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.query(`DO $$ BEGIN CREATE TYPE fulfillment_status AS ENUM ('unfulfilled','ready','shipped','delivered','returned'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.query(`CREATE TABLE IF NOT EXISTS orders(id UUID PRIMARY KEY,user_id UUID NOT NULL,order_number TEXT UNIQUE NOT NULL,status order_status NOT NULL,payment_status payment_status NOT NULL DEFAULT 'pending',fulfillment_status fulfillment_status NOT NULL DEFAULT 'unfulfilled',subtotal_amount INTEGER NOT NULL DEFAULT 0,discount_amount INTEGER NOT NULL DEFAULT 0,tax_amount INTEGER NOT NULL DEFAULT 0,total_amount INTEGER NOT NULL CHECK(total_amount>=0),recipient TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,memo TEXT,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS order_items(id UUID PRIMARY KEY,order_id UUID NOT NULL REFERENCES orders(id),product_id UUID NOT NULL,variant_id UUID,sku TEXT,name TEXT NOT NULL,brand TEXT NOT NULL,image TEXT,unit_price INTEGER NOT NULL,discount_amount INTEGER NOT NULL DEFAULT 0,tax_amount INTEGER NOT NULL DEFAULT 0,quantity INTEGER NOT NULL CHECK(quantity>0))`);
  await db.query(`CREATE TABLE IF NOT EXISTS order_addresses(id UUID PRIMARY KEY,order_id UUID NOT NULL,type TEXT NOT NULL,recipient TEXT NOT NULL,phone TEXT NOT NULL,postal_code TEXT,address1 TEXT NOT NULL,address2 TEXT)`);
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee INTEGER NOT NULL DEFAULT 0`);
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT`);
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_order BOOLEAN NOT NULL DEFAULT false`);
  await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT`);
  await db.query(`CREATE TABLE IF NOT EXISTS coupons(id UUID PRIMARY KEY,code TEXT UNIQUE NOT NULL,type TEXT NOT NULL,value INTEGER NOT NULL,min_order_amount INTEGER NOT NULL DEFAULT 0,max_discount_amount INTEGER,starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ,status TEXT NOT NULL DEFAULT 'active',usage_limit INTEGER,per_customer_limit INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS coupon_redemptions(id UUID PRIMARY KEY,coupon_id UUID NOT NULL,order_id UUID NOT NULL,owner_id UUID NOT NULL,discount_amount INTEGER NOT NULL,created_at TIMESTAMPTZ DEFAULT now(),UNIQUE(coupon_id,owner_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS order_saga_steps(id UUID PRIMARY KEY,order_id UUID NOT NULL,step TEXT NOT NULL,status TEXT NOT NULL,event_id UUID,error_code TEXT,error_message TEXT,compensation_status TEXT,metadata JSONB NOT NULL DEFAULT '{}',started_at TIMESTAMPTZ NOT NULL DEFAULT now(),completed_at TIMESTAMPTZ)`);
  await db.query(`INSERT INTO coupons(id,code,type,value,min_order_amount,max_discount_amount,status,usage_limit,per_customer_limit) VALUES($1,'TECHZONE10','percent',10,300000,50000,'active',10000,1) ON CONFLICT(code) DO NOTHING`, [crypto.randomUUID()]);
  await seedOrders();
  await subscribe('order', ['payment.approved', 'payment.refunded', 'inventory.reserved', 'inventory.failed', 'shipment.created', 'shipment.shipped', 'shipment.delivered', 'return.received'], onEvent);
}

const internalHeaders = () => ({ 'x-internal-key': process.env.INTERNAL_API_KEY || 'techzone-internal' });
const jwtSecret = () => process.env.JWT_SECRET || 'canvas-local-secret';
const normalizePhone = value => String(value || '').replace(/\D/g, '');
async function calculateQuote(items, couponCode) {
  if (!Array.isArray(items) || !items.length) throw Object.assign(new Error('INVALID_ITEMS'), { status: 400 });
  const ids = items.map(item => item.variantId).filter(Boolean);
  if (ids.length !== items.length) throw Object.assign(new Error('VARIANT_REQUIRED'), { status: 400 });
  const response = await fetch(`${process.env.CATALOG_URL || 'http://localhost:3002'}/internal/variants?ids=${ids.join(',')}`, { headers: internalHeaders() });
  if (!response.ok) throw Object.assign(new Error('CATALOG_UNAVAILABLE'), { status: 503 });
  const variants = (await response.json()).items || [];
  const lines = items.map(item => {
    const variant = variants.find(value => value.variant_id === item.variantId);
    const quantity = Number(item.quantity);
    if (!variant || variant.status !== 'active' || variant.product_status !== 'published') throw Object.assign(new Error('PRODUCT_UNAVAILABLE'), { status: 409 });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw Object.assign(new Error('INVALID_QUANTITY'), { status: 400 });
    return { productId: variant.product_id, variantId: variant.variant_id, sku: variant.sku, name: variant.name, brand: variant.brand, image: variant.image, optionValues: variant.option_values, price: Number(variant.sale_price), listPrice: Number(variant.list_price), quantity };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  let discount = 0; let coupon = null;
  if (couponCode) {
    const result = await db.query(`SELECT * FROM coupons WHERE upper(code)=upper($1) AND status='active' AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now())`, [couponCode]);
    coupon = result.rows[0];
    if (!coupon) throw Object.assign(new Error('INVALID_COUPON'), { status: 400 });
    if (subtotal < Number(coupon.min_order_amount)) throw Object.assign(new Error('COUPON_MIN_ORDER'), { status: 409 });
    discount = coupon.type === 'percent' ? Math.floor(subtotal * Number(coupon.value) / 100) : Number(coupon.value);
    if (coupon.max_discount_amount) discount = Math.min(discount, Number(coupon.max_discount_amount));
  }
  const shippingFee = subtotal >= 80000 ? 0 : 3000;
  const total = subtotal - discount + shippingFee;
  return { lines, subtotalAmount: subtotal, discountAmount: discount, shippingFee, taxAmount: Math.round(total / 11), totalAmount: total, coupon: coupon ? { id: coupon.id, code: coupon.code } : null };
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
  const stepId = await recordSaga(orderId, event.type, 'processing', event);
  try {
    if (event.type === 'payment.approved') {
      await db.query(`UPDATE orders SET payment_status='approved',updated_at=now() WHERE id=$1`, [orderId]);
      await publish('inventory.reserve', { orderId, userId: payload.userId, items: payload.items }, { causationId: event.id, correlationId: event.correlationId });
    } else if (event.type === 'payment.refunded') {
      await db.query(`UPDATE orders SET payment_status=CASE WHEN $2 >= total_amount THEN 'refunded'::payment_status ELSE 'partially_refunded'::payment_status END,updated_at=now() WHERE id=$1`, [orderId, Number(payload.refundAmount)]);
    } else if (event.type === 'inventory.reserved') {
      const updated = await db.orm.update(orders).set({ status: 'confirmed', fulfillmentStatus: 'ready', updatedAt: new Date() }).where(and(eq(orders.id, orderId), eq(orders.status, 'pending'))).returning({ userId: orders.userId, totalAmount: orders.totalAmount, orderNumber: orders.orderNumber });
      if (updated[0]) await publish('order.confirmed', { orderId, userId: updated[0].userId, totalAmount: updated[0].totalAmount, orderNumber: updated[0].orderNumber }, { causationId: event.id, correlationId: event.correlationId });
    } else if (event.type === 'inventory.failed') {
      const cancelled = await db.orm.update(orders).set({ status: 'cancelled', paymentStatus: 'cancelled', updatedAt: new Date() }).where(eq(orders.id, orderId)).returning({ userId: orders.userId, orderNumber: orders.orderNumber });
      if (cancelled[0]) await publish('order.cancelled', { orderId, userId: cancelled[0].userId, orderNumber: cancelled[0].orderNumber, reason: payload.reason || 'OUT_OF_STOCK' }, { causationId: event.id, correlationId: event.correlationId });
      await completeSaga(stepId, 'compensated', null, 'completed');
      return;
    } else if (event.type === 'shipment.created') await transitionFromEvent(orderId, 'preparing', 'ready');
    else if (event.type === 'shipment.shipped') await transitionFromEvent(orderId, 'shipped', 'shipped');
    else if (event.type === 'shipment.delivered') await transitionFromEvent(orderId, 'delivered', 'delivered');
    else if (event.type === 'return.received') await db.query(`UPDATE orders SET fulfillment_status='returned',updated_at=now() WHERE id=$1`, [orderId]);
    await completeSaga(stepId, 'completed');
  } catch (error) {
    await completeSaga(stepId, 'failed', error);
    throw error;
  }
}
async function recordSaga(orderId, step, status, event) {
  const id = crypto.randomUUID();
  await db.query(`INSERT INTO order_saga_steps(id,order_id,step,status,event_id,metadata) VALUES($1,$2,$3,$4,$5,$6)`, [id, orderId, step, status, event.id || null, { correlationId: event.correlationId, causationId: event.causationId, payload: event.payload || {} }]);
  return id;
}
async function completeSaga(id, status, error, compensationStatus = null) {
  await db.query(`UPDATE order_saga_steps SET status=$2,error_code=$3,error_message=$4,compensation_status=$5,completed_at=now() WHERE id=$1`, [id, status, error?.code || null, error?.message || null, compensationStatus]);
}
async function transitionFromEvent(orderId, status, fulfillmentStatus) {
  const result = await db.query(`UPDATE orders SET status=$2,fulfillment_status=$3,updated_at=now() WHERE id=$1 RETURNING *`, [orderId, status, fulfillmentStatus]);
  if (result.rows[0]) await publish('order.status_changed', orderEvent(result.rows[0]));
}
function orderEvent(order) { return { orderId: order.id, orderNumber: order.order_number, userId: order.user_id, status: order.status, paymentStatus: order.payment_status, fulfillmentStatus: order.fulfillment_status, totalAmount: Number(order.total_amount), recipient: order.recipient, createdAt: order.created_at, updatedAt: order.updated_at }; }

app.post('/checkout/quote', async (req, res) => {
  try {
    const quote = await calculateQuote(req.body.items, req.body.couponCode);
    const quoteToken = jwt.sign({ type: 'checkout_quote', items: req.body.items, couponCode: quote.coupon?.code || null, subtotalAmount: quote.subtotalAmount, discountAmount: quote.discountAmount, shippingFee: quote.shippingFee, totalAmount: quote.totalAmount }, jwtSecret(), { expiresIn: '10m', audience: 'techzone-checkout' });
    res.json({ ...quote, quoteToken, expiresIn: 600 });
  } catch (error) { res.status(error.status || 500).json({ code: error.message }); }
});
app.get('/coupons/public', async (_, res) => { const rows = await db.query(`SELECT code,type,value,min_order_amount,max_discount_amount,ends_at FROM coupons WHERE status='active' AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now()) ORDER BY created_at`); res.json({ items: rows.rows }); });
app.get('/coupons/admin', requireAuth, requireRole('admin'), requirePermission('orders.read'), async (_, res) => { const rows = await db.query(`SELECT c.*,count(r.id)::int redemption_count,coalesce(sum(r.discount_amount),0)::int discount_total FROM coupons c LEFT JOIN coupon_redemptions r ON r.coupon_id=c.id GROUP BY c.id ORDER BY c.created_at DESC`); res.json({ items: rows.rows }); });
app.post('/coupons/admin', requireAuth, requireRole('admin'), requirePermission('orders.update'), async (req, res) => { const id=crypto.randomUUID(); await db.query(`INSERT INTO coupons(id,code,type,value,min_order_amount,max_discount_amount,starts_at,ends_at,status,usage_limit,per_customer_limit) VALUES($1,upper($2),$3,$4,$5,$6,$7,$8,$9,$10,1)`,[id,req.body.code,req.body.type||'percent',Number(req.body.value),Number(req.body.minOrderAmount||0),req.body.maxDiscountAmount?Number(req.body.maxDiscountAmount):null,req.body.startsAt||null,req.body.endsAt||null,req.body.status||'active',req.body.usageLimit?Number(req.body.usageLimit):null]);res.status(201).json({id}); });
app.patch('/coupons/admin/:id', requireAuth, requireRole('admin'), requirePermission('orders.update'), async (req,res)=>{const result=await db.query(`UPDATE coupons SET status=COALESCE($2,status),ends_at=COALESCE($3,ends_at) WHERE id=$1 RETURNING *`,[req.params.id,req.body.status||null,req.body.endsAt||null]);res.json(result.rows[0]);});

app.post('/orders', optionalAuth, idempotency(db, 'order.create'), async (req, res) => {
  const { userId, shipping } = req.body;
  if (!userId || !shipping?.recipient || !shipping?.phone || !shipping?.address) return res.status(400).json({ code: 'INVALID_ORDER' });
  if (!req.body.guestOrder && (!req.user || req.user.sub !== userId)) return res.status(403).json({ code: 'ORDER_OWNER_MISMATCH', message: '로그인 사용자와 주문자가 일치하지 않습니다.' });
  if (req.authSource === 'cookie' && req.headers['x-csrf-token'] !== req.cookies?.tz_csrf) return res.status(403).json({ code: 'CSRF_INVALID' });
  let quote; let items;
  try {
    if (req.body.quoteToken) {
      const token = jwt.verify(req.body.quoteToken, jwtSecret(), { audience: 'techzone-checkout' });
      quote = await calculateQuote(token.items, token.couponCode);
      if (quote.totalAmount !== token.totalAmount || quote.discountAmount !== token.discountAmount) return res.status(409).json({ code: 'PRICE_CHANGED', quote });
      items = quote.lines;
    } else {
      items = req.body.items;
      if (!Array.isArray(items) || !items.length || items.some(item => !item.productId || !Number.isInteger(Number(item.quantity)) || Number(item.quantity)<=0 || !Number.isInteger(Number(item.price)) || Number(item.price)<0)) return res.status(400).json({code:'INVALID_ORDER_ITEM'});
      const subtotal=items.reduce((sum,item)=>sum+Number(item.price)*Number(item.quantity),0);
      quote={subtotalAmount:subtotal,discountAmount:0,shippingFee:0,totalAmount:subtotal,taxAmount:Math.round(subtotal/11),coupon:null};
    }
  } catch(error) { return res.status(error.name==='TokenExpiredError'?410:(error.status||400)).json({code:error.name==='TokenExpiredError'?'QUOTE_EXPIRED':error.message}); }
  if (quote.coupon) {
    const used=await db.query(`SELECT 1 FROM coupon_redemptions WHERE coupon_id=$1 AND owner_id=$2`,[quote.coupon.id,userId]);
    if(used.rows[0]) return res.status(409).json({code:'COUPON_ALREADY_USED'});
  }
  const id=crypto.randomUUID(),orderNumber=`TZ-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
  const payload={orderId:id,orderNumber,userId,items,subtotalAmount:quote.subtotalAmount,discountAmount:quote.discountAmount,shippingFee:quote.shippingFee,taxAmount:quote.taxAmount,totalAmount:quote.totalAmount,paymentMethod:req.body.paymentMethod||'card',status:'pending',paymentStatus:'pending',fulfillmentStatus:'unfulfilled',recipient:shipping.recipient,createdAt:new Date().toISOString()};
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO orders(id,user_id,order_number,status,payment_status,fulfillment_status,subtotal_amount,discount_amount,shipping_fee,tax_amount,total_amount,coupon_code,guest_order,payment_method,recipient,phone,address,memo) VALUES($1,$2,$3,'pending','pending','unfulfilled',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[id,userId,orderNumber,quote.subtotalAmount,quote.discountAmount,quote.shippingFee,quote.taxAmount,quote.totalAmount,quote.coupon?.code||null,Boolean(req.body.guestOrder),req.body.paymentMethod||'card',shipping.recipient,shipping.phone,shipping.address,shipping.memo||null]);
    for(const item of items) await client.query(`INSERT INTO order_items(id,order_id,product_id,variant_id,sku,name,brand,image,unit_price,discount_amount,tax_amount,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11)`,[crypto.randomUUID(),id,item.productId,item.variantId||null,item.sku||null,item.name,item.brand,item.image,Number(item.price),Math.round(Number(item.price)*Number(item.quantity)/11),Number(item.quantity)]);
    await client.query(`INSERT INTO order_addresses(id,order_id,type,recipient,phone,postal_code,address1,address2) VALUES($1,$2,'shipping',$3,$4,$5,$6,$7)`,[crypto.randomUUID(),id,shipping.recipient,shipping.phone,shipping.postalCode||null,shipping.address,shipping.address2||null]);
    if(quote.coupon) await client.query(`INSERT INTO coupon_redemptions(id,coupon_id,order_id,owner_id,discount_amount) VALUES($1,$2,$3,$4,$5)`,[crypto.randomUUID(),quote.coupon.id,id,userId,quote.discountAmount]);
    await publish('order.created',payload,{client});
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  res.status(201).json({id,orderNumber,status:'pending',totalAmount:quote.totalAmount,guestOrderToken:req.body.guestOrder?issueGuestToken(id,orderNumber,shipping.phone):undefined});
});

function issueGuestToken(orderId,orderNumber,phone){return jwt.sign({type:'guest_order',orderId,orderNumber,phone:normalizePhone(phone)},jwtSecret(),{expiresIn:'15m',audience:'techzone-guest-order'});}
function verifyGuest(req,orderId){try{const token=String(req.headers.authorization||'').replace(/^Bearer /,'');const payload=jwt.verify(token,jwtSecret(),{audience:'techzone-guest-order'});return payload.type==='guest_order'&&payload.orderId===orderId?payload:null;}catch{return null;}}
app.post('/orders/guest/access',validateDto(GuestAccessDto),async(req,res)=>{const result=await db.query(`SELECT id,order_number,phone FROM orders WHERE order_number=$1 AND guest_order=true`,[req.body.orderNumber]);const order=result.rows[0];if(!order||normalizePhone(order.phone)!==normalizePhone(req.body.phone))return res.status(401).json({code:'GUEST_ORDER_AUTH_FAILED'});res.json({accessToken:issueGuestToken(order.id,order.order_number,order.phone),expiresIn:900,orderId:order.id});});
app.get('/orders/guest/:id',async(req,res)=>{if(!verifyGuest(req,req.params.id))return res.status(401).json({code:'GUEST_TOKEN_REQUIRED'});const result=await orderDetail(req.params.id);if(!result)return res.status(404).json({code:'NOT_FOUND'});res.json(result);});
app.post('/orders/guest/:id/cancel',async(req,res)=>{if(!verifyGuest(req,req.params.id))return res.status(401).json({code:'GUEST_TOKEN_REQUIRED'});const result=await db.query(`UPDATE orders SET status='cancelled',payment_status='cancelled',updated_at=now() WHERE id=$1 AND status IN('pending','confirmed') RETURNING *`,[req.params.id]);if(!result.rows[0])return res.status(409).json({code:'ORDER_NOT_CANCELLABLE'});await publish('order.cancelled',{...orderEvent(result.rows[0]),reason:req.body.reason||'비회원 주문 취소'});res.json({id:req.params.id,status:'cancelled'});});
app.get('/orders', async (req, res, next) => {
  return requireAuth(req, res, () => {
    if (!req.query.userId) return requireRole('admin')(req, res, next);
    if (req.user.sub !== req.query.userId && req.user.role !== 'admin') return res.status(403).json({ code: 'RESOURCE_FORBIDDEN' });
    next();
  });
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
app.get('/orders/:id', requireAuth, async (req, res) => {
  const result=await orderDetail(req.params.id);
  if(!result)return res.status(404).json({code:'NOT_FOUND'});
  if(result.user_id!==req.user.sub&&req.user.role!=='admin')return res.status(403).json({code:'RESOURCE_FORBIDDEN'});
  res.json(result);
});
async function orderDetail(id){const rows=await db.query(`SELECT * FROM orders WHERE id=$1`,[id]);if(!rows.rows[0])return null;const [items,saga]=await Promise.all([db.query(`SELECT * FROM order_items WHERE order_id=$1 ORDER BY id`,[id]),db.query(`SELECT id,step,status,event_id,error_code,error_message,compensation_status,metadata,started_at,completed_at FROM order_saga_steps WHERE order_id=$1 ORDER BY started_at`,[id])]);const order=rows.rows[0];return {...order,items:items.rows,sagaTimeline:saga.rows};}
app.get('/internal/orders', requireInternal, async (_, res) => {
  const result = await db.query(`SELECT o.*,count(i.id)::int item_count,min(i.image) image FROM orders o LEFT JOIN order_items i ON i.order_id=o.id GROUP BY o.id ORDER BY o.created_at DESC`);
  res.json({ items: result.rows });
});
app.get('/internal/orders/:id/items', requireInternal, async (req, res) => { const result = await db.query(`SELECT * FROM order_items WHERE order_id=$1`, [req.params.id]); res.json({ items: result.rows }); });
app.get('/internal/users/:id/purchases',requireInternal,async(req,res)=>{const result=await db.query(`SELECT DISTINCT i.product_id FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.user_id=$1 AND o.status='delivered'`,[req.params.id]);res.json({productIds:result.rows.map(row=>row.product_id)});});

init().then(() => listen(app, 'order')).catch(error => { console.error(error); process.exitCode = 1; });
