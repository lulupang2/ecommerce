import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

const { database } = require('@techzone/database/db') as { database(service: string): any };
import { notifications } from './schema';
const { registerReliability } = require('@techzone/messaging/bus') as {
  registerReliability(service: string, database: any): Promise<void>;
};

@Injectable()
export class NotificationRepository {
  readonly owner = 'notification';
  readonly db = database('notifications');

  async initialize(): Promise<void> {
    await this.db.wait();
    await registerReliability('notification', this.db);
  }

  async create(event: any): Promise<void> {
    const payload = event.payload;
    if (!payload.userId) return;
    const message = event.type === 'order.confirmed'
      ? `주문 ${payload.orderId}이 완료되었습니다.`
      : `주문 ${payload.orderId}이 취소되었습니다.`;
    await this.db.orm
      .insert(notifications)
      .values({
        id: event.id,
        userId: payload.userId,
        type: event.type,
        message,
      })
      .onConflictDoNothing({ target: notifications.id });
  }

  async list(userId: string): Promise<any[]> {
    const rows = await this.db.orm
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
    return rows.map((item: any) => ({
      id: item.id,
      user_id: item.userId,
      type: item.type,
      message: item.message,
      read_at: item.readAt,
      created_at: item.createdAt,
    }));
  }
}
