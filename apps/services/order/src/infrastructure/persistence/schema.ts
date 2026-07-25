import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const orderStatus = pgEnum('order_status', [
  'pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled',
]);
export const paymentStatus = pgEnum('payment_status', [
  'pending', 'approved', 'partially_refunded', 'refunded', 'cancelled', 'failed',
]);
export const fulfillmentStatus = pgEnum('fulfillment_status', [
  'unfulfilled', 'ready', 'shipped', 'delivered', 'returned',
]);

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  orderNumber: text('order_number').notNull().unique(),
  status: orderStatus('status').notNull(),
  paymentStatus: paymentStatus('payment_status').notNull().default('pending'),
  fulfillmentStatus: fulfillmentStatus('fulfillment_status').notNull().default('unfulfilled'),
  subtotalAmount: integer('subtotal_amount').notNull().default(0),
  discountAmount: integer('discount_amount').notNull().default(0),
  shippingFee: integer('shipping_fee').notNull().default(0),
  taxAmount: integer('tax_amount').notNull().default(0),
  totalAmount: integer('total_amount').notNull(),
  couponCode: text('coupon_code'),
  guestOrder: boolean('guest_order').notNull().default(false),
  paymentMethod: text('payment_method'),
  recipient: text('recipient').notNull(),
  phone: text('phone').notNull(),
  address: text('address').notNull(),
  memo: text('memo'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey(),
  orderId: uuid('order_id').notNull(),
  productId: uuid('product_id').notNull(),
  variantId: uuid('variant_id'),
  sku: text('sku'),
  name: text('name').notNull(),
  brand: text('brand').notNull(),
  image: text('image'),
  unitPrice: integer('unit_price').notNull(),
  discountAmount: integer('discount_amount').notNull().default(0),
  taxAmount: integer('tax_amount').notNull().default(0),
  quantity: integer('quantity').notNull(),
});
