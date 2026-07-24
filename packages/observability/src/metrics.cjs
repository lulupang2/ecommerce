const client = require('prom-client');

client.collectDefaultMetrics({ prefix: 'techzone_' });
const requests = new client.Counter({
  name: 'techzone_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['service', 'method', 'route', 'status'],
});
const duration = new client.Histogram({
  name: 'techzone_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['service', 'method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
const outboxPending = new client.Gauge({
  name: 'techzone_outbox_pending',
  help: 'Pending outbox events',
  labelNames: ['service'],
});
const deadLetters = new client.Gauge({
  name: 'techzone_dead_letters',
  help: 'Dead letter events',
  labelNames: ['service'],
});

function metricsMiddleware(service) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const labels = { service, method: req.method, route: req.route?.path || req.path, status: String(res.statusCode) };
      requests.inc(labels);
      duration.observe(labels, seconds);
    });
    next();
  };
}

module.exports = { client, metricsMiddleware, outboxPending, deadLetters };
