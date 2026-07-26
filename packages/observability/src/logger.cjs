const { currentContext } = require('./context.cjs');
const { trace } = require('@opentelemetry/api');
const pino = require('pino');

const sensitiveKeys = new Set(['password', 'passwordHash', 'password_hash', 'refreshToken', 'accessToken', 'authorization', 'phone', 'email']);
const raw = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: 'message',
});

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKeys.has(key) ? '[REDACTED]' : redact(item)]));
}

function log(level, message, fields = {}) {
  const context = currentContext();
  const traceId = trace.getActiveSpan()?.spanContext().traceId;
  raw[level]({
    ...redact(fields),
    service: context.service || process.env.SERVICE_NAME || 'unknown',
    environment: process.env.NODE_ENV || 'development',
    requestId: context.requestId,
    correlationId: context.correlationId,
    traceId,
    userId: context.userId,
  }, message);
}

module.exports = {
  raw,
  redact,
  debug: (message, fields) => log('debug', message, fields),
  info: (message, fields) => log('info', message, fields),
  warn: (message, fields) => log('warn', message, fields),
  error: (message, fields) => log('error', message, fields),
};
