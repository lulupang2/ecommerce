import { Injectable } from '@nestjs/common';

const { database } = require('@techzone/database/db') as { database(service: string): any };

@Injectable()
export class CartRepository {
  readonly owner = 'cart';
  readonly db = database('cart');

  initialize(): Promise<void> { return this.db.wait(); }

  async list(userId: string): Promise<any[]> {
    const result = await this.db.query(
      `SELECT user_id,product_id,variant_id,sku,name,brand,option_values,image,
              unit_price price,quantity,updated_at
       FROM cart_items WHERE user_id=$1 ORDER BY updated_at DESC`,
      [userId],
    );
    return result.rows;
  }

  async upsert(userId: string, input: any): Promise<any> {
    const variantId = input.variantId || input.productId;
    await this.db.query(
      `INSERT INTO cart_items(
        user_id,product_id,variant_id,sku,name,brand,option_values,image,unit_price,quantity
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(user_id,variant_id) DO UPDATE SET
         quantity=EXCLUDED.quantity,unit_price=EXCLUDED.unit_price,
         option_values=EXCLUDED.option_values,updated_at=now()`,
      [userId, input.productId, variantId, input.sku || null, input.name, input.brand || '',
        JSON.stringify(input.optionValues || {}), input.image || null, Number(input.price),
        Number(input.quantity || 1)],
    );
    return { variantId, quantity: Number(input.quantity || 1) };
  }

  async updateQuantity(userId: string, variantId: string, quantity: number): Promise<void> {
    if (quantity < 1) {
      await this.db.query(`DELETE FROM cart_items WHERE user_id=$1 AND variant_id=$2`, [userId, variantId]);
    } else {
      await this.db.query(
        `UPDATE cart_items SET quantity=$3,updated_at=now() WHERE user_id=$1 AND variant_id=$2`,
        [userId, variantId, quantity],
      );
    }
  }

  async clear(userId: string): Promise<void> {
    await this.db.query(`DELETE FROM cart_items WHERE user_id=$1`, [userId]);
  }
}
