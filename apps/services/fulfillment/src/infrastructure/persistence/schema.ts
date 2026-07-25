import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const shipmentStatus = pgEnum('shipment_status', ['ready', 'packed', 'shipped', 'delivered', 'cancelled']);
export const returnStatus = pgEnum('return_status', ['requested', 'approved', 'received', 'refunded', 'rejected']);
export const shipments = pgTable('shipments', {
  id: uuid('id').primaryKey(), orderId: uuid('order_id').notNull().unique(),
  shipmentNumber: text('shipment_number').notNull().unique(), warehouseId: uuid('warehouse_id').notNull(),
  carrier: text('carrier').notNull(), trackingNumber: text('tracking_number').unique(),
  status: shipmentStatus('status').notNull(), recipient: text('recipient'),
  shippedAt: timestamp('shipped_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
export const shipmentItems = pgTable('shipment_items', {
  id: uuid('id').primaryKey(), shipmentId: uuid('shipment_id').notNull(),
  orderItemId: uuid('order_item_id').notNull(), variantId: uuid('variant_id'),
  sku: text('sku'), quantity: integer('quantity').notNull(),
});
export const trackingEvents = pgTable('tracking_events', {
  id: uuid('id').primaryKey(), shipmentId: uuid('shipment_id').notNull(),
  status: text('status').notNull(), location: text('location'), message: text('message').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
});
export const returns = pgTable('returns', {
  id: uuid('id').primaryKey(), orderId: uuid('order_id').notNull(),
  returnNumber: text('return_number').notNull().unique(), status: returnStatus('status').notNull(),
  reason: text('reason').notNull(), refundAmount: integer('refund_amount').notNull().default(0),
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
export const returnItems = pgTable('return_items', {
  id: uuid('id').primaryKey(), returnId: uuid('return_id').notNull(),
  orderItemId: uuid('order_item_id').notNull(), variantId: uuid('variant_id'),
  sku: text('sku'), quantity: integer('quantity').notNull(), condition: text('condition'),
});
