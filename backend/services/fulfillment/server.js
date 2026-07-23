const { database } = require('../../shared/db');
const { server, listen } = require('../../shared/http');
const { publish, subscribe } = require('../../shared/bus');
const { requireAuth, requireRole, requireInternal, requirePermission } = require('../../shared/auth');
const jwt = require('jsonwebtoken');

const db = database('fulfillment');
const app = server('fulfillment');
const internalHeaders = () => ({ 'x-internal-key': process.env.INTERNAL_API_KEY || 'techzone-internal' });

async function init() {
  await db.wait();
  await db.query(`DO $$ BEGIN CREATE TYPE shipment_status AS ENUM ('ready','packed','shipped','delivered','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.query(`DO $$ BEGIN CREATE TYPE return_status AS ENUM ('requested','approved','received','refunded','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.query(`CREATE TABLE IF NOT EXISTS shipments(id UUID PRIMARY KEY,order_id UUID NOT NULL UNIQUE,shipment_number TEXT UNIQUE NOT NULL,warehouse_id UUID NOT NULL,carrier TEXT NOT NULL,tracking_number TEXT UNIQUE,status shipment_status NOT NULL,recipient TEXT,shipped_at TIMESTAMPTZ,delivered_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS shipment_items(id UUID PRIMARY KEY,shipment_id UUID NOT NULL,order_item_id UUID NOT NULL,variant_id UUID,sku TEXT,quantity INTEGER NOT NULL CHECK(quantity>0))`);
  await db.query(`CREATE TABLE IF NOT EXISTS tracking_events(id UUID PRIMARY KEY,shipment_id UUID NOT NULL,status TEXT NOT NULL,location TEXT,message TEXT NOT NULL,occurred_at TIMESTAMPTZ NOT NULL)`);
  await db.query(`CREATE TABLE IF NOT EXISTS returns(id UUID PRIMARY KEY,order_id UUID NOT NULL,return_number TEXT UNIQUE NOT NULL,status return_status NOT NULL,reason TEXT NOT NULL,refund_amount INTEGER NOT NULL DEFAULT 0,requested_at TIMESTAMPTZ DEFAULT now(),completed_at TIMESTAMPTZ,updated_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS return_items(id UUID PRIMARY KEY,return_id UUID NOT NULL,order_item_id UUID NOT NULL,variant_id UUID,sku TEXT,quantity INTEGER NOT NULL CHECK(quantity>0),condition TEXT)`);
  await seedFulfillment();
  await subscribe('fulfillment', ['order.confirmed'], async event => createShipment(event.payload));
}

async function warehouseId() {
  const response = await fetch(`${process.env.INVENTORY_URL || 'http://localhost:3006'}/internal/warehouses`, { headers: internalHeaders() });
  const payload = await response.json();
  return payload.items.find(item => item.code === 'WH-SEOUL')?.id || payload.items[0]?.id;
}
async function createShipment(payload) {
  const existing = await db.query(`SELECT * FROM shipments WHERE order_id=$1`, [payload.orderId]);
  if (existing.rows[0]) return existing.rows[0];
  const wh = await warehouseId();
  if (!wh) throw new Error('WAREHOUSE_NOT_READY');
  const id = crypto.randomUUID();
  const shipmentNumber = `SHP-${Date.now().toString().slice(-10)}`;
  await db.query(`INSERT INTO shipments(id,order_id,shipment_number,warehouse_id,carrier,status,recipient) VALUES($1,$2,$3,$4,'CJ대한통운','ready',$5)`, [id, payload.orderId, shipmentNumber, wh, payload.recipient || '고객']);
  try {
    const response = await fetch(`${process.env.ORDER_URL || 'http://localhost:3004'}/internal/orders/${payload.orderId}/items`, { headers: internalHeaders() });
    const items = (await response.json()).items || [];
    for (const item of items) await db.query(`INSERT INTO shipment_items(id,shipment_id,order_item_id,variant_id,sku,quantity) VALUES($1,$2,$3,$4,$5,$6)`, [crypto.randomUUID(), id, item.id, item.variant_id, item.sku, item.quantity]);
  } catch {}
  const eventPayload = { shipmentId: id, shipmentNumber, orderId: payload.orderId, warehouseId: wh, status: 'ready', carrier: 'CJ대한통운', recipient: payload.recipient, createdAt: new Date().toISOString() };
  await publish('shipment.created', eventPayload);
  return eventPayload;
}
async function seedFulfillment() {
  try {
    const response = await fetch(`${process.env.ORDER_URL || 'http://localhost:3004'}/internal/orders`, { headers: internalHeaders() });
    if (!response.ok) return;
    const orders = (await response.json()).items || [];
    const wh = await warehouseId();
    for (const order of orders.filter(item => ['preparing', 'shipped', 'delivered'].includes(item.status)).slice(0, 12)) {
      const status = order.status === 'preparing' ? 'ready' : order.status;
      const id = crypto.randomUUID();
      const tracking = status === 'ready' ? null : `6890${order.id.replaceAll('-', '').slice(0, 12)}`;
      const inserted = await db.query(`INSERT INTO shipments(id,order_id,shipment_number,warehouse_id,carrier,tracking_number,status,recipient,shipped_at,delivered_at,created_at) VALUES($1,$2,$3,$4,'CJ대한통운',$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id`, [id, order.id, `SHP-${order.order_number.slice(-8)}`, wh, tracking, status, order.recipient, status !== 'ready' ? order.updated_at : null, status === 'delivered' ? order.updated_at : null, order.created_at]);
      if (tracking && inserted.rows[0]) await db.query(`INSERT INTO tracking_events(id,shipment_id,status,location,message,occurred_at) VALUES($1,$2,$3,'곤지암 HUB',$4,$5)`, [crypto.randomUUID(), id, status, status === 'delivered' ? '배송이 완료되었습니다.' : '상품이 이동 중입니다.', order.updated_at || new Date()]);
    }
    const delivered = orders.filter(item => item.status === 'delivered').slice(0, 2);
    for (let index = 0; index < delivered.length; index += 1) await db.query(`INSERT INTO returns(id,order_id,return_number,status,reason,refund_amount,requested_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,now()-interval '1 day',now()) ON CONFLICT(return_number) DO NOTHING`, [crypto.randomUUID(), delivered[index].id, `RET-${String(index + 1).padStart(7, '0')}`, index === 0 ? 'requested' : 'received', index === 0 ? '단순 변심' : '초기 불량', Number(delivered[index].total_amount),]);
  } catch (error) { console.warn('fulfillment seed skipped:', error.message); }
}

app.get('/fulfillment/shipments', requireAuth, requireRole('admin'), async (_, res) => {
  const result = await db.query(`SELECT * FROM shipments ORDER BY created_at DESC`);
  res.json({ items: result.rows });
});
app.post('/fulfillment/shipments', requireAuth, requireRole('admin'), requirePermission('fulfillment.update'), async (req, res) => {
  const shipment = await createShipment(req.body);
  await publish('admin.action', { actorId: req.user.sub, action: 'shipment.create', entityType: 'shipment', entityId: shipment.shipmentId, metadata: req.body });
  res.status(201).json(shipment);
});
app.patch('/fulfillment/shipments/:id/status', requireAuth, requireRole('admin'), requirePermission('fulfillment.update'), async (req, res) => {
  const current = await db.query(`SELECT * FROM shipments WHERE id=$1`, [req.params.id]);
  if (!current.rows[0]) return res.status(404).json({ code: 'NOT_FOUND' });
  const transitions = { ready: ['packed', 'cancelled'], packed: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };
  if (!transitions[current.rows[0].status]?.includes(req.body.status)) return res.status(409).json({ code: 'INVALID_STATUS_TRANSITION' });
  const tracking = req.body.trackingNumber || current.rows[0].tracking_number || (req.body.status === 'shipped' ? `6890${Date.now().toString().slice(-8)}` : null);
  const result = await db.query(`UPDATE shipments SET status=$2::shipment_status,tracking_number=$3,shipped_at=CASE WHEN $2::text='shipped' THEN now() ELSE shipped_at END,delivered_at=CASE WHEN $2::text='delivered' THEN now() ELSE delivered_at END,updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id, req.body.status, tracking]);
  await db.query(`INSERT INTO tracking_events(id,shipment_id,status,location,message,occurred_at) VALUES($1,$2,$3,$4,$5,now())`, [crypto.randomUUID(), req.params.id, req.body.status, req.body.location || 'TECHZONE 물류센터', req.body.reason || `배송 상태가 ${req.body.status}(으)로 변경되었습니다.`]);
  await publish(`shipment.${req.body.status}`, { shipmentId: req.params.id, shipmentNumber: result.rows[0].shipment_number, orderId: result.rows[0].order_id, status: req.body.status, trackingNumber: tracking, carrier: result.rows[0].carrier, actorId: req.user.sub });
  res.json(result.rows[0]);
});
app.get('/fulfillment/returns', requireAuth, requireRole('admin'), async (_, res) => { const result = await db.query(`SELECT * FROM returns ORDER BY requested_at DESC`); res.json({ items: result.rows }); });
app.post('/fulfillment/returns', requireAuth, requireRole('admin'), requirePermission('fulfillment.update'), async (req, res) => {
  if (!req.body.orderId || !req.body.reason) return res.status(400).json({ code: 'INVALID_RETURN' });
  const id = crypto.randomUUID(); const returnNumber = `RET-${Date.now().toString().slice(-9)}`;
  await db.query(`INSERT INTO returns(id,order_id,return_number,status,reason,refund_amount) VALUES($1,$2,$3,'requested',$4,$5)`, [id, req.body.orderId, returnNumber, req.body.reason, Number(req.body.refundAmount || 0)]);
  await publish('return.requested', { returnId: id, returnNumber, orderId: req.body.orderId, status: 'requested', reason: req.body.reason, refundAmount: Number(req.body.refundAmount || 0), actorId: req.user.sub });
  res.status(201).json({ id, returnNumber, status: 'requested' });
});
app.post('/fulfillment/returns/guest', async (req, res) => {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const access = jwt.verify(token, process.env.JWT_SECRET || 'canvas-local-secret', { audience: 'techzone-guest-order' });
    if (access.type !== 'guest_order' || access.orderId !== req.body.orderId) return res.status(403).json({ code: 'GUEST_ORDER_FORBIDDEN' });
    const response = await fetch(`${process.env.ORDER_URL || 'http://localhost:3004'}/internal/orders`, { headers: internalHeaders() });
    const order = (await response.json()).items.find(item => item.id === req.body.orderId);
    if (!order || order.status !== 'delivered' || Date.now() - new Date(order.updated_at).getTime() > 7 * 86400000) return res.status(409).json({ code: 'RETURN_WINDOW_CLOSED' });
    const id = crypto.randomUUID(); const returnNumber = `RET-${Date.now().toString().slice(-9)}`;
    await db.query(`INSERT INTO returns(id,order_id,return_number,status,reason,refund_amount) VALUES($1,$2,$3,'requested',$4,$5)`, [id, req.body.orderId, returnNumber, req.body.reason || '비회원 반품 요청', Number(req.body.refundAmount || order.total_amount)]);
    await publish('return.requested', { returnId: id, returnNumber, orderId: req.body.orderId, status: 'requested', reason: req.body.reason, refundAmount: Number(req.body.refundAmount || order.total_amount) });
    res.status(201).json({ id, returnNumber, status: 'requested' });
  } catch (error) { res.status(error.name === 'TokenExpiredError' ? 410 : 401).json({ code: error.name === 'TokenExpiredError' ? 'GUEST_TOKEN_EXPIRED' : 'GUEST_TOKEN_REQUIRED' }); }
});
app.patch('/fulfillment/returns/:id/status', requireAuth, requireRole('admin'), requirePermission('fulfillment.update'), async (req, res) => {
  const current = await db.query(`SELECT * FROM returns WHERE id=$1`, [req.params.id]);
  if (!current.rows[0]) return res.status(404).json({ code: 'NOT_FOUND' });
  const transitions = { requested: ['approved', 'rejected'], approved: ['received'], received: ['refunded'], refunded: [], rejected: [] };
  if (!transitions[current.rows[0].status]?.includes(req.body.status)) return res.status(409).json({ code: 'INVALID_STATUS_TRANSITION' });
  const result = await db.query(`UPDATE returns SET status=$2::return_status,completed_at=CASE WHEN $2::text IN('refunded','rejected') THEN now() ELSE completed_at END,updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id, req.body.status]);
  await publish(`return.${req.body.status}`, { returnId: result.rows[0].id, returnNumber: result.rows[0].return_number, orderId: result.rows[0].order_id, status: result.rows[0].status, refundAmount: Number(result.rows[0].refund_amount), actorId: req.user.sub, reason: req.body.reason });
  res.json(result.rows[0]);
});
app.post('/fulfillment/returns/:id/refund', requireAuth, requireRole('admin'), requirePermission('payments.refund'), async (req, res) => {
  const current = await db.query(`SELECT * FROM returns WHERE id=$1 AND status='received'`, [req.params.id]);
  if (!current.rows[0]) return res.status(409).json({ code: 'RETURN_NOT_RECEIVED' });
  const response = await fetch(`${process.env.PAYMENT_URL || 'http://localhost:3005'}/payments/${current.rows[0].order_id}/refunds`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: req.headers.authorization }, body: JSON.stringify({ amount: Number(req.body.amount || current.rows[0].refund_amount), reason: req.body.reason || current.rows[0].reason }) });
  const payload = await response.json();
  if (!response.ok) return res.status(response.status).json(payload);
  await db.query(`UPDATE returns SET status='refunded',completed_at=now(),updated_at=now() WHERE id=$1`, [req.params.id]);
  await publish('return.refunded', { returnId: req.params.id, returnNumber: current.rows[0].return_number, orderId: current.rows[0].order_id, status: 'refunded', refundAmount: payload.refundAmount, actorId: req.user.sub });
  res.json({ ...payload, returnId: req.params.id });
});
app.get('/internal/shipments', requireInternal, async (_, res) => { const result = await db.query(`SELECT * FROM shipments ORDER BY created_at DESC`); res.json({ items: result.rows }); });
app.get('/internal/returns', requireInternal, async (_, res) => { const result = await db.query(`SELECT * FROM returns ORDER BY requested_at DESC`); res.json({ items: result.rows }); });

init().then(() => listen(app, 'fulfillment')).catch(error => { console.error(error); process.exitCode = 1; });
