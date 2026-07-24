import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Client } = pg;
const host = process.env.POSTGRES_HOST || 'localhost';
const port = Number(process.env.POSTGRES_PORT || 5432);
const user = process.env.POSTGRES_USER || 'canvas';
const password = process.env.POSTGRES_PASSWORD || 'canvas';

const ids = {
  admin: '10000000-0000-4000-8000-000000000001',
  customer: '10000000-0000-4000-8000-000000000002',
  role: '10000000-0000-4000-8000-000000000003',
  brand: '20000000-0000-4000-8000-000000000001',
  category: '20000000-0000-4000-8000-000000000002',
  section: '20000000-0000-4000-8000-000000000003',
  warehouse: '30000000-0000-4000-8000-000000000001',
  returnWarehouse: '30000000-0000-4000-8000-000000000002',
  coupon: '40000000-0000-4000-8000-000000000001',
  supplier: '50000000-0000-4000-8000-000000000001',
};

const products = [
  {
    id: '21000000-0000-4000-8000-000000000001',
    variantId: '22000000-0000-4000-8000-000000000001',
    slug: 'techzone-ultra-14',
    name: 'TECHZONE 울트라 14 노트북',
    sku: 'TZ-NB-ULTRA14',
    model: 'TZU14-2026',
    price: 1499000,
    listPrice: 1699000,
    cost: 1040000,
    stock: 32,
    image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1200&q=85',
  },
  {
    id: '21000000-0000-4000-8000-000000000002',
    variantId: '22000000-0000-4000-8000-000000000002',
    slug: 'techzone-oled-monitor-32',
    name: 'TECHZONE OLED 게이밍 모니터 32',
    sku: 'TZ-MN-OLED32',
    model: 'TZO32-240',
    price: 1099000,
    listPrice: 1299000,
    cost: 760000,
    stock: 18,
    image: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=1200&q=85',
  },
  {
    id: '21000000-0000-4000-8000-000000000003',
    variantId: '22000000-0000-4000-8000-000000000003',
    slug: 'techzone-pro-headset',
    name: 'TECHZONE 프로 무선 헤드셋',
    sku: 'TZ-AU-PRO',
    model: 'TZH-PRO2',
    price: 249000,
    listPrice: 299000,
    cost: 142000,
    stock: 54,
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=85',
  },
  {
    id: '21000000-0000-4000-8000-000000000004',
    variantId: '22000000-0000-4000-8000-000000000004',
    slug: 'techzone-mechanical-keyboard',
    name: 'TECHZONE 커스텀 기계식 키보드',
    sku: 'TZ-KB-CUSTOM',
    model: 'TZK-87',
    price: 189000,
    listPrice: 219000,
    cost: 99000,
    stock: 7,
    image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1200&q=85',
  },
];
const seededOrderIds = new Map();
let seededWarehouseId = ids.warehouse;

