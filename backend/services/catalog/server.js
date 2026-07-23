const { database } = require('../../shared/db');
const { server, listen } = require('../../shared/http');
const { publish } = require('../../shared/bus');
const { requireAuth, requireRole, requireInternal, requirePermission } = require('../../shared/auth');

const db = database('catalog');
const app = server('catalog');
const internalHeaders = () => ({ 'x-internal-key': process.env.INTERNAL_API_KEY || 'techzone-internal' });
const seed = [
  ['nova-book-air-14','NOVA Book Air 14','NOVA','노트북',1499000,1080000,'NOVA-BA14','BA14-2026','하루 종일 이어지는 배터리와 선명한 2.8K 디스플레이.','스페이스 그레이','https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1400&q=88',12],
  ['orbit-pro-x','Orbit Pro X','ORBIT','스마트폰',1199000,830000,'ORBIT-PX','OPX-256','손 안의 강력한 퍼포먼스. 50MP 트리플 카메라.','미드나이트','https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?auto=format&fit=crop&w=1400&q=88',18],
  ['sonic-max-anc','Sonic Max ANC','SONIC','오디오',329000,192000,'SONIC-MAX','SMAX-ANC','몰입을 방해하는 소음을 지우는 프리미엄 헤드폰.','크림','https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1400&q=88',4],
  ['arc-mechanical-75','Arc Mechanical 75','ARC','게이밍',219000,121000,'ARC-M75','M75-RGB','정교한 타건감과 자유로운 커스텀을 위한 키보드.','오프화이트','https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1400&q=88',9],
  ['home-mini-beam','Home Mini Beam','LUMEN','스마트홈',549000,375000,'LUMEN-HMB','HMB-FHD','작은 공간도 영화관으로 만드는 포터블 프로젝터.','오프화이트','https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1400&q=88',14],
  ['pixel-watch-s','Pixel Watch S','PIXEL','웨어러블',399000,249000,'PIXEL-WS','PWS-42','오늘의 컨디션을 가장 정확히 읽는 스마트 워치.','실버','https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1400&q=88',3],
  ['dock-one','Dock One','NEXA','액세서리',89000,42000,'NEXA-DOCK','NDK-11','모든 작업 공간을 하나로 연결하는 멀티 허브.','스페이스 블랙','https://images.unsplash.com/photo-1625842268584-8f3296236761?auto=format&fit=crop&w=1400&q=88',23],
  ['frame-4k','Frame 4K','FRAME','게이밍',679000,469000,'FRAME-4K','F4K-144','144Hz 주사율로 더 빠르고 부드러운 플레이를.','블랙','https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=1400&q=88',35],
];

