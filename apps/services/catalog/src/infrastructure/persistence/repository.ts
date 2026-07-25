import { Injectable } from '@nestjs/common';
import { ProductListQuery } from '../../domain/product-list-query';

const crypto = require('node:crypto') as typeof import('node:crypto');
const { database } = require('@techzone/database/db') as { database(service: string): any };
const { publish, registerReliability } = require('@techzone/messaging/bus') as {
  publish(
    event: string,
    payload: Record<string, unknown>,
    metadata?: { client?: { query: (...args: any[]) => Promise<any> } },
  ): Promise<void>;
  registerReliability(service: string, database: any): Promise<void>;
};

@Injectable()
export class CatalogRepository {
  readonly owner = 'catalog';
  readonly db = database('catalog');

  async initialize(): Promise<void> {
    await this.db.wait();
    await registerReliability('catalog', this.db);
  }

  productSelect(): string {
    return `SELECT p.*,v.id variant_id,v.sku,v.model_number,v.list_price,v.sale_price,
                   v.cost_price,v.option_values,
                   round((v.list_price-v.sale_price)*100.0/NULLIF(v.list_price,0))::int discount_rate
            FROM products p
            LEFT JOIN LATERAL(
              SELECT * FROM product_variants
              WHERE product_id=p.id AND status='active'
              ORDER BY sale_price LIMIT 1
            ) v ON true`;
  }

  async home(): Promise<any> {
    const sections = (await this.db.query(
      `SELECT * FROM storefront_sections
       WHERE status='published'
         AND (starts_at IS NULL OR starts_at<=now())
         AND (ends_at IS NULL OR ends_at>=now())
       ORDER BY display_order`,
    )).rows;
    for (const section of sections) {
      const rows = await this.db.query(
        `${this.productSelect()}
         JOIN storefront_section_products sp ON sp.product_id=p.id
         WHERE sp.section_id=$1 AND p.status='published'
         ORDER BY sp.display_order LIMIT 12`,
        [section.id],
      );
      section.products = rows.rows;
    }
    const categories = (await this.db.query(
      `SELECT name,slug FROM categories ORDER BY display_order,name`,
    )).rows;
    const brands = (await this.db.query(
      `SELECT name,slug FROM brands WHERE status='active' ORDER BY name`,
    )).rows;
    return { sections, categories, brands };
  }