async function withDatabase(database, operation) {
  const client = new Client({ host, port, user, password, database });
  await client.connect();
  try {
    await client.query('BEGIN');
    await operation(client);
    await client.query('COMMIT');
    console.log(JSON.stringify({ database, status: 'seeded' }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

await withDatabase('auth', async client => {
  const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'TechzoneAdmin123!', 10);
  const customerHash = await bcrypt.hash('TechzoneUser123!', 10);
  await client.query(
    `INSERT INTO roles(id,code,name,description) VALUES($1,'super_admin','슈퍼관리자','모든 관리자 기능')
     ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description`,
    [ids.role],
  );
  const admin = await client.query(
    `INSERT INTO users(id,email,password_hash,name,role,status)
     VALUES($1,$2,$3,'TECHZONE 관리자','admin','active')
     ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,status='active'
     RETURNING id`,
    [ids.admin, process.env.ADMIN_EMAIL || 'admin@techzone.local', adminHash],
  );
  await client.query(
    `INSERT INTO users(id,email,password_hash,name,role,phone,status)
     VALUES($1,'customer@techzone.local',$2,'김테크','customer','010-1234-5678','active')
     ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,status='active'`,
    [ids.customer, customerHash],
  );
  await client.query(
    `INSERT INTO user_roles(user_id,role_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
    [admin.rows[0].id, ids.role],
  );
});

await withDatabase('catalog', async client => {
  const brand = await client.query(
    `INSERT INTO brands(id,name,slug) VALUES($1,'TECHZONE','techzone')
     ON CONFLICT(name) DO UPDATE SET slug=EXCLUDED.slug RETURNING id`,
    [ids.brand],
  );
  const category = await client.query(
    `INSERT INTO categories(id,name,slug,display_order)
     VALUES($1,'테크 기기','tech-devices',0)
     ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
    [ids.category],
  );
  for (const [index, product] of products.entries()) {
    await client.query(
      `INSERT INTO products(
        id,brand_id,category_id,slug,name,brand,category,price,note,color,image,stock,status
      ) VALUES($1,$2,$3,$4,$5,'TECHZONE','테크 기기',$6,$7,'블랙',$8,$9,'published')
      ON CONFLICT(id) DO UPDATE SET price=EXCLUDED.price,stock=EXCLUDED.stock,status='published'`,
      [
        product.id,
        brand.rows[0].id,
        category.rows[0].id,
        product.slug,
        product.name,
        product.price,
        '<p>업무와 엔터테인먼트를 위한 TECHZONE 공식 제품입니다.</p>',
        product.image,
        product.stock,
      ],
    );
    await client.query(
      `INSERT INTO product_variants(
        id,product_id,sku,model_number,barcode,option_values,list_price,sale_price,cost_price,weight_gram
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,850)
      ON CONFLICT(sku) DO UPDATE SET sale_price=EXCLUDED.sale_price,cost_price=EXCLUDED.cost_price`,
      [
        product.variantId,
        product.id,
        product.sku,
        product.model,
        `88010000000${index}`,
        JSON.stringify({ color: '블랙', option: '기본' }),
        product.listPrice,
        product.price,
        product.cost,
      ],
    );
    await client.query(
      `INSERT INTO product_images(id,product_id,url,alt,display_order,is_primary)
       VALUES($1,$2,$3,$4,0,true) ON CONFLICT(id) DO NOTHING`,
      [`23000000-0000-4000-8000-00000000000${index + 1}`, product.id, product.image, product.name],
    );
    await client.query(
      `INSERT INTO product_specs(id,product_id,spec_key,spec_value,display_order)
       VALUES($1,$2,'모델명',$3,0) ON CONFLICT(id) DO NOTHING`,
      [`24000000-0000-4000-8000-00000000000${index + 1}`, product.id, product.model],
    );
  }
  await client.query(
    `INSERT INTO storefront_sections(id,type,title,subtitle,slug,status,display_order,config)
     VALUES($1,'hero','오늘의 테크, 더 좋은 가격으로','검증된 IT 기기를 빠르게 만나보세요','main-hero','published',0,$2)
     ON CONFLICT(slug) DO UPDATE SET status='published',config=EXCLUDED.config`,
    [ids.section, JSON.stringify({ eyebrow: 'TECHZONE SUPER SALE', cta: '상품 보러가기' })],
  );
  for (const [index, product] of products.entries()) {
    await client.query(
      `INSERT INTO storefront_section_products(section_id,product_id,display_order)
       VALUES($1,$2,$3) ON CONFLICT(section_id,product_id) DO UPDATE SET display_order=EXCLUDED.display_order`,
      [ids.section, product.id, index],
    );
  }
});

await withDatabase('inventory', async client => {
  const warehouse = await client.query(
    `INSERT INTO warehouses(id,code,name,type,address)
     VALUES($1,'WH-SEOUL','TECHZONE 중앙창고','central','경기도 이천시 물류단지')
     ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
    [ids.warehouse],
  );
  seededWarehouseId = warehouse.rows[0].id;
  await client.query(
    `INSERT INTO warehouses(id,code,name,type,address)
     VALUES($1,'WH-RETURN','TECHZONE 반품창고','returns','경기도 이천시 반품센터')
     ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name`,
    [ids.returnWarehouse],
  );
  for (const [index, product] of products.entries()) {
    const balanceId = `31000000-0000-4000-8000-00000000000${index + 1}`;
    const alertId = `32000000-0000-4000-8000-00000000000${index + 1}`;
    await client.query(
      `INSERT INTO stock(product_id,available_qty) VALUES($1,$2)
       ON CONFLICT(product_id) DO UPDATE SET available_qty=EXCLUDED.available_qty`,
      [product.id, product.stock],
    );
    await client.query(
      `DELETE FROM inventory_balances WHERE id=$1 AND warehouse_id<>$2`,
      [balanceId, seededWarehouseId],
    );
    await client.query(
      `INSERT INTO inventory_balances(id,warehouse_id,product_id,variant_id,available_qty)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(warehouse_id,variant_id) DO UPDATE SET available_qty=EXCLUDED.available_qty`,
      [balanceId, seededWarehouseId, product.id, product.variantId, product.stock],
    );
    await client.query(
      `DELETE FROM stock_alert_rules WHERE id=$1 AND warehouse_id<>$2`,
      [alertId, seededWarehouseId],
    );
    await client.query(
      `INSERT INTO stock_alert_rules(id,warehouse_id,variant_id,safety_qty,reorder_qty)
       VALUES($1,$2,$3,10,30) ON CONFLICT(warehouse_id,variant_id) DO NOTHING`,
      [alertId, seededWarehouseId, product.variantId],
    );
  }
});

await withDatabase('orders', async client => {
  await client.query(
    `INSERT INTO coupons(
      id,code,type,value,min_order_amount,max_discount_amount,status,per_customer_limit
    ) VALUES($1,'TECHZONE10','percent',10,300000,50000,'active',1)
    ON CONFLICT(code) DO UPDATE SET status='active',value=10`,
    [ids.coupon],
  );
  const statuses = [
    ['41000000-0000-4000-8000-000000000001', 'TZ-2026-000001', 'delivered', 'approved', 'delivered', 1499000],
    ['41000000-0000-4000-8000-000000000002', 'TZ-2026-000002', 'shipped', 'approved', 'shipped', 249000],
    ['41000000-0000-4000-8000-000000000003', 'TZ-2026-000003', 'confirmed', 'approved', 'ready', 189000],
  ];
  for (const [index, order] of statuses.entries()) {
    const insertedOrder = await client.query(
      `INSERT INTO orders(
        id,user_id,order_number,status,payment_status,fulfillment_status,subtotal_amount,
        discount_amount,shipping_fee,tax_amount,total_amount,recipient,phone,address,payment_method,
        created_at,updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,0,0,$8,$7,'김테크','010-1234-5678',
        '서울특별시 강남구 테헤란로 123','card',now()-($9::text||' days')::interval,now())
      ON CONFLICT(order_number) DO UPDATE SET updated_at=orders.updated_at RETURNING id`,
      [
        order[0], ids.customer, order[1], order[2], order[3], order[4], order[5],
        Math.round(Number(order[5]) / 11), index + 1,
      ],
    );
    const orderId = insertedOrder.rows[0].id;
    seededOrderIds.set(order[1], orderId);
    const product = products[index];
    await client.query(
      `INSERT INTO order_items(
        id,order_id,product_id,variant_id,sku,name,brand,image,unit_price,tax_amount,quantity
      ) VALUES($1,$2,$3,$4,$5,$6,'TECHZONE',$7,$8,$9,1) ON CONFLICT(id) DO NOTHING`,
      [
        `42000000-0000-4000-8000-00000000000${index + 1}`, orderId, product.id,
        product.variantId, product.sku, product.name, product.image, product.price,
        Math.round(product.price / 11),
      ],
    );
  }
});

await withDatabase('fulfillment', async client => {
  const shipments = [
    ['61000000-0000-4000-8000-000000000001', seededOrderIds.get('TZ-2026-000001'), 'SHP-20260001', 'delivered', '689020260001'],
    ['61000000-0000-4000-8000-000000000002', seededOrderIds.get('TZ-2026-000002'), 'SHP-20260002', 'shipped', '689020260002'],
    ['61000000-0000-4000-8000-000000000003', seededOrderIds.get('TZ-2026-000003'), 'SHP-20260003', 'ready', null],
  ];
  for (const shipment of shipments) {
    await client.query(
      `INSERT INTO shipments(
        id,order_id,shipment_number,warehouse_id,carrier,tracking_number,status,recipient
      ) VALUES($1,$2,$3,$4,'CJ대한통운',$5,$6,'김테크') ON CONFLICT(order_id) DO NOTHING`,
      [shipment[0], shipment[1], shipment[2], seededWarehouseId, shipment[4], shipment[3]],
    );
  }
  await client.query(
    `INSERT INTO returns(id,order_id,return_number,status,reason,refund_amount)
     VALUES('62000000-0000-4000-8000-000000000001',$1,'RET-2026001','requested','단순 변심',1499000)
     ON CONFLICT(return_number) DO NOTHING`,
    [shipments[0][1]],
  );
});

await withDatabase('procurement', async client => {
  const supplier = await client.query(
    `INSERT INTO suppliers(id,code,name,contact_name,phone,email)
     VALUES($1,'SUP-TECH','테크 디바이스 코리아','박재민','02-555-1003','order@techdevices.kr')
     ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
    [ids.supplier],
  );
  for (const [index, product] of products.entries()) {
    await client.query(
      `INSERT INTO supplier_products(
        id,supplier_id,product_id,variant_id,supplier_sku,unit_cost,lead_time_days
      ) VALUES($1,$2,$3,$4,$5,$6,5) ON CONFLICT(supplier_id,variant_id) DO NOTHING`,
      [
        `51000000-0000-4000-8000-00000000000${index + 1}`, supplier.rows[0].id, product.id,
        product.variantId, `SP-${product.sku}`, product.cost,
      ],
    );
  }
  await client.query(
    `INSERT INTO purchase_orders(
      id,purchase_order_number,supplier_id,warehouse_id,status,total_amount,expected_at,approved_at
    ) VALUES('52000000-0000-4000-8000-000000000001','PO-2026-00001',$1,$2,'approved',52000000,now()+interval '5 days',now())
    ON CONFLICT(purchase_order_number) DO NOTHING`,
    [supplier.rows[0].id, seededWarehouseId],
  );
  await client.query(
    `INSERT INTO purchase_order_items(
      id,purchase_order_id,product_id,variant_id,sku,quantity,received_qty,unit_cost
    ) VALUES('53000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',$1,$2,$3,50,0,$4)
    ON CONFLICT(id) DO NOTHING`,
    [products[0].id, products[0].variantId, products[0].sku, products[0].cost],
  );
});

console.log('TECHZONE development seed completed.');
