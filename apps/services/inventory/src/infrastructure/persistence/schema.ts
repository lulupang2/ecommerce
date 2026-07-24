import { integer, pgTable, uuid } from 'drizzle-orm/pg-core';

export const stock = pgTable('stock', {
  productId: uuid('product_id').primaryKey(),
  availableQty: integer('available_qty').notNull().default(99),
  version: integer('version').notNull().default(0),
});