async function init() {
  await db.wait();
  await db.query(`DO $$ BEGIN CREATE TYPE product_status AS ENUM ('draft','published','hidden','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.query(`CREATE TABLE IF NOT EXISTS brands(id UUID PRIMARY KEY,name TEXT UNIQUE NOT NULL,slug TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'active')`);
  await db.query(`CREATE TABLE IF NOT EXISTS categories(id UUID PRIMARY KEY,parent_id UUID,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,display_order INTEGER NOT NULL DEFAULT 0)`);
  await db.query(`CREATE TABLE IF NOT EXISTS products(id UUID PRIMARY KEY,brand_id UUID,category_id UUID,slug TEXT UNIQUE,name TEXT NOT NULL,brand TEXT NOT NULL,category TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),note TEXT,color TEXT,image TEXT,stock INTEGER NOT NULL DEFAULT 0,status product_status NOT NULL DEFAULT 'published',created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS product_variants(id UUID PRIMARY KEY,product_id UUID NOT NULL,sku TEXT UNIQUE NOT NULL,model_number TEXT NOT NULL,barcode TEXT UNIQUE,option_values JSONB NOT NULL DEFAULT '{}',list_price INTEGER NOT NULL CHECK(list_price>=0),sale_price INTEGER NOT NULL CHECK(sale_price>=0),cost_price INTEGER NOT NULL CHECK(cost_price>=0),weight_gram INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'active',created_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS product_images(id UUID PRIMARY KEY,product_id UUID NOT NULL,variant_id UUID,url TEXT NOT NULL,alt TEXT,display_order INTEGER NOT NULL DEFAULT 0,is_primary BOOLEAN NOT NULL DEFAULT false)`);
  await db.query(`CREATE TABLE IF NOT EXISTS product_specs(id UUID PRIMARY KEY,product_id UUID NOT NULL,spec_key TEXT NOT NULL,spec_value TEXT NOT NULL,display_order INTEGER NOT NULL DEFAULT 0)`);
  await db.query(`CREATE TABLE IF NOT EXISTS reviews(id UUID PRIMARY KEY,product_id UUID NOT NULL,user_id UUID,user_name TEXT NOT NULL,rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS product_questions(id UUID PRIMARY KEY,product_id UUID NOT NULL,user_id UUID NOT NULL,user_name TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'published',created_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS product_answers(id UUID PRIMARY KEY,question_id UUID NOT NULL,body TEXT NOT NULL,answered_by UUID,created_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS wishlists(owner_id UUID NOT NULL,product_id UUID NOT NULL,created_at TIMESTAMPTZ DEFAULT now(),PRIMARY KEY(owner_id,product_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS storefront_sections(id UUID PRIMARY KEY,type TEXT NOT NULL,title TEXT NOT NULL,subtitle TEXT,slug TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'published',display_order INTEGER NOT NULL DEFAULT 0,starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ,config JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS storefront_section_products(section_id UUID NOT NULL,product_id UUID NOT NULL,display_order INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(section_id,product_id))`);
  for (const item of seed) await seedProduct(item);
  await seedContent();
}

async function seedProduct(item) {
  const [slug,name,brand,category,price,cost,skuBase,model,note,color,image,stock] = item;
  const exists = await db.query(`SELECT id FROM products WHERE slug=$1`, [slug]);
  if (exists.rows[0]) return;
  const brandId = crypto.randomUUID(); const categoryId = crypto.randomUUID(); const productId = crypto.randomUUID();
  await db.query(`INSERT INTO brands(id,name,slug) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING`, [brandId,brand,brand.toLowerCase()]);
  await db.query(`INSERT INTO categories(id,name,slug,display_order) VALUES($1,$2,$3,$4) ON CONFLICT(slug) DO NOTHING`, [categoryId,category,categorySlug(category),seed.findIndex(value => value[3] === category)]);
  const refs = await db.query(`SELECT (SELECT id FROM brands WHERE name=$1) brand_id,(SELECT id FROM categories WHERE name=$2 LIMIT 1) category_id`, [brand,category]);
  await db.query(`INSERT INTO products(id,brand_id,category_id,slug,name,brand,category,price,note,color,image,stock,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'published')`, [productId,refs.rows[0].brand_id,refs.rows[0].category_id,slug,name,brand,category,price,note,color,image,stock]);
  const colors = [color, color === '블랙' ? '실버' : '블랙'];
  for (let index=0; index<2; index+=1) {
    const variantId=crypto.randomUUID(); const sale=price + index*30000; const sku=`${skuBase}-${index===0?'A':'B'}`;
    await db.query(`INSERT INTO product_variants(id,product_id,sku,model_number,barcode,option_values,list_price,sale_price,cost_price,weight_gram) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [variantId,productId,sku,`${model}-${index+1}`,`880${String(Math.abs(hashCode(sku))).padStart(10,'0').slice(0,10)}`,JSON.stringify({color:colors[index],storage:index===0?'기본':'고급'}),Math.round(sale*1.1),sale,cost+index*20000,category==='노트북'?1280:420]);
  }
  for (let index=0; index<3; index+=1) await db.query(`INSERT INTO product_images(id,product_id,url,alt,display_order,is_primary) VALUES($1,$2,$3,$4,$5,$6)`, [crypto.randomUUID(),productId,index===0?image:`${image}&sat=${90-index*10}`,`${name} 이미지 ${index+1}`,index,index===0]);
  for (const [index,[key,value]] of [['모델명',model],['보증기간','12개월'],['배송','평일 오후 2시 이전 주문 당일 출고']].entries()) await db.query(`INSERT INTO product_specs(id,product_id,spec_key,spec_value,display_order) VALUES($1,$2,$3,$4,$5)`, [crypto.randomUUID(),productId,key,value,index]);
}

async function seedContent() {
  const count=await db.query(`SELECT count(*)::int count FROM storefront_sections`);
  if (!count.rows[0].count) {
    const sections=[
      ['hero','오늘의 테크, 더 좋은 가격으로','검증된 디지털 기기를 빠르게 만나보세요.','hero',0,{eyebrow:'TECHZONE SUPER SALE',cta:'오늘의 특가 보기',theme:'indigo'}],
      ['deal','오늘의 특가','지금 놓치면 아쉬운 가격','today-deal',1,{badge:'최대 18% 할인'}],
      ['popular','실시간 인기 상품','TECHZONE 고객이 가장 많이 찾는 제품','popular',2,{}],
      ['new','새로 들어왔어요','가장 먼저 만나는 새로운 기술','new-arrivals',3,{}],
      ['brand','브랜드 스포트라이트','취향에 맞는 브랜드를 발견하세요','brand-zone',4,{}],
      ['editorial','작업 환경을 바꾸는 작은 선택','연결과 몰입을 위한 데스크 셋업 가이드','desk-setup',5,{cta:'기획전 보기'}],
    ];
    const products=(await db.query(`SELECT id FROM products WHERE status='published' ORDER BY created_at`)).rows;
    for (const section of sections) {
      const id=crypto.randomUUID();
      await db.query(`INSERT INTO storefront_sections(id,type,title,subtitle,slug,display_order,config) VALUES($1,$2,$3,$4,$5,$6,$7)`, [id,...section.slice(0,5),JSON.stringify(section[5])]);
      for (let index=0; index<products.length; index+=1) await db.query(`INSERT INTO storefront_section_products(section_id,product_id,display_order) VALUES($1,$2,$3)`, [id,products[index].id,index]);
    }
  }
  const reviewCount=await db.query(`SELECT count(*)::int count FROM reviews`);
  if (!reviewCount.rows[0].count) {
    const products=(await db.query(`SELECT id FROM products ORDER BY created_at LIMIT 5`)).rows;
    for (let index=0; index<products.length; index+=1) await db.query(`INSERT INTO reviews(id,product_id,user_name,rating,body,status,created_at) VALUES($1,$2,$3,$4,$5,'published',now()-($6::text||' day')::interval)`, [crypto.randomUUID(),products[index].id,['김테크','박디지털','이얼리','최기어','정리뷰'][index],5-(index%2),['배송이 빠르고 포장이 꼼꼼합니다.','가격 대비 성능이 만족스럽습니다.','실물이 더 깔끔하고 사용하기 편합니다.','옵션 선택 안내가 정확했습니다.','다음에도 TECHZONE에서 구매할게요.'][index],index+1]);
  }
}

function categorySlug(value){ return ({노트북:'laptop',스마트폰:'smartphone',오디오:'audio',게이밍:'gaming',스마트홈:'smart-home',웨어러블:'wearable',액세서리:'accessory'})[value] || value.toLowerCase(); }
function hashCode(value){ return [...value].reduce((hash,ch)=>((hash<<5)-hash)+ch.charCodeAt(0),0); }
function productSelect(){ return `SELECT p.*,v.id variant_id,v.sku,v.model_number,v.list_price,v.sale_price,v.option_values,round((v.list_price-v.sale_price)*100.0/NULLIF(v.list_price,0))::int discount_rate FROM products p LEFT JOIN LATERAL(SELECT * FROM product_variants WHERE product_id=p.id AND status='active' ORDER BY sale_price LIMIT 1)v ON true`; }
function responseProduct(row){ return {id:row.id,slug:row.slug,name:row.name,brand:row.brand,category:row.category,price:Number(row.sale_price??row.price),listPrice:Number(row.list_price??row.price),discountRate:Number(row.discount_rate||0),note:row.note,color:row.color,image:row.image,stock:Number(row.stock),status:row.status,variantId:row.variant_id,sku:row.sku,modelNumber:row.model_number,optionValues:row.option_values,createdAt:row.created_at}; }

app.get('/storefront/home', async (_,res)=>{
  const sections=(await db.query(`SELECT * FROM storefront_sections WHERE status='published' AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now()) ORDER BY display_order`)).rows;
  for (const section of sections) {
    const rows=await db.query(`${productSelect()} JOIN storefront_section_products sp ON sp.product_id=p.id WHERE sp.section_id=$1 AND p.status='published' ORDER BY sp.display_order LIMIT 12`,[section.id]);
    section.products=rows.rows.map(responseProduct);
  }
  const categories=(await db.query(`SELECT name,slug FROM categories ORDER BY display_order,name`)).rows;
  const brands=(await db.query(`SELECT name,slug FROM brands WHERE status='active' ORDER BY name`)).rows;
  res.json({sections,categories,brands,shipping:{freeThreshold:80000,fee:3000},coupon:{code:'TECHZONE10',label:'30만원 이상 10% 할인'}});
});

app.get('/products', async (req,res)=>{
  const params=[]; const where=[`p.status='published'`];
  if(req.query.category && String(req.query.category).toLowerCase() !== 'all'){
    params.push(req.query.category,req.query.category);
    where.push(`(p.category=$${params.length-1} OR p.category_id IN(SELECT id FROM categories WHERE slug=$${params.length}))`);
  }
  if(req.query.brand){
    params.push(req.query.brand);
    where.push(`lower(p.brand)=lower($${params.length})`);
  }
  if(req.query.q){
    params.push(req.query.q,req.query.q);
    where.push(`(p.name ILIKE '%'||$${params.length-1}||'%' OR p.brand ILIKE '%'||$${params.length}||'%')`);
  }
  if(req.query.minPrice){
    params.push(Number(req.query.minPrice));
    where.push(`v.sale_price>=$${params.length}`);
  }
  if(req.query.maxPrice){
    params.push(Number(req.query.maxPrice));
    where.push(`v.sale_price<=$${params.length}`);
  }
  if(req.query.inStock==='true') where.push(`p.stock>0`);
  const sort=({price_asc:'v.sale_price ASC',price_desc:'v.sale_price DESC',discount:'discount_rate DESC',popular:'p.stock ASC',newest:'p.created_at DESC'})[req.query.sort]||'p.created_at DESC';
  const page=Math.max(1,Number(req.query.page)||1); const pageSize=Math.min(48,Math.max(1,Number(req.query.pageSize)||24));
  const count=await db.query(`SELECT count(*)::int total FROM (${productSelect()} WHERE ${where.join(' AND ')}) source`,params);
  params.push(pageSize,(page-1)*pageSize);
  const rows=await db.query(`${productSelect()} WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT $${params.length-1} OFFSET $${params.length}`,params);
  res.json({items:rows.rows.map(responseProduct),page,pageSize,total:count.rows[0].total,pageCount:Math.max(1,Math.ceil(count.rows[0].total/pageSize))});
});

async function productDetail(field,value,res){
  const rows=await db.query(`${productSelect()} WHERE p.${field}=$1 AND p.status='published'`,[value]);
  if(!rows.rows[0]) return res.status(404).json({code:'NOT_FOUND'});
  const product=responseProduct(rows.rows[0]);
  const [variants,images,specs,reviews,questions,related]=await Promise.all([
    db.query(`SELECT id,sku,model_number "modelNumber",barcode,option_values "optionValues",list_price "listPrice",sale_price "salePrice",weight_gram "weightGram",status FROM product_variants WHERE product_id=$1 AND status='active' ORDER BY sale_price`,[product.id]),
    db.query(`SELECT id,url,alt,display_order "displayOrder",is_primary "isPrimary" FROM product_images WHERE product_id=$1 ORDER BY display_order`,[product.id]),
    db.query(`SELECT spec_key "key",spec_value "value" FROM product_specs WHERE product_id=$1 ORDER BY display_order`,[product.id]),
    db.query(`SELECT id,user_name "userName",rating,body,created_at "createdAt" FROM reviews WHERE product_id=$1 AND status='published' ORDER BY created_at DESC LIMIT 20`,[product.id]),
    db.query(`SELECT q.id,q.user_name "userName",q.title,q.body,q.created_at "createdAt",a.body answer,a.created_at "answeredAt" FROM product_questions q LEFT JOIN LATERAL(SELECT * FROM product_answers WHERE question_id=q.id ORDER BY created_at DESC LIMIT 1)a ON true WHERE q.product_id=$1 AND q.status='published' ORDER BY q.created_at DESC LIMIT 20`,[product.id]),
    db.query(`${productSelect()} WHERE p.category=$1 AND p.id<>$2 AND p.status='published' ORDER BY p.created_at DESC LIMIT 4`,[product.category,product.id]),
  ]);
  const average=reviews.rows.length?reviews.rows.reduce((sum,item)=>sum+item.rating,0)/reviews.rows.length:0;
  res.json({...product,variants:variants.rows,images:images.rows,specs:specs.rows,reviews:reviews.rows,reviewSummary:{average:Number(average.toFixed(1)),count:reviews.rows.length},questions:questions.rows,related:related.rows.map(responseProduct)});
}
app.get('/products/by-slug/:slug',(req,res)=>productDetail('slug',req.params.slug,res));
app.get('/products/:id',(req,res)=>productDetail('id',req.params.id,res));

app.post('/products/:id/reviews',requireAuth,async(req,res)=>{
  if(!Number.isInteger(Number(req.body.rating))||Number(req.body.rating)<1||Number(req.body.rating)>5||!req.body.body) return res.status(400).json({code:'INVALID_REVIEW'});
  const response=await fetch(`${process.env.ORDER_URL||'http://localhost:3004'}/internal/users/${req.user.sub}/purchases`,{headers:internalHeaders()});
  const purchases=response.ok?(await response.json()).productIds:[];
  if(!purchases.includes(req.params.id)) return res.status(403).json({code:'PURCHASE_REQUIRED'});
  const id=crypto.randomUUID(); await db.query(`INSERT INTO reviews(id,product_id,user_id,user_name,rating,body,status) VALUES($1,$2,$3,$4,$5,$6,'pending')`,[id,req.params.id,req.user.sub,req.user.name||'구매 고객',Number(req.body.rating),req.body.body]);
  res.status(201).json({id,status:'pending'});
});
app.post('/products/:id/questions',requireAuth,async(req,res)=>{
  if(!req.body.title||!req.body.body) return res.status(400).json({code:'INVALID_QUESTION'});
  const id=crypto.randomUUID(); await db.query(`INSERT INTO product_questions(id,product_id,user_id,user_name,title,body) VALUES($1,$2,$3,$4,$5,$6)`,[id,req.params.id,req.user.sub,req.user.name||'고객',req.body.title,req.body.body]);
  res.status(201).json({id,status:'published'});
});
app.get('/wishlists/:ownerId',async(req,res)=>{const rows=await db.query(`${productSelect()} JOIN wishlists w ON w.product_id=p.id WHERE w.owner_id=$1 ORDER BY w.created_at DESC`,[req.params.ownerId]);res.json({items:rows.rows.map(responseProduct)});});
app.post('/wishlists/:ownerId/:productId',requireAuth,async(req,res)=>{if(req.user.sub!==req.params.ownerId)return res.status(403).json({code:'FORBIDDEN'});await db.query(`INSERT INTO wishlists(owner_id,product_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[req.params.ownerId,req.params.productId]);res.status(201).end();});
app.delete('/wishlists/:ownerId/:productId',requireAuth,async(req,res)=>{if(req.user.sub!==req.params.ownerId)return res.status(403).json({code:'FORBIDDEN'});await db.query(`DELETE FROM wishlists WHERE owner_id=$1 AND product_id=$2`,[req.params.ownerId,req.params.productId]);res.status(204).end();});

app.get('/storefront/admin/sections',requireAuth,requireRole('admin'),requirePermission('products.read'),async(_,res)=>{const rows=await db.query(`SELECT s.*,count(sp.product_id)::int product_count FROM storefront_sections s LEFT JOIN storefront_section_products sp ON sp.section_id=s.id GROUP BY s.id ORDER BY s.display_order`);res.json({items:rows.rows});});
app.post('/storefront/admin/sections',requireAuth,requireRole('admin'),requirePermission('products.update'),async(req,res)=>{const id=crypto.randomUUID();await db.query(`INSERT INTO storefront_sections(id,type,title,subtitle,slug,status,display_order,starts_at,ends_at,config) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,req.body.type,req.body.title,req.body.subtitle||null,req.body.slug,req.body.status||'draft',Number(req.body.displayOrder||0),req.body.startsAt||null,req.body.endsAt||null,JSON.stringify(req.body.config||{})]);res.status(201).json({id});});
app.patch('/storefront/admin/sections/:id',requireAuth,requireRole('admin'),requirePermission('products.update'),async(req,res)=>{const result=await db.query(`UPDATE storefront_sections SET title=COALESCE($2,title),subtitle=COALESCE($3,subtitle),status=COALESCE($4,status),display_order=COALESCE($5,display_order),starts_at=$6,ends_at=$7,config=COALESCE($8,config),updated_at=now() WHERE id=$1 RETURNING *`,[req.params.id,req.body.title||null,req.body.subtitle||null,req.body.status||null,req.body.displayOrder===undefined?null:Number(req.body.displayOrder),req.body.startsAt||null,req.body.endsAt||null,req.body.config?JSON.stringify(req.body.config):null]);res.json(result.rows[0]);});

app.post('/products',requireAuth,requireRole('admin'),requirePermission('products.update'),async(req,res)=>{
  const p=req.body;if(!p.name||!p.brand||!p.category||!Number.isInteger(Number(p.price)))return res.status(400).json({code:'INVALID_PRODUCT'});
  const id=crypto.randomUUID(),variantId=crypto.randomUUID(),sku=p.sku||`TZ-${Date.now().toString().slice(-8)}`,slug=p.slug||sku.toLowerCase();
  await db.query(`INSERT INTO products(id,slug,name,brand,category,price,note,color,image,stock,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,slug,p.name,p.brand,p.category,Number(p.price),p.note,p.color,p.image,Number(p.stock||0),p.status||'draft']);
  await db.query(`INSERT INTO product_variants(id,product_id,sku,model_number,barcode,option_values,list_price,sale_price,cost_price,weight_gram) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[variantId,id,sku,p.modelNumber||sku,p.barcode||null,JSON.stringify(p.optionValues||{color:p.color}),Number(p.listPrice||p.price),Number(p.price),Number(p.costPrice||0),Number(p.weightGram||0)]);
  await publish('product.created',{productId:id,variantId,sku,name:p.name,brand:p.brand,category:p.category,price:Number(p.price),costPrice:Number(p.costPrice||0),stock:Number(p.stock||0),status:p.status||'draft',image:p.image,actorId:req.user.sub});res.status(201).json({id,variantId,slug,sku});
});
app.patch('/products/:id',requireAuth,requireRole('admin'),requirePermission('products.update'),async(req,res)=>{const p=req.body;const result=await db.query(`UPDATE products SET name=COALESCE($2,name),brand=COALESCE($3,brand),category=COALESCE($4,category),price=COALESCE($5,price),note=COALESCE($6,note),color=COALESCE($7,color),image=COALESCE($8,image),stock=COALESCE($9,stock),status=COALESCE($10,status),updated_at=now() WHERE id=$1 RETURNING *`,[req.params.id,p.name||null,p.brand||null,p.category||null,p.price===undefined?null:Number(p.price),p.note||null,p.color||null,p.image||null,p.stock===undefined?null:Number(p.stock),p.status||null]);if(!result.rows[0])return res.status(404).json({code:'NOT_FOUND'});await publish('product.updated',{productId:req.params.id,...result.rows[0],actorId:req.user.sub});res.json(result.rows[0]);});
app.get('/reviews',requireAuth,requireRole('admin'),async(_,res)=>{const rows=await db.query(`SELECT id,product_id,user_name,rating,body,status,created_at FROM reviews ORDER BY created_at DESC`);res.json({items:rows.rows});});
app.patch('/reviews/:id',requireAuth,requireRole('admin'),requirePermission('reviews.update'),async(req,res)=>{const result=await db.query(`UPDATE reviews SET status=$1 WHERE id=$2 RETURNING id,status`,[req.body.status,req.params.id]);res.json(result.rows[0]);});
app.get('/internal/products',requireInternal,async(_,res)=>{const result=await db.query(`${productSelect()} ORDER BY p.created_at DESC`);res.json({items:result.rows.map(row=>({...responseProduct(row),variant_id:row.variant_id,model_number:row.model_number,cost_price:row.cost_price,created_at:row.created_at}))});});
app.get('/internal/variants',requireInternal,async(req,res)=>{const ids=String(req.query.ids||'').split(',').filter(Boolean);if(!ids.length)return res.json({items:[]});const result=await db.query(`SELECT v.id variant_id,v.product_id,v.sku,v.option_values,v.list_price,v.sale_price,v.status,p.slug,p.name,p.brand,p.category,p.image,p.stock,p.status product_status FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=ANY($1::uuid[])`,[ids]);res.json({items:result.rows});});
app.get('/internal/reviews',requireInternal,async(_,res)=>{const result=await db.query(`SELECT * FROM reviews ORDER BY created_at DESC`);res.json({items:result.rows});});

init().then(()=>listen(app,'catalog')).catch(error=>{console.error(error);process.exitCode=1;});
