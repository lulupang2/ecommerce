import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const processedEvents = pgTable('processed_events', {
  eventId: uuid('event_id').primaryKey(), eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow(),
});
export const productProjection = pgTable('admin_product_projection', {
  productId: uuid('product_id').primaryKey(), variantId: uuid('variant_id'), sku: text('sku'),
  modelNumber: text('model_number'), name: text('name').notNull(), brand: text('brand'),
  category: text('category'), price: integer('price').notNull().default(0),
  costPrice: integer('cost_price').notNull().default(0), status: text('status'), image: text('image'),
  displayStock: integer('display_stock').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
export const orderProjection = pgTable('admin_order_projection', {
  orderId: uuid('order_id').primaryKey(), orderNumber: text('order_number').unique(),
  userId: uuid('user_id'), status: text('status'), paymentStatus: text('payment_status'),
  fulfillmentStatus: text('fulfillment_status'), totalAmount: integer('total_amount').notNull().default(0),
  discountAmount: integer('discount_amount').notNull().default(0), recipient: text('recipient'),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});
export const inventoryProjection = pgTable('admin_inventory_projection', {
  balanceId: uuid('balance_id').primaryKey(), warehouseId: uuid('warehouse_id'),
  warehouseCode: text('warehouse_code'), warehouseName: text('warehouse_name'),
  productId: uuid('product_id'), variantId: uuid('variant_id'),
  availableQty: integer('available_qty').notNull().default(0),
  reservedQty: integer('reserved_qty').notNull().default(0),
  damagedQty: integer('damaged_qty').notNull().default(0),
  incomingQty: integer('incoming_qty').notNull().default(0),
  safetyQty: integer('safety_qty').notNull().default(5),
  reorderQty: integer('reorder_qty').notNull().default(20),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
export const auditLogs = pgTable('admin_audit_logs', {
  id: uuid('id').primaryKey(), actorId: uuid('actor_id'), action: text('action').notNull(),
  entityType: text('entity_type'), entityId: text('entity_id'), reason: text('reason'),
  metadata: jsonb('metadata').notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow(),
});
export const deadLetters = pgTable('admin_dead_letters', {
  id: uuid('id').primaryKey(), service: text('service').notNull(), eventId: uuid('event_id').notNull(),
  eventType: text('event_type').notNull(), envelope: jsonb('envelope').notNull(),
  error: text('error').notNull(), retryCount: integer('retry_count').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }), resolvedBy: uuid('resolved_by'),
});
