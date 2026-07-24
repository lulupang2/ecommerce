const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { contextMiddleware } = require('../platform/context');
const { metricsMiddleware } = require('../platform/metrics');
const { standardErrorMiddleware } = require('../platform/errors');
const logger = require('../platform/logger');
const { bootstrapNest } = require('../platform/nest-runtime');
const { hit } = require('../platform/rate-limit');

function server(name) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true, exposedHeaders: ['x-request-id', 'x-correlation-id', 'x-csrf-token'] }));
  app.use(cookieParser());
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
  app.use(contextMiddleware(name));
  app.use(metricsMiddleware(name));
  app.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = body => {
      if (res.statusCode >= 400 && body && typeof body === 'object' && !Array.isArray(body)) {
        const { code = 'REQUEST_FAILED', message = '요청을 처리하지 못했습니다.', requestId, timestamp, details, ...rest } = body;
        return json({
          code,
          message,
          requestId: requestId || req.requestId,
          ...(details !== undefined || Object.keys(rest).length ? { details: details ?? rest } : {}),
          timestamp: timestamp || new Date().toISOString(),
        });
      }
      return json(body);
    };
    next();
  });
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => logger.info('http.request', { method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - startedAt, userId: req.user?.sub }));
    next();
  });
  app.use(async (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.path.startsWith('/health') || req.path === '/metrics') return next();
    const limit = await hit(`rate:${name}:${req.ip}`, { limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 120), windowSeconds: 60, lockSeconds: 60 });
    res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
    if (!limit.allowed) return res.status(429).set('Retry-After', String(limit.retryAfter)).json({ code: 'RATE_LIMITED', message: '요청이 너무 많습니다.', retryAfter: limit.retryAfter });
    next();
  });
  app._techzoneService = name;
  app._techzoneErrorMiddleware = standardErrorMiddleware;
  return app;
}
async function listen(app, name, readiness) {
  const port = Number(process.env.PORT || 3000);
  app.use(app._techzoneErrorMiddleware);
  const defaultReadiness = async () => {
    const { databaseReadiness } = require('./db');
    const { messagingReadiness } = require('./bus');
    return { ...(await databaseReadiness()), ...(await messagingReadiness()) };
  };
  const nestApp = await bootstrapNest({ router: app, service: name, port, readiness: readiness || defaultReadiness });
  console.log(`${name} (NestJS) listening on ${port}`);
  return nestApp;
}
module.exports = { server, listen };
