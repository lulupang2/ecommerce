const { eq, ilike, and, or, desc } = require('drizzle-orm');
const { database } = require('../../shared/db');
const { products } = require('../../shared/schema');
const { server, listen } = require('../../shared/http');
const { publish } = require('../../shared/bus');
const { requireAuth, requireRole, requireInternal, requirePermission } = require('../../shared/auth');

const db = database('catalog');
const app = server('catalog');
const seed = [
  ['NOVA Book Air 14', 'NOVA', '노트북', 1499000, 1080000, 'NOVA-BA14-SG', 'BA14-2026', '하루 종일 이어지는 배터리와 선명한 2.8K 디스플레이.', '스페이스 그레이', 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1100&q=85', 12],
  ['Orbit Pro X', 'ORBIT', '스마트폰', 1199000, 830000, 'ORBIT-PX-256', 'OPX-256', '손 안의 강력한 퍼포먼스. 50MP 트리플 카메라.', '미드나이트', 'https://images.unsplash.com/photo-1592899677977-9c10ca588bd?auto=format&fit=crop&w=1100&q=85', 18],
  ['Sonic Max ANC', 'SONIC', '오디오', 329000, 192000, 'SONIC-MAX-CR', 'SMAX-ANC', '몰입을 방해하는 소음을 지우는 프리미엄 헤드폰.', '크림', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1100&q=85', 4],
  ['Arc Mechanical 75', 'ARC', '게이밍', 219000, 121000, 'ARC-M75-WH', 'M75-RGB', '정교한 타건감과 자유로운 커스텀을 위한 키보드.', '오프화이트', 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1100&q=85', 9],
  ['Home Mini Beam', 'LUMEN', '스마트홈', 549000, 375000, 'LUMEN-HMB-WH', 'HMB-FHD', '작은 공간도 영화관으로 만드는 포터블 프로젝터.', '오프화이트', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1100&q=85', 14],
  ['Pixel Watch S', 'PIXEL', '웨어러블', 399000, 249000, 'PIXEL-WS-SL', 'PWS-42', '오늘의 컨디션을 가장 정확히 읽는 스마트 워치.', '실버', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1100&q=85', 3],
  ['Dock One', 'NEXA', '액세서리', 89000, 42000, 'NEXA-DOCK-1', 'NDK-11', '모든 작업 공간을 하나로 연결하는 멀티 허브.', '스페이스 블랙', 'https://images.unsplash.com/photo-1625842268584-8f3296236761?auto=format&fit=crop&w=1100&q=85', 23],
  ['Frame 4K', 'FRAME', '게이밍', 679000, 469000, 'FRAME-4K-27', 'F4K-144', '144Hz 주사율로 더 빠르고 부드러운 플레이를.', '블랙', 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=1100&q=85', 35],
];

async function init() {
  await db.wait();
  await db.query(`DO $$ BEGIN CREATE TYPE product_status AS ENUM ('draft','published','hidden','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.query(`CREATE TABLE IF NOT EXISTS brands(id UUID PRIMARY KEY,name TEXT UNIQUE NOT NULL,slug TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'active')`);
  await db.query(`CREATE TABLE IF NOT EXISTS categories(id UUID PRIMARY KEY,parent_id UUID,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,display_order INTEGER NOT NULL DEFAULT 0)`);
  await db.query(`CREATE TABLE IF NOT EXISTS products(id UUID PRIMARY KEY,brand_id UUID,category_id UUID,slug TEXT,name TEXT NOT NULL,brand TEXT NOT NULL,category TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),note TEXT,color TEXT,image TEXT,stock INTEGER NOT NULL DEFAULT 0,status product_status NOT NULL DEFAULT 'published',created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS product_variants(id UUID PRIMARY KEY,product_id UUID NOT NULL,sku TEXT UNIQUE NOT NULL,model_number TEXT NOT NULL,barcode TEXT UNIQUE,option_values JSONB NOT NULL DEFAULT '{}',list_price INTEGER NOT NULL CHECK(list_price>=0),sale_price INTEGER NOT NULL CHECK(sale_price>=0),cost_price INTEGER NOT NULL CHECK(cost_price>=0),weight_gram INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'active',created_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS product_images(id UUID PRIMARY KEY,product_id UUID NOT NULL,variant_id UUID,url TEXT NOT NULL,alt TEXT,display_order INTEGER NOT NULL DEFAULT 0,is_primary BOOLEAN NOT NULL DEFAULT false)`);
  await db.query(`CREATE TABLE IF NOT EXISTS product_specs(id UUID PRIMARY KEY,product_id UUID NOT NULL,spec_key TEXT NOT NULL,spec_value TEXT NOT NULL,display_order INTEGER NOT NULL DEFAULT 0)`);
  await db.query(`CREATE TABLE IF NOT EXISTS reviews(id UUID PRIMARY KEY,product_id UUID NOT NULL,user_name TEXT NOT NULL,rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ DEFAULT now())`);
  for (const item of seed) await seedProduct(item);
  const reviewCount = await db.query(`SELECT count(*)::int count FROM reviews`);
  if (!reviewCount.rows[0].count) {
    const first = await db.query(`SELECT id FROM products ORDER BY created_at LIMIT 3`);
    for (let index = 0; index < first.rows.length; index += 1) await db.query(`INSERT INTO reviews(id,product_id,user_name,rating,body,status,created_at) VALUES($1,$2,$3,$4,$5,$6,now()-($7||' day')::interval)`, [crypto.randomUUID(), first.rows[index].id, ['김테크', '박유저', '이얼리'][index], 5 - index, ['배송이 빠르고 제품 완성도가 좋습니다.', '업무용으로 만족스럽게 사용 중입니다.', '패키징이 꼼꼼했습니다.'][index], index === 2 ? 'pending' : 'published', index + 1]);
  }
}

async function seedProduct(item) {
  const [name, brand, category, price, costPrice, sku, modelNumber, note, color, image, stock] = item;
  const brandSlug = brand.toLowerCase();
  const categorySlug = encodeURIComponent(category);
  await db.query(`INSERT INTO brands(id,name,slug) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING`, [crypto.randomUUID(), brand, brandSlug]);
  await db.query(`INSERT INTO categories(id,name,slug) VALUES($1,$2,$3) ON CONFLICT(slug) DO NOTHING`, [crypto.randomUUID(), category, categorySlug]);
  let found = await db.query(`SELECT id FROM products WHERE name=$1`, [name]);
  if (!found.rows[0]) {
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO products(id,brand_id,category_id,slug,name,brand,category,price,note,color,image,stock,status) SELECT $1,b.id,c.id,$2,$3,$4,$5,$6,$7,$8,$9,$10,'published' FROM brands b,categories c WHERE b.name=$4 AND c.name=$5 LIMIT 1`, [id, name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, brand, category, price, note, color, image, stock]);
    await db.query(`INSERT INTO product_variants(id,product_id,sku,model_number,barcode,option_values,list_price,sale_price,cost_price,weight_gram) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [crypto.randomUUID(), id, sku, modelNumber, `880${String(Math.abs(hashCode(sku))).padStart(10, '0').slice(0, 10)}`, JSON.stringify({ color }), Math.round(price * 1.08), price, costPrice, category === '노트북' ? 1280 : 420]);
    await db.query(`INSERT INTO product_images(id,product_id,url,alt,is_primary) VALUES($1,$2,$3,$4,true)`, [crypto.randomUUID(), id, image, `${name} 대표 이미지`]);
    await db.query(`INSERT INTO product_specs(id,product_id,spec_key,spec_value,display_order) VALUES($1,$2,'모델명',$3,1),($4,$2,'보증기간','12개월',2)`, [crypto.randomUUID(), id, modelNumber, crypto.randomUUID()]);
  }
}
function hashCode(value) { return [...value].reduce((hash, character) => ((hash << 5) - hash) + character.charCodeAt(0), 0); }
function responseProduct(row) { return { id: row.id, name: row.name, brand: row.brand, category: row.category, price: row.price, note: row.note, color: row.color, image: row.image, stock: row.stock, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt }; }

app.get('/products', async (req, res, next) => {
  if (req.query.status === 'all') return requireAuth(req, res, () => requireRole('admin')(req, res, next));
  next();
}, async (req, res) => {
  const filters = [];
  if (req.query.status !== 'all') filters.push(eq(products.status, 'published'));
  if (req.query.category && !['All', '전체'].includes(req.query.category)) filters.push(eq(products.category, req.query.category));
  if (req.query.q) filters.push(or(ilike(products.name, `%${req.query.q}%`), ilike(products.brand, `%${req.query.q}%`)));
  const rows = await db.orm.select().from(products).where(filters.length ? and(...filters) : undefined).orderBy(desc(products.createdAt));
  res.json({ items: rows.map(responseProduct) });
});
app.get('/products/:id', async (req, res) => {
  const rows = await db.orm.select().from(products).where(eq(products.id, req.params.id)).limit(1);
  if (!rows[0]) return res.status(404).json({ code: 'NOT_FOUND' });
  const variants = await db.query(`SELECT id,sku,model_number AS "modelNumber",barcode,option_values AS "optionValues",list_price AS "listPrice",sale_price AS "salePrice",cost_price AS "costPrice",weight_gram AS "weightGram",status FROM product_variants WHERE product_id=$1 ORDER BY created_at`, [req.params.id]);
  const specs = await db.query(`SELECT spec_key AS "key",spec_value AS "value" FROM product_specs WHERE product_id=$1 ORDER BY display_order`, [req.params.id]);
  res.json({ ...responseProduct(rows[0]), variants: variants.rows, specs: specs.rows });
});
app.post('/products', requireAuth, requireRole('admin'), requirePermission('products.update'), async (req, res) => {
  const product = req.body;
  if (!product.name || !product.brand || !product.category || !Number.isInteger(Number(product.price)) || Number(product.price) < 0) return res.status(400).json({ code: 'INVALID_PRODUCT' });
  const id = crypto.randomUUID();
  const sku = product.sku || `TZ-${Date.now().toString().slice(-8)}`;
  await db.query(`INSERT INTO products(id,slug,name,brand,category,price,note,color,image,stock,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, product.slug || sku.toLowerCase(), product.name, product.brand, product.category, Number(product.price), product.note, product.color, product.image, Number(product.stock || 0), product.status || 'draft']);
  const variantId = crypto.randomUUID();
  await db.query(`INSERT INTO product_variants(id,product_id,sku,model_number,barcode,option_values,list_price,sale_price,cost_price,weight_gram) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [variantId, id, sku, product.modelNumber || sku, product.barcode || null, JSON.stringify(product.optionValues || { color: product.color }), Number(product.listPrice || product.price), Number(product.price), Number(product.costPrice || 0), Number(product.weightGram || 0)]);
  const eventPayload = { productId: id, variantId, sku, name: product.name, brand: product.brand, category: product.category, price: Number(product.price), costPrice: Number(product.costPrice || 0), stock: Number(product.stock || 0), status: product.status || 'draft', image: product.image, actorId: req.user.sub };
  await publish('product.created', eventPayload);
  res.status(201).json({ id, variantId, sku });
});
app.patch('/products/:id', requireAuth, requireRole('admin'), requirePermission('products.update'), async (req, res) => {
  const allowed = ['name', 'brand', 'category', 'price', 'note', 'color', 'image', 'stock', 'status'];
  const changes = Object.fromEntries(Object.entries(req.body).filter(([key, value]) => allowed.includes(key) && value !== undefined));
  if (!Object.keys(changes).length) return res.status(400).json({ code: 'NO_CHANGES' });
  changes.updatedAt = new Date();
  const rows = await db.orm.update(products).set(changes).where(eq(products.id, req.params.id)).returning();
  if (!rows[0]) return res.status(404).json({ code: 'NOT_FOUND' });
  const variantChanges = req.body;
  if (['sku', 'modelNumber', 'barcode', 'listPrice', 'price', 'costPrice', 'weightGram'].some(key => variantChanges[key] !== undefined)) await db.query(`UPDATE product_variants SET sku=COALESCE($2,sku),model_number=COALESCE($3,model_number),barcode=COALESCE($4,barcode),list_price=COALESCE($5,list_price),sale_price=COALESCE($6,sale_price),cost_price=COALESCE($7,cost_price),weight_gram=COALESCE($8,weight_gram) WHERE product_id=$1`, [req.params.id, variantChanges.sku || null, variantChanges.modelNumber || null, variantChanges.barcode || null, variantChanges.listPrice === undefined ? null : Number(variantChanges.listPrice), variantChanges.price === undefined ? null : Number(variantChanges.price), variantChanges.costPrice === undefined ? null : Number(variantChanges.costPrice), variantChanges.weightGram === undefined ? null : Number(variantChanges.weightGram)]);
  const variant = await db.query(`SELECT id,sku,cost_price FROM product_variants WHERE product_id=$1 ORDER BY created_at LIMIT 1`, [req.params.id]);
  await publish('product.updated', { productId: rows[0].id, variantId: variant.rows[0]?.id, sku: variant.rows[0]?.sku, name: rows[0].name, brand: rows[0].brand, category: rows[0].category, price: rows[0].price, costPrice: variant.rows[0]?.cost_price || 0, stock: rows[0].stock, status: rows[0].status, image: rows[0].image, actorId: req.user.sub });
  res.json(responseProduct(rows[0]));
});
app.get('/reviews', requireAuth, requireRole('admin'), async (_, res) => { const rows = await db.query(`SELECT id,product_id,user_name,rating,body,status,created_at FROM reviews ORDER BY created_at DESC LIMIT 200`); res.json({ items: rows.rows }); });
app.patch('/reviews/:id', requireAuth, requireRole('admin'), requirePermission('reviews.update'), async (req, res) => {
  if (!['pending', 'published', 'hidden', 'rejected'].includes(req.body.status)) return res.status(400).json({ code: 'INVALID_STATUS' });
  const result = await db.query(`UPDATE reviews SET status=$1 WHERE id=$2 RETURNING id,status`, [req.body.status, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ code: 'NOT_FOUND' });
  await publish('admin.action', { actorId: req.user.sub, action: 'review.status_changed', entityType: 'review', entityId: req.params.id, reason: req.body.reason || '리뷰 검수', metadata: { status: req.body.status } });
  res.json(result.rows[0]);
});
app.get('/internal/products', requireInternal, async (_, res) => {
  const result = await db.query(`SELECT p.id,p.name,p.brand,p.category,p.price,p.status,p.image,p.stock,p.created_at,v.id variant_id,v.sku,v.model_number,v.cost_price FROM products p LEFT JOIN LATERAL(SELECT * FROM product_variants WHERE product_id=p.id ORDER BY created_at LIMIT 1)v ON true ORDER BY p.created_at DESC`);
  res.json({ items: result.rows });
});
app.get('/internal/reviews', requireInternal, async (_, res) => {
  const result = await db.query(`SELECT id,product_id,user_name,rating,body,status,created_at FROM reviews ORDER BY created_at DESC`);
  res.json({ items: result.rows });
});

init().then(() => listen(app, 'catalog')).catch(error => { console.error(error); process.exitCode = 1; });
