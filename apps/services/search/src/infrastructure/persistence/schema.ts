import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const searchEvents = pgTable('search_events', {
  id: uuid('id').primaryKey(),
  eventType: text('event_type').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow(),
});
