const KeyvRedis = require('@keyv/redis').default;
const { Keyv } = require('keyv');
const logger = require('@techzone/observability/logger');

function createCacheOptions(namespace, ttl = 30_000) {
  if (!process.env.REDIS_URL) return { ttl };

  const redis = new KeyvRedis(process.env.REDIS_URL, {
    connectionTimeout: Number(process.env.REDIS_CONNECTION_TIMEOUT_MS || 2_000),
  });
  redis.on('error', error => {
    logger.warn('cache.redis_error', { namespace, error: error.message });
  });

  const store = new Keyv({
    store: redis,
    namespace: `techzone:${namespace}`,
  });
  store.on('error', error => {
    logger.warn('cache.store_error', { namespace, error: error.message });
  });

  return {
    ttl,
    stores: [store],
  };
}

module.exports = { createCacheOptions };
