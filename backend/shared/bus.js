const crypto = require('crypto');
const amqp = require('amqplib');
const { currentContext } = require('../platform/context');
const { outboxPending, deadLetters: deadLetterCount } = require('../platform/metrics');
const logger = require('../platform/logger');

const exchange = 'techzone.events';
const retryDelays = [1_000, 5_000, 30_000, 120_000, 600_000];
let connection;
let channel;
let reliability;
let publisherTimer;
let publishing = false;
let connecting;
let reconnectTimer;
let shuttingDown = false;
const subscriptions = new Map();

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer || (!reliability && subscriptions.size === 0)) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connect().catch(error => {
      logger.error('rabbit.reconnect_failed', { error: error.message });
      scheduleReconnect();
    });
  }, 1_000);
  reconnectTimer.unref?.();
}

async function setupSubscription(ch, descriptor) {
  if (descriptor.activeChannel === ch) return;
  const queue = `${descriptor.service}.events`;
  await ch.assertQueue(queue, { durable: true });
  for (const pattern of descriptor.patterns) await ch.bindQueue(queue, exchange, pattern);
  for (let index = 0; index < retryDelays.length; index += 1) {
    await ch.assertQueue(`${descriptor.service}.retry.${index + 1}`, {
      durable: true,
      arguments: {
        'x-message-ttl': retryDelays[index],
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': queue,
      },
    });
  }
  await ch.prefetch(Number(process.env.RABBIT_PREFETCH || 10));
  await ch.consume(queue, message => consumeMessage(ch, descriptor, message), { noAck: false });
  descriptor.activeChannel = ch;
  logger.info('rabbit.subscription_ready', { service: descriptor.service, patterns: descriptor.patterns });
}

async function connect() {
  if (channel) return channel;
  if (connecting) return connecting;
  connecting = (async () => {
    const url = process.env.RABBIT_URL || 'amqp://localhost:5672';
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const nextConnection = await amqp.connect(url);
        const nextChannel = await nextConnection.createConfirmChannel();
        await nextChannel.assertExchange(exchange, 'topic', { durable: true });
        nextConnection.on('close', () => {
          if (connection === nextConnection) {
            channel = undefined;
            connection = undefined;
            for (const descriptor of subscriptions.values()) descriptor.activeChannel = undefined;
            scheduleReconnect();
          }
        });
        nextConnection.on('error', error => logger.error('rabbit.connection_error', { error: error.message }));
        nextChannel.on('error', error => logger.error('rabbit.channel_error', { error: error.message }));
        connection = nextConnection;
        channel = nextChannel;
        for (const descriptor of subscriptions.values()) await setupSubscription(nextChannel, descriptor);
        logger.info('rabbit.connected', { subscriptions: subscriptions.size });
        return nextChannel;
      } catch (error) {
        if (attempt === 29) throw error;
        await new Promise(resolve => setTimeout(resolve, 1_000));
      }
    }
  })();
  try {
    return await connecting;
  } finally {
    connecting = undefined;
  }
}

function envelope(type, payload, metadata = {}) {
  const context = currentContext();
  return {
    id: metadata.id || crypto.randomUUID(),
    type,
    source: metadata.source || reliability?.service || process.env.SERVICE_NAME || 'unknown',
    requestId: metadata.requestId || context.requestId || null,
    correlationId: metadata.correlationId || context.correlationId || context.requestId || crypto.randomUUID(),
    causationId: metadata.causationId || context.causationId || null,
    actorId: metadata.actorId || payload?.actorId || context.actorId || null,
    occurredAt: metadata.occurredAt || new Date().toISOString(),
    schemaVersion: 1,
    payload,
  };
}

