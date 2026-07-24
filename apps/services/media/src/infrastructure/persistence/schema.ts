import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const mediaAssets = pgTable('media_assets', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id'),
  contentType: text('content_type').notNull(),
  objectKey: text('object_key').notNull(),
  publicUrl: text('public_url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
