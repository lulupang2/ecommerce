import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const cartItems = pgTable('cart_items', {
  userId: uuid('user_id').notNull(),
  productId: uuid('product_id').notNull(),
  variantId: uuid('variant_id').notNull(),
  sku: text('sku'),
  name: text('name').notNull(),
  brand: text('brand').notNull(),
  optionValues: jsonb('option_values').notNull().default({}),
  image: text('image'),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, table => [primaryKey({ columns: [table.userId, table.variantId] })]);
