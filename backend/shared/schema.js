const { pgTable, pgEnum, uuid, text, integer, timestamp } = require('drizzle-orm/pg-core');
const orderStatus = pgEnum('order_status', ['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled']);
const productStatus = pgEnum('product_status', ['published', 'hidden', 'archived']);

const users = pgTable('users', {
  id: uuid('id').primaryKey(), email: text('email').notNull().unique(), passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(), role: text('role').notNull().default('customer'), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
const products = pgTable('products', {
  id: uuid('id').primaryKey(), name: text('name').notNull(), brand: text('brand').notNull(), category: text('category').notNull(),
  price: integer('price').notNull(), note: text('note'), color: text('color'), image: text('image'), stock: integer('stock').notNull(), status: productStatus('status').default('published'), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
const cartItems = pgTable('cart_items', {
  userId: uuid('user_id').notNull(), productId: uuid('product_id').notNull(), name: text('name').notNull(), brand: text('brand').notNull(), image: text('image'), price: integer('price').notNull(), quantity: integer('quantity').notNull(),
});
const orders = pgTable('orders', {
  id: uuid('id').primaryKey(), userId: uuid('user_id').notNull(), orderNumber: text('order_number').notNull().unique(), status: orderStatus('status').notNull(), totalAmount: integer('total_amount').notNull(), recipient: text('recipient').notNull(), phone: text('phone').notNull(), address: text('address').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey(), orderId: uuid('order_id').notNull(), productId: uuid('product_id').notNull(), name: text('name').notNull(), brand: text('brand').notNull(), image: text('image'), unitPrice: integer('unit_price').notNull(), quantity: integer('quantity').notNull(),
});
const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey(), userId: uuid('user_id').notNull(), type: text('type').notNull(), message: text('message').notNull(), readAt: timestamp('read_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
const stock = pgTable('stock', { productId: uuid('product_id').primaryKey(), availableQty: integer('available_qty').notNull().default(99), version: integer('version').notNull().default(0) });
const payments = pgTable('payments', { id: uuid('id').primaryKey(), orderId: uuid('order_id').notNull().unique(), status: text('status').notNull(), amount: integer('amount').notNull(), provider: text('provider').notNull(), paymentKey: text('payment_key'), approvedAt: timestamp('approved_at', { withTimezone: true }) });
const mediaAssets = pgTable('media_assets', { id: uuid('id').primaryKey(), ownerId: uuid('owner_id'), contentType: text('content_type').notNull(), objectKey: text('object_key').notNull(), publicUrl: text('public_url').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow() });
const searchEvents = pgTable('search_events', { id: uuid('id').primaryKey(), eventType: text('event_type').notNull(), receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow() });

module.exports = { users, products, cartItems, orders, orderItems, notifications, stock, payments, mediaAssets, searchEvents, orderStatus, productStatus };
