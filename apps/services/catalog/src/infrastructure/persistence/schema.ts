import {
  boolean, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid,
} from 'drizzle-orm/pg-core';

export const productStatus = pgEnum('product_status', ['draft', 'published', 'hidden', 'archived']);
export const brands = pgTable('brands', {
  id: uuid('id').primaryKey(), name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(), status: text('status').notNull().default('active'),
});
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey(), parentId: uuid('parent_id'), name: text('name').notNull(),
  slug: text('slug').notNull().unique(), displayOrder: integer('display_order').notNull().default(0),
});
export const products = pgTable('products', {
  id: uuid('id').primaryKey(), brandId: uuid('brand_id'), categoryId: uuid('category_id'),
  slug: text('slug').unique(), name: text('name').notNull(), brand: text('brand').notNull(),
  category: text('category').notNull(), price: integer('price').notNull(), note: text('note'),
  color: text('color'), image: text('image'), stock: integer('stock').notNull().default(0),
  status: productStatus('status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey(), productId: uuid('product_id').notNull(),
  sku: text('sku').notNull().unique(), modelNumber: text('model_number').notNull(),
  barcode: text('barcode').unique(), optionValues: jsonb('option_values').notNull().default({}),
  listPrice: integer('list_price').notNull(), salePrice: integer('sale_price').notNull(),
  costPrice: integer('cost_price').notNull(), weightGram: integer('weight_gram').notNull().default(0),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
export const productImages = pgTable('product_images', {
  id: uuid('id').primaryKey(), productId: uuid('product_id').notNull(), variantId: uuid('variant_id'),
  url: text('url').notNull(), alt: text('alt'), displayOrder: integer('display_order').notNull().default(0),
  isPrimary: boolean('is_primary').notNull().default(false),
});
export const productSpecs = pgTable('product_specs', {
  id: uuid('id').primaryKey(), productId: uuid('product_id').notNull(),
  specKey: text('spec_key').notNull(), specValue: text('spec_value').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
});
export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey(), productId: uuid('product_id').notNull(), userId: uuid('user_id'),
  userName: text('user_name').notNull(), rating: integer('rating').notNull(),
  body: text('body').notNull(), status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
export const productQuestions = pgTable('product_questions', {
  id: uuid('id').primaryKey(), productId: uuid('product_id').notNull(), userId: uuid('user_id').notNull(),
  userName: text('user_name').notNull(), title: text('title').notNull(), body: text('body').notNull(),
  status: text('status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
export const productAnswers = pgTable('product_answers', {
  id: uuid('id').primaryKey(), questionId: uuid('question_id').notNull(), body: text('body').notNull(),
  answeredBy: uuid('answered_by'), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
export const wishlists = pgTable('wishlists', {
  ownerId: uuid('owner_id').notNull(), productId: uuid('product_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, table => [primaryKey({ columns: [table.ownerId, table.productId] })]);
export const storefrontSections = pgTable('storefront_sections', {
  id: uuid('id').primaryKey(), type: text('type').notNull(), title: text('title').notNull(),
  subtitle: text('subtitle'), slug: text('slug').notNull().unique(),
  status: text('status').notNull().default('published'), displayOrder: integer('display_order').notNull().default(0),
  startsAt: timestamp('starts_at', { withTimezone: true }), endsAt: timestamp('ends_at', { withTimezone: true }),
  config: jsonb('config').notNull().default({}), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
export const storefrontSectionProducts = pgTable('storefront_section_products', {
  sectionId: uuid('section_id').notNull(), productId: uuid('product_id').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
}, table => [primaryKey({ columns: [table.sectionId, table.productId] })]);
