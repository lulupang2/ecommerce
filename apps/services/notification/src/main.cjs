const { eq, desc } = require('drizzle-orm');
const { database } = require('@techzone/database/db');
const { notifications } = require('@techzone/database/schema');
const { server, listen } = require('@techzone/config/http');
const { subscribe, registerReliability } = require('@techzone/messaging/bus');
const { requireAuth, requireOwner } = require('@techzone/auth-platform/auth');

const db = database('notifications');
const app = server('notification');

async function init() {
  await db.wait();
  await registerReliability('notification', db);
  await db.query(`CREATE TABLE IF NOT EXISTS notifications (id UUID PRIMARY KEY,user_id UUID NOT NULL,type TEXT NOT NULL,message TEXT NOT NULL,read_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT now())`);
  await subscribe('notification', ['order.confirmed', 'order.cancelled'], async event => {
    const payload = event.payload;
    const message = event.type === 'order.confirmed'
      ? `주문 ${payload.orderId}이 완료되었습니다.`
      : `주문 ${payload.orderId}이 취소되었습니다.`;
    if (payload.userId) {
      await db.orm.insert(notifications).values({
        id: crypto.randomUUID(),
        userId: payload.userId,
        type: event.type,
        message,
      });
    }
  });
}

app.get('/notifications/:userId', requireAuth, requireOwner('userId'), async (req, res) => {
  const rows = await db.orm.select().from(notifications).where(eq(notifications.userId, req.params.userId)).orderBy(desc(notifications.createdAt));
  res.json({ items: rows.map(item => ({
    id: item.id,
    user_id: item.userId,
    type: item.type,
    message: item.message,
    read_at: item.readAt,
    created_at: item.createdAt,
  })) });
});

init().then(() => listen(app, 'notification')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
