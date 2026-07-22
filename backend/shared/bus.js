const amqp = require('amqplib');
let channel;
const exchange = 'canvas.events';

async function connect() {
  if (channel) return channel;
  const url = process.env.RABBIT_URL || 'amqp://localhost:5672';
  for (let i = 0; i < 30; i += 1) {
    try {
      const connection = await amqp.connect(url);
      channel = await connection.createChannel();
      await channel.assertExchange(exchange, 'topic', { durable: true });
      return channel;
    } catch { await new Promise(r => setTimeout(r, 1000)); }
  }
  throw new Error('RabbitMQ unavailable');
}

async function publish(type, payload) {
  const ch = await connect();
  const envelope = { id: crypto.randomUUID(), type, occurredAt: new Date().toISOString(), payload };
  ch.publish(exchange, type, Buffer.from(JSON.stringify(envelope)), { persistent: true, contentType: 'application/json' });
  console.log(`[event] ${type}`, payload.orderId || payload.productId || '');
}

async function subscribe(service, patterns, handler) {
  const ch = await connect();
  const queue = `${service}.events`;
  await ch.assertQueue(queue, { durable: true });
  for (const pattern of patterns) await ch.bindQueue(queue, exchange, pattern);
  ch.consume(queue, async message => {
    if (!message) return;
    try { await handler(JSON.parse(message.content.toString())); ch.ack(message); }
    catch (error) { console.error(`[${service}] event error`, error.message); ch.nack(message, false, false); }
  });
}
module.exports = { publish, subscribe };
