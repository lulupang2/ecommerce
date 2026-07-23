const express = require('express');
const cors = require('cors');
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { Module } = require('@nestjs/common');

function server(name) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use((req, res, next) => { const requestId = req.headers['x-request-id'] || crypto.randomUUID(); req.requestId = requestId; res.setHeader('X-Request-Id', requestId); const startedAt = Date.now(); res.on('finish', () => console.log(JSON.stringify({ service: name, requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - startedAt }))); next(); });
  const buckets = new Map();
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.path === '/health') return next();
    const now = Date.now(); const key = `${name}:${req.ip}`; const current = buckets.get(key);
    if (!current || now - current.startedAt >= 60_000) buckets.set(key, { startedAt: now, count: 1 });
    else if (++current.count > 120) return res.status(429).json({ code: 'RATE_LIMITED', retryAfter: 60 });
    next();
  });
  app.get('/health', (_, res) => res.json({ service: name, status: 'ok' }));
  app.use((err, _, res, __) => { console.error(err); res.status(500).json({ code: 'INTERNAL_ERROR', message: err.message }); });
  return app;
}
class LegacyServiceModule {}
Module({})(LegacyServiceModule);
async function listen(app, name) {
  const port = Number(process.env.PORT || 3000);
  const nestApp = await NestFactory.create(LegacyServiceModule, { logger: false });
  nestApp.use(app);
  await nestApp.listen(port, '0.0.0.0');
  console.log(`${name} (NestJS) listening on ${port}`);
}
module.exports = { server, listen };
