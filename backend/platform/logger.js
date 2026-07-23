const { currentContext } = require('./context');
const { trace } = require('@opentelemetry/api');

const sensitiveKeys = new Set(['password', 'passwordHash', 'password_hash', 'refreshToken', 'accessToken', 'authorization', 'phone', 'email']);

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKeys.has(key) ? '[REDACTED]' : redact(item)]));
}

function log(level, message, fields = {}) {
  const context = currentContext();
  const traceId = trace.getActiveSpan()?.spanContext().traceId;
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    service: context.service || process.env.SERVICE_NAME || 'unknown',
    environment: process.env.NODE_ENV || 'development',
    requestId: context.requestId,
    correlationId: context.correlationId,
    traceId,
    userId: context.userId,
    ...redact(fields),
  }));
}

module.exports = {
  redact,
  info: (message, fields) => log('info', message, fields),
  warn: (message, fields) => log('warn', message, fields),
  error: (message, fields) => log('error', message, fields),
};
