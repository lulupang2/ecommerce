import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const paymentStatus = pgEnum('payment_status', [
  'pending', 'approved', 'partially_refunded', 'refunded', 'cancelled', 'failed',
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey(),
  orderId: uuid('order_id').notNull().unique(),
  status: paymentStatus('status').notNull(),
  amount: integer('amount').notNull(),
  refundedAmount: integer('refunded_amount').notNull().default(0),
  provider: text('provider').notNull(),
  paymentKey: text('payment_key'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
});
