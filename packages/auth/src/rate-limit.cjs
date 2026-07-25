const Redis = require('ioredis');

let redis;
const memory = new Map();

function client() {
  if (!process.env.REDIS_URL) return null;
  if (!redis) redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  return redis;
}

async function hit(key, { limit, windowSeconds, lockSeconds = windowSeconds }) {
  const store = client();
  if (store) {
    try {
      if (store.status === 'wait') await store.connect();
      const count = await store.incr(key);
      if (count === 1) await store.expire(key, windowSeconds);
      if (count > limit) {
        await store.expire(key, lockSeconds);
        return { allowed: false, retryAfter: await store.ttl(key) };
      }
      return { allowed: true, remaining: Math.max(0, limit - count) };
    } catch {
      // A local limiter keeps the service available while readiness exposes Redis recovery work.
    }
  }
  const now = Date.now();
  const current = memory.get(key);
  if (!current || current.expiresAt <= now) {
    memory.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1 };
  }
  current.count += 1;
  if (current.count > limit) {
    current.expiresAt = now + lockSeconds * 1000;
    return { allowed: false, retryAfter: Math.ceil((current.expiresAt - now) / 1000) };
  }
  return { allowed: true, remaining: limit - current.count };
}

async function clear(key) {
  const store = client();
  if (store) {
    try {
      if (store.status === 'wait') await store.connect();
      await store.del(key);
    } catch {}
  }
  memory.delete(key);
}

async function closeRateLimit() {
  if (redis && ['ready', 'connect'].includes(redis.status)) await redis.quit();
  redis = undefined;
}

module.exports = { hit, clear, closeRateLimit };
