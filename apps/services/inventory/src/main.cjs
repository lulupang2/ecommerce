const { eq, gte, and, sql } = require('drizzle-orm');
const { database } = require('../../shared/db');
const { stock } = require('../../shared/schema');
const { server, listen } = require('../../shared/http');
const { publish, subscribe, registerReliability } = require('../../shared/bus');
const { requireAuth, requireRole, requireInternal, requirePermission } = require('../../shared/auth');
const { idempotency } = require('../../platform/idempotency');
const { validateDto } = require('../../platform/validation');
const { InventoryAdjustmentDto } = require('../../contracts/dtos');

const db = database('inventory');
const app = server('inventory');
let centralWarehouseId;
let returnWarehouseId;

async function init() {
  await db.wait();
  await registerReliability('inventory', db);
  await db.query(`CREATE TABLE IF NOT EXISTS stock(product_id UUID PRIMARY KEY,available_qty INTEGER NOT NULL DEFAULT 0 CHECK(available_qty>=0),version INTEGER NOT NULL DEFAULT 0)`);
  await db.query(`CREATE TABLE IF NOT EXISTS warehouses(id UUID PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL,address TEXT,active BOOLEAN NOT NULL DEFAULT true)`);
  await db.query(`CREATE TABLE IF NOT EXISTS warehouse_bins(id UUID PRIMARY KEY,warehouse_id UUID NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,UNIQUE(warehouse_id,code))`);
  await db.query(`CREATE TABLE IF NOT EXISTS inventory_balances(id UUID PRIMARY KEY,warehouse_id UUID NOT NULL,product_id UUID,variant_id UUID NOT NULL,available_qty INTEGER NOT NULL DEFAULT 0 CHECK(available_qty>=0),reserved_qty INTEGER NOT NULL DEFAULT 0 CHECK(reserved_qty>=0),damaged_qty INTEGER NOT NULL DEFAULT 0 CHECK(damaged_qty>=0),incoming_qty INTEGER NOT NULL DEFAULT 0 CHECK(incoming_qty>=0),version INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ DEFAULT now(),UNIQUE(warehouse_id,variant_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS inventory_movements(id UUID PRIMARY KEY,warehouse_id UUID NOT NULL,product_id UUID,variant_id UUID NOT NULL,type TEXT NOT NULL,quantity INTEGER NOT NULL,reason TEXT,reference_type TEXT,reference_id UUID,actor_id UUID,created_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS inventory_reservations(id UUID PRIMARY KEY,order_id UUID NOT NULL,warehouse_id UUID NOT NULL,variant_id UUID NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),status TEXT NOT NULL,expires_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT now(),UNIQUE(order_id,variant_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS serial_numbers(id UUID PRIMARY KEY,variant_id UUID NOT NULL,warehouse_id UUID NOT NULL,serial_number TEXT UNIQUE NOT NULL,status TEXT NOT NULL,order_id UUID,received_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS stock_alert_rules(id UUID PRIMARY KEY,warehouse_id UUID NOT NULL,variant_id UUID NOT NULL,safety_qty INTEGER NOT NULL DEFAULT 5,reorder_qty INTEGER NOT NULL DEFAULT 20,UNIQUE(warehouse_id,variant_id))`);
  centralWarehouseId = await seedWarehouse('WH-SEOUL', '서울 중앙물류센터', 'fulfillment', '경기도 김포시 고촌읍 물류로 24');
  returnWarehouseId = await seedWarehouse('WH-RETURN', '반품 검수센터', 'returns', '인천광역시 서구 검단로 101');
  await seedFromCatalog();
  await subscribe('inventory', ['inventory.reserve', 'inventory.received'], onEvent);
}
async function seedWarehouse(code, name, type, address) {
  await db.query(`INSERT INTO warehouses(id,code,name,type,address) VALUES($1,$2,$3,$4,$5) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [crypto.randomUUID(), code, name, type, address]);
  const result = await db.query(`SELECT id FROM warehouses WHERE code=$1`, [code]);
  await db.query(`INSERT INTO warehouse_bins(id,warehouse_id,code,name) VALUES($1,$2,'A-01','기본 적치구역') ON CONFLICT(warehouse_id,code) DO NOTHING`, [crypto.randomUUID(), result.rows[0].id]);
  return result.rows[0].id;
}
async function seedFromCatalog() {
  const base = process.env.CATALOG_URL || 'http://localhost:3002';
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      const response = await fetch(`${base}/internal/products`, { headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || 'techzone-internal' } });
      if (!response.ok) throw new Error('catalog not ready');
      const payload = await response.json();
      for (const product of payload.items || []) {
        const variantId = product.variant_id || product.id;
        await db.query(`INSERT INTO stock(product_id,available_qty) VALUES($1,$2) ON CONFLICT(product_id) DO UPDATE SET available_qty=EXCLUDED.available_qty`, [product.id, Number(product.stock || 0)]);
        await db.query(`INSERT INTO inventory_balances(id,warehouse_id,product_id,variant_id,available_qty) VALUES($1,$2,$3,$4,$5) ON CONFLICT(warehouse_id,variant_id) DO NOTHING`, [crypto.randomUUID(), centralWarehouseId, product.id, variantId, Number(product.stock || 0)]);
        await db.query(`INSERT INTO stock_alert_rules(id,warehouse_id,variant_id,safety_qty,reorder_qty) VALUES($1,$2,$3,5,20) ON CONFLICT(warehouse_id,variant_id) DO NOTHING`, [crypto.randomUUID(), centralWarehouseId, variantId]);
        for (let index = 0; index < Math.min(Number(product.stock || 0), 3); index += 1) await db.query(`INSERT INTO serial_numbers(id,variant_id,warehouse_id,serial_number,status) VALUES($1,$2,$3,$4,'available') ON CONFLICT(serial_number) DO NOTHING`, [crypto.randomUUID(), variantId, centralWarehouseId, `${product.sku || 'TZ'}-${String(index + 1).padStart(5, '0')}`]);
      }
      return;
    } catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
}

async function onEvent(event) {
  if (event.type === 'inventory.reserve') return reserve(event);
  if (event.type === 'inventory.received') {
    const payload = event.payload;
    await increaseBalance(payload.warehouseId || centralWarehouseId, payload.variantId, payload.productId, Number(payload.quantity), 'receipt', payload.purchaseOrderId, '발주 입고');
  }
}
async function reserve(event) {
  const payload = event.payload;
  const completed = [];
  try {
    for (const item of payload.items) {
      const variantId = item.variantId || item.productId;
      const balance = await db.query(`UPDATE inventory_balances SET available_qty=available_qty-$1,reserved_qty=reserved_qty+$1,version=version+1,updated_at=now() WHERE warehouse_id=$2 AND (variant_id=$3 OR product_id=$4) AND available_qty >= $1 RETURNING id,variant_id,product_id`, [Number(item.quantity), centralWarehouseId, variantId, item.productId]);
      if (!balance.rows[0]) throw new Error('OUT_OF_STOCK');
      completed.push({ ...balance.rows[0], quantity: Number(item.quantity) });
      await db.query(`INSERT INTO inventory_reservations(id,order_id,warehouse_id,variant_id,quantity,status,expires_at) VALUES($1,$2,$3,$4,$5,'reserved',now()+interval '30 minutes') ON CONFLICT(order_id,variant_id) DO NOTHING`, [crypto.randomUUID(), payload.orderId, centralWarehouseId, balance.rows[0].variant_id, Number(item.quantity)]);
      await db.query(`INSERT INTO inventory_movements(id,warehouse_id,product_id,variant_id,type,quantity,reason,reference_type,reference_id) VALUES($1,$2,$3,$4,'reservation',$5,'주문 재고 예약','order',$6)`, [crypto.randomUUID(), centralWarehouseId, item.productId, balance.rows[0].variant_id, -Number(item.quantity), payload.orderId]);
      await db.orm.update(stock).set({ availableQty: sql`GREATEST(${stock.availableQty} - ${Number(item.quantity)},0)`, version: sql`${stock.version} + 1` }).where(eq(stock.productId, item.productId));
    }
    await publish('inventory.reserved', { ...payload, warehouseId: centralWarehouseId });
  } catch (error) {
    for (const item of completed) await db.query(`UPDATE inventory_balances SET available_qty=available_qty+$1,reserved_qty=GREATEST(reserved_qty-$1,0),version=version+1 WHERE id=$2`, [item.quantity, item.id]);
    await publish('inventory.failed', { orderId: payload.orderId, userId: payload.userId, reason: error.message });
  }
}
async function increaseBalance(warehouseId, variantId, productId, quantity, referenceType, referenceId, reason) {
  await db.query(`INSERT INTO inventory_balances(id,warehouse_id,product_id,variant_id,available_qty) VALUES($1,$2,$3,$4,$5) ON CONFLICT(warehouse_id,variant_id) DO UPDATE SET available_qty=inventory_balances.available_qty+EXCLUDED.available_qty,incoming_qty=GREATEST(inventory_balances.incoming_qty-EXCLUDED.available_qty,0),version=inventory_balances.version+1,updated_at=now()`, [crypto.randomUUID(), warehouseId, productId || null, variantId, quantity]);
  await db.query(`INSERT INTO inventory_movements(id,warehouse_id,product_id,variant_id,type,quantity,reason,reference_type,reference_id) VALUES($1,$2,$3,$4,'receipt',$5,$6,$7,$8)`, [crypto.randomUUID(), warehouseId, productId || null, variantId, quantity, reason, referenceType, referenceId || null]);
  await publish('inventory.received_projected', { warehouseId, variantId, productId, quantity });
}

app.get('/inventory', requireAuth, requireRole('admin'), async (_, res) => {
  const result = await db.query(`SELECT b.id,b.product_id,b.variant_id,b.available_qty,b.reserved_qty,b.damaged_qty,b.incoming_qty,b.version,b.updated_at,w.id warehouse_id,w.code warehouse_code,w.name warehouse_name,r.safety_qty,r.reorder_qty FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id LEFT JOIN stock_alert_rules r ON r.warehouse_id=b.warehouse_id AND r.variant_id=b.variant_id ORDER BY w.name,b.updated_at DESC`);
  res.json({ items: result.rows });
});
app.get('/inventory/operations/movements', requireAuth, requireRole('admin'), async (req, res) => {
  const params = []; const where = [];
  if (req.query.variantId) { params.push(req.query.variantId); where.push(`variant_id=$${params.length}`); }
  const result = await db.query(`SELECT * FROM inventory_movements ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 200`, params);
  res.json({ items: result.rows });
});
app.get('/inventory/operations/serials', requireAuth, requireRole('admin'), async (_, res) => { const result = await db.query(`SELECT s.*,w.name warehouse_name FROM serial_numbers s JOIN warehouses w ON w.id=s.warehouse_id ORDER BY received_at DESC LIMIT 200`); res.json({ items: result.rows }); });
app.get('/inventory/operations/warehouses', requireAuth, requireRole('admin'), async (_, res) => { const result = await db.query(`SELECT * FROM warehouses ORDER BY name`); res.json({ items: result.rows }); });
app.get('/inventory/:productId', async (req, res) => {
  const rows = await db.orm.select().from(stock).where(eq(stock.productId, req.params.productId)).limit(1);
  const item = rows[0];
  res.json(item ? { product_id: item.productId, available_qty: item.availableQty, version: item.version } : { product_id: req.params.productId, available_qty: 0, version: 0 });
});
app.patch('/inventory/:productId', requireAuth, requireRole('admin'), requirePermission('inventory.update'), validateDto(InventoryAdjustmentDto), idempotency(db, 'inventory.adjust'), async (req, res) => {
  const quantity = Number(req.body.availableQty);
  if (!Number.isInteger(quantity) || quantity < 0) return res.status(400).json({ code: 'INVALID_QUANTITY' });
  const current = await db.query(`SELECT * FROM inventory_balances WHERE product_id=$1 AND warehouse_id=$2 LIMIT 1`, [req.params.productId, req.body.warehouseId || centralWarehouseId]);
  const before = Number(current.rows[0]?.available_qty || 0);
  if (current.rows[0]) await db.query(`UPDATE inventory_balances SET available_qty=$1,version=version+1,updated_at=now() WHERE id=$2`, [quantity, current.rows[0].id]);
  else await db.query(`INSERT INTO inventory_balances(id,warehouse_id,product_id,variant_id,available_qty) VALUES($1,$2,$3,$3,$4)`, [crypto.randomUUID(), req.body.warehouseId || centralWarehouseId, req.params.productId, quantity]);
  await db.query(`INSERT INTO stock(product_id,available_qty,version) VALUES($1,$2,0) ON CONFLICT(product_id) DO UPDATE SET available_qty=EXCLUDED.available_qty,version=stock.version+1`, [req.params.productId, quantity]);
  await db.query(`INSERT INTO inventory_movements(id,warehouse_id,product_id,variant_id,type,quantity,reason,actor_id) VALUES($1,$2,$3,$4,'adjustment',$5,$6,$7)`, [crypto.randomUUID(), req.body.warehouseId || centralWarehouseId, req.params.productId, current.rows[0]?.variant_id || req.params.productId, quantity - before, req.body.reason || '관리자 재고 조정', req.user.sub]);
  await publish('inventory.adjusted', { productId: req.params.productId, variantId: current.rows[0]?.variant_id || req.params.productId, warehouseId: req.body.warehouseId || centralWarehouseId, availableQty: quantity, reservedQty: Number(current.rows[0]?.reserved_qty || 0), actorId: req.user.sub, reason: req.body.reason || '관리자 재고 조정' });
  res.json({ product_id: req.params.productId, available_qty: quantity });
});
app.post('/inventory/operations/transfers', requireAuth, requireRole('admin'), requirePermission('inventory.update'), idempotency(db, 'inventory.transfer'), async (req, res) => {
  const { variantId, productId, fromWarehouseId, toWarehouseId, quantity, reason } = req.body;
  if (!variantId || !fromWarehouseId || !toWarehouseId || !Number.isInteger(Number(quantity)) || Number(quantity) <= 0) return res.status(400).json({ code: 'INVALID_TRANSFER' });
  const moved = await db.query(`UPDATE inventory_balances SET available_qty=available_qty-$1,version=version+1 WHERE warehouse_id=$2 AND variant_id=$3 AND available_qty >= $1 RETURNING id`, [Number(quantity), fromWarehouseId, variantId]);
  if (!moved.rows[0]) return res.status(409).json({ code: 'INSUFFICIENT_STOCK' });
  await db.query(`INSERT INTO inventory_balances(id,warehouse_id,product_id,variant_id,available_qty) VALUES($1,$2,$3,$4,$5) ON CONFLICT(warehouse_id,variant_id) DO UPDATE SET available_qty=inventory_balances.available_qty+EXCLUDED.available_qty,version=inventory_balances.version+1`, [crypto.randomUUID(), toWarehouseId, productId || null, variantId, Number(quantity)]);
  for (const [warehouseId, delta] of [[fromWarehouseId, -Number(quantity)], [toWarehouseId, Number(quantity)]]) await db.query(`INSERT INTO inventory_movements(id,warehouse_id,product_id,variant_id,type,quantity,reason,actor_id) VALUES($1,$2,$3,$4,'transfer',$5,$6,$7)`, [crypto.randomUUID(), warehouseId, productId || null, variantId, delta, reason || '창고 이동', req.user.sub]);
  await publish('inventory.transferred', { variantId, productId, fromWarehouseId, toWarehouseId, quantity: Number(quantity), actorId: req.user.sub });
  res.status(201).json({ status: 'transferred' });
});
app.get('/internal/inventory', requireInternal, async (_, res) => { const result = await db.query(`SELECT b.*,w.code warehouse_code,w.name warehouse_name,r.safety_qty,r.reorder_qty FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id LEFT JOIN stock_alert_rules r ON r.warehouse_id=b.warehouse_id AND r.variant_id=b.variant_id ORDER BY b.updated_at DESC`); res.json({ items: result.rows }); });
app.get('/internal/warehouses', requireInternal, async (_, res) => { const result = await db.query(`SELECT * FROM warehouses ORDER BY name`); res.json({ items: result.rows }); });

init().then(() => listen(app, 'inventory')).catch(error => { console.error(error); process.exitCode = 1; });