  async products(query: ProductListQuery): Promise<any> {
    const params: unknown[] = [];
    const where = [`p.status='published'`];
    if (query.category && query.category.toLowerCase() !== 'all') {
      params.push(query.category, query.category);
      where.push(
        `(p.category=$${params.length - 1}
          OR p.category_id IN(SELECT id FROM categories WHERE slug=$${params.length}))`,
      );
    }
    if (query.brand) {
      params.push(query.brand);
      where.push(`lower(p.brand)=lower($${params.length})`);
    }
    const search = query.q || query.search;
    if (search) {
      params.push(search, search);
      where.push(
        `(p.name ILIKE '%'||$${params.length - 1}||'%'
          OR p.brand ILIKE '%'||$${params.length}||'%')`,
      );
    }
    if (query.minPrice) {
      params.push(Number(query.minPrice));
      where.push(`v.sale_price>=$${params.length}`);
    }
    if (query.maxPrice) {
      params.push(Number(query.maxPrice));
      where.push(`v.sale_price<=$${params.length}`);
    }
    if (query.inStock === 'true') where.push(`p.stock>0`);
    if (query.discounted === 'true') where.push(`v.list_price>v.sale_price`);
    const sorts: Record<string, string> = {
      price_asc: 'v.sale_price ASC',
      price_desc: 'v.sale_price DESC',
      discount: 'discount_rate DESC',
      popular: 'p.stock ASC',
      newest: 'p.created_at DESC',
    };
    const sort = sorts[query.sort || ''] || 'p.created_at DESC';
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(48, Math.max(1, Number(query.pageSize) || 24));
    const count = await this.db.query(
      `SELECT count(*)::int total
       FROM (${this.productSelect()} WHERE ${where.join(' AND ')}) source`,
      params,
    );
    params.push(pageSize, (page - 1) * pageSize);
    const rows = await this.db.query(
      `${this.productSelect()} WHERE ${where.join(' AND ')}
       ORDER BY ${sort} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      rows: rows.rows,
      page,
      pageSize,
      total: count.rows[0].total,
      pageCount: Math.max(1, Math.ceil(count.rows[0].total / pageSize)),
    };
  }

  async detail(field: 'id' | 'slug', value: string): Promise<any | null> {
    const rows = await this.db.query(
      `${this.productSelect()} WHERE p.${field}=$1 AND p.status='published'`,
      [value],
    );
    if (!rows.rows[0]) return null;
    const product = rows.rows[0];
    const [variants, images, specs, reviews, questions, related] = await Promise.all([
      this.db.query(
        `SELECT id,sku,model_number "modelNumber",barcode,option_values "optionValues",
                list_price "listPrice",sale_price "salePrice",weight_gram "weightGram",status
         FROM product_variants WHERE product_id=$1 AND status='active' ORDER BY sale_price`,
        [product.id],
      ),
      this.db.query(
        `SELECT id,url,alt,display_order "displayOrder",is_primary "isPrimary"
         FROM product_images WHERE product_id=$1 ORDER BY display_order`,
        [product.id],
      ),
      this.db.query(
        `SELECT spec_key "key",spec_value "value"
         FROM product_specs WHERE product_id=$1 ORDER BY display_order`,
        [product.id],
      ),
      this.db.query(
        `SELECT id,user_name "userName",rating,body,created_at "createdAt"
         FROM reviews WHERE product_id=$1 AND status='published'
         ORDER BY created_at DESC LIMIT 20`,
        [product.id],
      ),
      this.db.query(
        `SELECT q.id,q.user_name "userName",q.title,q.body,q.created_at "createdAt",
                a.body answer,a.created_at "answeredAt"
         FROM product_questions q
         LEFT JOIN LATERAL(
           SELECT * FROM product_answers WHERE question_id=q.id
           ORDER BY created_at DESC LIMIT 1
         ) a ON true
         WHERE q.product_id=$1 AND q.status='published'
         ORDER BY q.created_at DESC LIMIT 20`,
        [product.id],
      ),
      this.db.query(
        `${this.productSelect()}
         WHERE p.category=$1 AND p.id<>$2 AND p.status='published'
         ORDER BY p.created_at DESC LIMIT 4`,
        [product.category, product.id],
      ),
    ]);
    return {
      product,
      variants: variants.rows,
      images: images.rows,
      specs: specs.rows,
      reviews: reviews.rows,
      questions: questions.rows,
      related: related.rows,
    };
  }

  async purchases(userId: string): Promise<string[]> {
    const response = await fetch(
      `${process.env.ORDER_URL || 'http://localhost:3004'}/internal/users/${userId}/purchases`,
      { headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || 'techzone-internal' } },
    );
    if (!response.ok) return [];
    return ((await response.json()) as any).productIds || [];
  }

  async createReview(productId: string, user: any, input: any): Promise<any> {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO reviews(id,product_id,user_id,user_name,rating,body,status)
       VALUES($1,$2,$3,$4,$5,$6,'pending')`,
      [id, productId, user.sub, user.name || '구매 고객', Number(input.rating), input.body],
    );
    return { id, status: 'pending' };
  }

