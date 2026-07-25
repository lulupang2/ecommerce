import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const purchaseOrderStatus = pgEnum('purchase_order_status', [
  'draft', 'approved', 'partially_received', 'received', 'cancelled',
]);
export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey(), code: text('code').notNull().unique(), name: text('name').notNull(),
  contactName: text('contact_name'), phone: text('phone'), email: text('email'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
export const supplierProducts = pgTable('supplier_products', {
  id: uuid('id').primaryKey(), supplierId: uuid('supplier_id').notNull(),
  productId: uuid('product_id'), variantId: uuid('variant_id').notNull(),
  supplierSku: text('supplier_sku'), unitCost: integer('unit_cost').notNull(),
  leadTimeDays: integer('lead_time_days').notNull().default(7),
});
export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').primaryKey(), purchaseOrderNumber: text('purchase_order_number').notNull().unique(),
  supplierId: uuid('supplier_id').notNull(), warehouseId: uuid('warehouse_id').notNull(),
  status: purchaseOrderStatus('status').notNull(), totalAmount: integer('total_amount').notNull(),
  expectedAt: timestamp('expected_at', { withTimezone: true }), approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: uuid('id').primaryKey(), purchaseOrderId: uuid('purchase_order_id').notNull(),
  productId: uuid('product_id'), variantId: uuid('variant_id').notNull(), sku: text('sku').notNull(),
  quantity: integer('quantity').notNull(), receivedQty: integer('received_qty').notNull().default(0),
  unitCost: integer('unit_cost').notNull(),
});
export const goodsReceipts = pgTable('goods_receipts', {
  id: uuid('id').primaryKey(), receiptNumber: text('receipt_number').notNull().unique(),
  purchaseOrderId: uuid('purchase_order_id').notNull(), warehouseId: uuid('warehouse_id').notNull(),
  receivedBy: uuid('received_by'), receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow(),
});
export const goodsReceiptItems = pgTable('goods_receipt_items', {
  id: uuid('id').primaryKey(), goodsReceiptId: uuid('goods_receipt_id').notNull(),
  purchaseOrderItemId: uuid('purchase_order_item_id').notNull(), variantId: uuid('variant_id').notNull(),
  quantity: integer('quantity').notNull(), condition: text('condition').notNull().default('good'),
});
