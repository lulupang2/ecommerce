const { database } = require('@techzone/database/db');
const { server, listen } = require('@techzone/config/http');
const { publish, registerReliability } = require('@techzone/messaging/bus');
const { requireAuth, requireRole, requireInternal, requirePermission } = require('@techzone/auth-platform/auth');

const db = database('procurement');
const app = server('procurement');
const internalHeaders = () => ({ 'x-internal-key': process.env.INTERNAL_API_KEY || 'techzone-internal' });

async function init() {
  await db.wait();
  await registerReliability('procurement', db);
  await db.query(`DO $$ BEGIN CREATE TYPE purchase_order_status AS ENUM ('draft','approved','partially_received','received','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.query(`CREATE TABLE IF NOT EXISTS suppliers(id UUID PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,contact_name TEXT,phone TEXT,email TEXT,status TEXT NOT NULL DEFAULT 'active',created_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS supplier_products(id UUID PRIMARY KEY,supplier_id UUID NOT NULL,product_id UUID,variant_id UUID NOT NULL,supplier_sku TEXT,unit_cost INTEGER NOT NULL CHECK(unit_cost>=0),lead_time_days INTEGER NOT NULL DEFAULT 7,UNIQUE(supplier_id,variant_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS purchase_orders(id UUID PRIMARY KEY,purchase_order_number TEXT UNIQUE NOT NULL,supplier_id UUID NOT NULL,warehouse_id UUID NOT NULL,status purchase_order_status NOT NULL,total_amount INTEGER NOT NULL CHECK(total_amount>=0),expected_at TIMESTAMPTZ,approved_by UUID,approved_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS purchase_order_items(id UUID PRIMARY KEY,purchase_order_id UUID NOT NULL,product_id UUID,variant_id UUID NOT NULL,sku TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),received_qty INTEGER NOT NULL DEFAULT 0 CHECK(received_qty>=0),unit_cost INTEGER NOT NULL CHECK(unit_cost>=0))`);
  await db.query(`CREATE TABLE IF NOT EXISTS goods_receipts(id UUID PRIMARY KEY,receipt_number TEXT UNIQUE NOT NULL,purchase_order_id UUID NOT NULL,warehouse_id UUID NOT NULL,received_by UUID,received_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS goods_receipt_items(id UUID PRIMARY KEY,goods_receipt_id UUID NOT NULL,purchase_order_item_id UUID NOT NULL,variant_id UUID NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),condition TEXT NOT NULL DEFAULT 'good')`);
  await seedProcurement();
}

async function seedProcurement() {
  const supplierSeed = [
    ['SUP-NOVA', 'NOVA Korea', '김현우', '02-555-1001', 'supply@nova.kr'],
    ['SUP-MOBILE', 'Orbit Distribution', '이서연', '02-555-1002', 'sales@orbit.kr'],
    ['SUP-DIGITAL', 'Digital Source', '박재민', '02-555-1003', 'order@digitalsource.kr'],
  ];
  for (const supplier of supplierSeed) await db.query(`INSERT INTO suppliers(id,code,name,contact_name,phone,email) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(code) DO NOTHING`, [crypto.randomUUID(), ...supplier]);
  const poCount = await db.query(`SELECT count(*)::int count FROM purchase_orders`);
  if (poCount.rows[0].count) return;
  try {
    const [productsResponse, warehousesResponse] = await Promise.all([
      fetch(`${process.env.CATALOG_URL || 'http://localhost:3002'}/internal/products`, { headers: internalHeaders() }),
      fetch(`${process.env.INVENTORY_URL || 'http://localhost:3006'}/internal/warehouses`, { headers: internalHeaders() }),
    ]);
    if (!productsResponse.ok || !warehousesResponse.ok) return;
    const products = (await productsResponse.json()).items || [];
    const warehouses = (await warehousesResponse.json()).items || [];
    const suppliers = (await db.query(`SELECT * FROM suppliers ORDER BY code`)).rows;
    const warehouse = warehouses.find(item => item.code === 'WH-SEOUL') || warehouses[0];
    for (let index = 0; index < products.length; index += 1) {
      const product = products[index]; const supplier = suppliers[index % suppliers.length];
      await db.query(`INSERT INTO supplier_products(id,supplier_id,product_id,variant_id,supplier_sku,unit_cost,lead_time_days) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(supplier_id,variant_id) DO NOTHING`, [crypto.randomUUID(), supplier.id, product.id, product.variant_id, `SP-${product.sku}`, Number(product.cost_price || Math.round(product.price * 0.65)), 5 + (index % 5)]);
    }
    for (let index = 0; index < 4; index += 1) {
      const supplier = suppliers[index % suppliers.length];
      const items = products.filter((_, productIndex) => productIndex % suppliers.length === index % suppliers.length).slice(0, 3);
      const id = crypto.randomUUID(); const status = ['draft', 'approved', 'partially_received', 'received'][index];
      const total = items.reduce((sum, item) => sum + Number(item.cost_price || item.price * 0.65) * 20, 0);
      await db.query(`INSERT INTO purchase_orders(id,purchase_order_number,supplier_id,warehouse_id,status,total_amount,expected_at,approved_at,created_at) VALUES($1,$2,$3,$4,$5::purchase_order_status,$6,now()+($7::text||' day')::interval,$8,now()-($7::text||' day')::interval)`, [id, `PO-${new Date().getFullYear()}-${String(index + 1).padStart(5, '0')}`, supplier.id, warehouse.id, status, Math.round(total), index + 2, status === 'draft' ? null : new Date()]);
      for (const item of items) await db.query(`INSERT INTO purchase_order_items(id,purchase_order_id,product_id,variant_id,sku,quantity,received_qty,unit_cost) VALUES($1,$2,$3,$4,$5,20,$6,$7)`, [crypto.randomUUID(), id, item.id, item.variant_id, item.sku, status === 'received' ? 20 : status === 'partially_received' ? 8 : 0, Number(item.cost_price || Math.round(item.price * 0.65))]);
    }
  } catch (error) { console.warn('procurement seed skipped:', error.message); }
}

app.get('/procurement/suppliers', requireAuth, requireRole('admin'), async (_, res) => { const result = await db.query(`SELECT s.*,count(sp.id)::int product_count FROM suppliers s LEFT JOIN supplier_products sp ON sp.supplier_id=s.id GROUP BY s.id ORDER BY s.name`); res.json({ items: result.rows }); });
app.get('/procurement/purchase-orders', requireAuth, requireRole('admin'), async (_, res) => {
  const result = await db.query(`SELECT po.*,s.name supplier_name,count(i.id)::int item_count,coalesce(sum(i.quantity-i.received_qty),0)::int outstanding_qty FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id LEFT JOIN purchase_order_items i ON i.purchase_order_id=po.id GROUP BY po.id,s.name ORDER BY po.created_at DESC`);
  res.json({ items: result.rows });
});
app.post('/procurement/purchase-orders', requireAuth, requireRole('admin'), requirePermission('procurement.update'), async (req, res) => {
  const { supplierId, warehouseId, items, expectedAt } = req.body;
  if (!supplierId || !warehouseId || !Array.isArray(items) || !items.length) return res.status(400).json({ code: 'INVALID_PURCHASE_ORDER' });
  const id = crypto.randomUUID(); const number = `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`;
  const total = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitCost), 0);
  await db.query(`INSERT INTO purchase_orders(id,purchase_order_number,supplier_id,warehouse_id,status,total_amount,expected_at) VALUES($1,$2,$3,$4,'draft',$5,$6)`, [id, number, supplierId, warehouseId, total, expectedAt || null]);
  for (const item of items) await db.query(`INSERT INTO purchase_order_items(id,purchase_order_id,product_id,variant_id,sku,quantity,unit_cost) VALUES($1,$2,$3,$4,$5,$6,$7)`, [crypto.randomUUID(), id, item.productId || null, item.variantId, item.sku, Number(item.quantity), Number(item.unitCost)]);
  await publish('purchase_order.created', { purchaseOrderId: id, purchaseOrderNumber: number, supplierId, warehouseId, status: 'draft', totalAmount: total, expectedAt, actorId: req.user.sub });
  res.status(201).json({ id, purchaseOrderNumber: number, status: 'draft' });
});
app.patch('/procurement/purchase-orders/:id/approve', requireAuth, requireRole('admin'), requirePermission('procurement.update'), async (req, res) => {
  const result = await db.query(`UPDATE purchase_orders SET status='approved',approved_by=$2,approved_at=now(),updated_at=now() WHERE id=$1 AND status='draft' RETURNING *`, [req.params.id, req.user.sub]);
  if (!result.rows[0]) return res.status(409).json({ code: 'PURCHASE_ORDER_NOT_DRAFT' });
  await publish('purchase_order.approved', { purchaseOrderId: result.rows[0].id, purchaseOrderNumber: result.rows[0].purchase_order_number, supplierId: result.rows[0].supplier_id, warehouseId: result.rows[0].warehouse_id, status: 'approved', totalAmount: Number(result.rows[0].total_amount), actorId: req.user.sub });
  res.json(result.rows[0]);
});
app.post('/procurement/purchase-orders/:id/receipts', requireAuth, requireRole('admin'), requirePermission('procurement.update'), async (req, res) => {
  const order = await db.query(`SELECT * FROM purchase_orders WHERE id=$1 AND status IN('approved','partially_received')`, [req.params.id]);
  if (!order.rows[0]) return res.status(409).json({ code: 'PURCHASE_ORDER_NOT_RECEIVABLE' });
  const requested = Array.isArray(req.body.items) ? req.body.items : [];
  const receiptId = crypto.randomUUID(); const receiptNumber = `GR-${Date.now().toString().slice(-9)}`;
  await db.query(`INSERT INTO goods_receipts(id,receipt_number,purchase_order_id,warehouse_id,received_by) VALUES($1,$2,$3,$4,$5)`, [receiptId, receiptNumber, req.params.id, order.rows[0].warehouse_id, req.user.sub]);
  for (const receipt of requested) {
    const item = await db.query(`SELECT * FROM purchase_order_items WHERE id=$1 AND purchase_order_id=$2`, [receipt.itemId, req.params.id]);
    if (!item.rows[0]) continue;
    const remaining = Number(item.rows[0].quantity) - Number(item.rows[0].received_qty);
    const quantity = Math.min(Number(receipt.quantity), remaining);
    if (!Number.isInteger(quantity) || quantity <= 0) continue;
    await db.query(`UPDATE purchase_order_items SET received_qty=received_qty+$2 WHERE id=$1`, [receipt.itemId, quantity]);
    await db.query(`INSERT INTO goods_receipt_items(id,goods_receipt_id,purchase_order_item_id,variant_id,quantity,condition) VALUES($1,$2,$3,$4,$5,$6)`, [crypto.randomUUID(), receiptId, receipt.itemId, item.rows[0].variant_id, quantity, receipt.condition || 'good']);
    await publish('inventory.received', { purchaseOrderId: req.params.id, goodsReceiptId: receiptId, warehouseId: order.rows[0].warehouse_id, productId: item.rows[0].product_id, variantId: item.rows[0].variant_id, quantity });
  }
  const outstanding = await db.query(`SELECT sum(quantity-received_qty)::int outstanding FROM purchase_order_items WHERE purchase_order_id=$1`, [req.params.id]);
  const status = Number(outstanding.rows[0].outstanding) === 0 ? 'received' : 'partially_received';
  await db.query(`UPDATE purchase_orders SET status=$2,updated_at=now() WHERE id=$1`, [req.params.id, status]);
  await publish(`purchase_order.${status === 'received' ? 'received' : 'partially_received'}`, { purchaseOrderId: req.params.id, purchaseOrderNumber: order.rows[0].purchase_order_number, supplierId: order.rows[0].supplier_id, warehouseId: order.rows[0].warehouse_id, status, totalAmount: Number(order.rows[0].total_amount), goodsReceiptId: receiptId, actorId: req.user.sub });
  res.status(201).json({ receiptId, receiptNumber, status });
});
app.get('/internal/purchase-orders', requireInternal, async (_, res) => {
  const result = await db.query(`SELECT po.*,s.name supplier_name,count(i.id)::int item_count,sum(i.quantity-i.received_qty)::int outstanding_qty FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id LEFT JOIN purchase_order_items i ON i.purchase_order_id=po.id GROUP BY po.id,s.name ORDER BY po.created_at DESC`);
  res.json({ items: result.rows });
});

init().then(() => listen(app, 'procurement')).catch(error => { console.error(error); process.exitCode = 1; });