  async createQuestion(productId: string, user: any, input: any): Promise<any> {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO product_questions(id,product_id,user_id,user_name,title,body)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [id, productId, user.sub, user.name || '고객', input.title, input.body],
    );
    return { id, status: 'published' };
  }

  async wishlist(ownerId: string): Promise<any[]> {
    const rows = await this.db.query(
      `${this.productSelect()}
       JOIN wishlists w ON w.product_id=p.id
       WHERE w.owner_id=$1 ORDER BY w.created_at DESC`,
      [ownerId],
    );
    return rows.rows;
  }

  async addWishlist(ownerId: string, productId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO wishlists(owner_id,product_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
      [ownerId, productId],
    );
  }

  async removeWishlist(ownerId: string, productId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM wishlists WHERE owner_id=$1 AND product_id=$2`,
      [ownerId, productId],
    );
  }

  async sections(): Promise<any[]> {
    const result = await this.db.query(
      `SELECT s.*,count(sp.product_id)::int product_count
       FROM storefront_sections s
       LEFT JOIN storefront_section_products sp ON sp.section_id=s.id
       GROUP BY s.id ORDER BY s.display_order`,
    );
    return result.rows;
  }

  async createSection(input: any): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO storefront_sections(
        id,type,title,subtitle,slug,status,display_order,starts_at,ends_at,config
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, input.type, input.title, input.subtitle || null, input.slug,
        input.status || 'draft', Number(input.displayOrder || 0), input.startsAt || null,
        input.endsAt || null, JSON.stringify(input.config || {})],
    );
    return id;
  }

  async updateSection(id: string, input: any): Promise<any | null> {
    const result = await this.db.query(
      `UPDATE storefront_sections SET
         title=COALESCE($2,title),subtitle=COALESCE($3,subtitle),
         status=COALESCE($4,status),display_order=COALESCE($5,display_order),
         starts_at=$6,ends_at=$7,config=COALESCE($8,config),updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, input.title || null, input.subtitle || null, input.status || null,
        input.displayOrder === undefined ? null : Number(input.displayOrder),
        input.startsAt || null, input.endsAt || null,
        input.config ? JSON.stringify(input.config) : null],
    );
    return result.rows[0] || null;
  }

  async createProduct(input: any, note: string, actorId: string): Promise<any> {
    const id = crypto.randomUUID();
    const variantId = crypto.randomUUID();
    const sku = input.sku || `TZ-${Date.now().toString().slice(-8)}`;
    const slug = input.slug || sku.toLowerCase();
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO products(
          id,slug,name,brand,category,price,note,color,image,stock,status
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, slug, input.name, input.brand, input.category, Number(input.price), note,
          input.color, input.image, Number(input.stock || 0), input.status || 'draft'],
      );
      await client.query(
        `INSERT INTO product_variants(
          id,product_id,sku,model_number,barcode,option_values,list_price,
          sale_price,cost_price,weight_gram
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [variantId, id, sku, input.modelNumber || sku, input.barcode || null,
          JSON.stringify(input.optionValues || { color: input.color }),
          Number(input.listPrice || input.price), Number(input.price),
          Number(input.costPrice || 0), Number(input.weightGram || 0)],
      );
      await publish('product.created', {
        productId: id,
        variantId,
        sku,
        name: input.name,
        brand: input.brand,
        category: input.category,
        price: Number(input.price),
        costPrice: Number(input.costPrice || 0),
        stock: Number(input.stock || 0),
        status: input.status || 'draft',
        image: input.image,
        actorId,
      }, { client });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return { id, variantId, slug, sku };
  }

  async updateProduct(id: string, input: any, note: string | null, actorId: string): Promise<any | null> {
    const result = await this.db.query(
      `UPDATE products SET
         name=COALESCE($2,name),brand=COALESCE($3,brand),category=COALESCE($4,category),
         price=COALESCE($5,price),note=COALESCE($6,note),color=COALESCE($7,color),
         image=COALESCE($8,image),stock=COALESCE($9,stock),
         status=COALESCE($10,status),updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, input.name || null, input.brand || null, input.category || null,
        input.price === undefined ? null : Number(input.price), note,
        input.color || null, input.image || null,
        input.stock === undefined ? null : Number(input.stock), input.status || null],
    );
    if (!result.rows[0]) return null;
    await publish('product.updated', { productId: id, ...result.rows[0], actorId });
    return result.rows[0];
  }

  async reviews(): Promise<any[]> {
    const result = await this.db.query(
      `SELECT id,product_id,user_name,rating,body,status,created_at
       FROM reviews ORDER BY created_at DESC`,
    );
    return result.rows;
  }

  async updateReview(id: string, status: string): Promise<any | null> {
    const result = await this.db.query(
      `UPDATE reviews SET status=$1 WHERE id=$2 RETURNING id,status`,
      [status, id],
    );
    return result.rows[0] || null;
  }

  async internalProducts(): Promise<any[]> {
    const result = await this.db.query(`${this.productSelect()} ORDER BY p.created_at DESC`);
    return result.rows;
  }

  async variants(ids: string[]): Promise<any[]> {
    if (!ids.length) return [];
    const result = await this.db.query(
      `SELECT v.id variant_id,v.product_id,v.sku,v.option_values,v.list_price,
              v.sale_price,v.status,p.slug,p.name,p.brand,p.category,p.image,p.stock,
              p.status product_status
       FROM product_variants v JOIN products p ON p.id=v.product_id
       WHERE v.id=ANY($1::uuid[])`,
      [ids],
    );
    return result.rows;
  }

  async internalReviews(): Promise<any[]> {
    const result = await this.db.query(`SELECT * FROM reviews ORDER BY created_at DESC`);
    return result.rows;
  }
}