async function ensureReliabilityTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS outbox_events (
      id UUID PRIMARY KEY,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL,
      published_at TIMESTAMPTZ,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS outbox_unpublished_idx ON outbox_events(occurred_at) WHERE published_at IS NULL;
    CREATE TABLE IF NOT EXISTS inbox_events (
      event_id UUID PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS dead_letters (
      id UUID PRIMARY KEY,
      service TEXT NOT NULL,
      event_id UUID NOT NULL,
      event_type TEXT NOT NULL,
      envelope JSONB NOT NULL,
      error TEXT NOT NULL,
      retry_count INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ
    );
  `);
}

async function registerReliability(service, db) {
  reliability = { service, db };
  await ensureReliabilityTables(db);
  if (!publisherTimer) {
    publisherTimer = setInterval(() => flushOutbox().catch(error => logger.error('outbox.flush_failed', { error: error.message })), 1_000);
    publisherTimer.unref?.();
  }
  await flushOutbox();
}

async function publishDirect(event) {
  const ch = await connect();
  ch.publish(exchange, event.type, Buffer.from(JSON.stringify(event)), {
    persistent: true,
    contentType: 'application/json',
    messageId: event.id,
    correlationId: event.correlationId,
    type: event.type,
    timestamp: Date.parse(event.occurredAt),
  });
  await ch.waitForConfirms();
}

async function flushOutbox() {
  if (!reliability || publishing) return;
  publishing = true;
  try {
    const result = await reliability.db.query(
      `SELECT id,payload FROM outbox_events WHERE published_at IS NULL ORDER BY occurred_at LIMIT 100`,
    );
    outboxPending.labels(reliability.service).set(result.rowCount);
    for (const row of result.rows) {
      try {
        await publishDirect(row.payload);
        await reliability.db.query(
          `UPDATE outbox_events SET published_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1 AND published_at IS NULL`,
          [row.id],
        );
      } catch (error) {
        await reliability.db.query(
          `UPDATE outbox_events SET attempts=attempts+1,last_error=$2 WHERE id=$1`,
          [row.id, error.message.slice(0, 2_000)],
        );
        throw error;
      }
    }
  } finally {
    publishing = false;
  }
}

async function publish(type, payload, metadata = {}) {
  const event = envelope(type, payload, metadata);
  if (!reliability) {
    await publishDirect(event);
    return event;
  }
  const client = metadata.client;
  const runner = client ? client.query.bind(client) : reliability.db.query;
  await runner(
    `INSERT INTO outbox_events(id,event_type,payload,occurred_at) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING`,
    [event.id, event.type, event, event.occurredAt],
  );
  flushOutbox().catch(error => logger.error('outbox.immediate_flush_failed', { eventId: event.id, error: error.message }));
  return event;
}

async function recordDeadLetter(service, event, retryCount, error) {
  if (reliability?.db) {
    await reliability.db.query(
      `INSERT INTO dead_letters(id,service,event_id,event_type,envelope,error,retry_count)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [crypto.randomUUID(), service, event.id, event.type, event, error.message.slice(0, 2_000), retryCount],
    );
    const count = await reliability.db.query(`SELECT count(*)::int AS count FROM dead_letters WHERE status='pending'`);
    deadLetterCount.labels(service).set(count.rows[0].count);
  }
  await publishDirect(envelope('system.dead_lettered', {
    service,
    event,
    retryCount,
    error: error.message,
  }, { correlationId: event.correlationId, causationId: event.id }));
}

async function consumeMessage(ch, descriptor, message) {
  if (!message) return;
  const { service, handler } = descriptor;
  let event;
  try {
    event = JSON.parse(message.content.toString());
    if (reliability?.db) {
      const existing = await reliability.db.query(`SELECT 1 FROM inbox_events WHERE event_id=$1`, [event.id]);
      if (existing.rowCount) {
        ch.ack(message);
        return;
      }
    }
    await handler(event);
    if (reliability?.db) {
      await reliability.db.query(
        `INSERT INTO inbox_events(event_id,event_type) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING`,
        [event.id, event.type],
      );
    }
    ch.ack(message);
  } catch (error) {
    const retryCount = Number(message.properties.headers?.['x-retry-count'] || 0);
    ch.ack(message);
    if (event && retryCount < retryDelays.length) {
      ch.sendToQueue(`${service}.retry.${retryCount + 1}`, message.content, {
        persistent: true,
        contentType: 'application/json',
        messageId: event.id,
        correlationId: event.correlationId,
        headers: { ...message.properties.headers, 'x-retry-count': retryCount + 1 },
      });
      await ch.waitForConfirms();
      logger.warn('event.retry_scheduled', { service, eventId: event.id, eventType: event.type, retryCount: retryCount + 1, error: error.message });
    } else if (event) {
      await recordDeadLetter(service, event, retryCount, error);
      logger.error('event.dead_lettered', { service, eventId: event.id, eventType: event.type, retryCount, error: error.message });
    } else {
      logger.error('event.invalid_envelope', { service, error: error.message });
    }
  }
}

async function subscribe(service, patterns, handler) {
  const descriptor = { service, patterns, handler, activeChannel: undefined };
  subscriptions.set(service, descriptor);
  const ch = await connect();
  await setupSubscription(ch, descriptor);
}

async function close() {
  shuttingDown = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (publisherTimer) clearInterval(publisherTimer);
  await flushOutbox();
  if (channel) await channel.close();
  if (connection) await connection.close();
  channel = undefined;
  connection = undefined;
}

async function messagingReadiness() {
  if (!reliability) return { rabbitmq: 'not_configured' };
  await connect();
  return { rabbitmq: channel ? 'ok' : 'unavailable' };
}

module.exports = { publish, subscribe, registerReliability, flushOutbox, close, envelope, messagingReadiness };
