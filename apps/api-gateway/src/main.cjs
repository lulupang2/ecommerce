const { server, listen } = require('@techzone/config/http');
const swaggerUi = require('swagger-ui-express');
const openapi = require('@techzone/contracts/openapi.json');

const app = server('gateway');
const targets = {
  auth: process.env.AUTH_URL || 'http://localhost:3001',
  catalog: process.env.CATALOG_URL || 'http://localhost:3002',
  cart: process.env.CART_URL || 'http://localhost:3003',
  order: process.env.ORDER_URL || 'http://localhost:3004',
  payment: process.env.PAYMENT_URL || 'http://localhost:3005',
  inventory: process.env.INVENTORY_URL || 'http://localhost:3006',
  notification: process.env.NOTIFICATION_URL || 'http://localhost:3007',
  search: process.env.SEARCH_URL || 'http://localhost:3008',
  media: process.env.MEDIA_URL || 'http://localhost:3009',
  fulfillment: process.env.FULFILLMENT_URL || 'http://localhost:3010',
  procurement: process.env.PROCUREMENT_URL || 'http://localhost:3011',
  admin: process.env.ADMIN_URL || 'http://localhost:3012',
};

const routes = [
  { prefix: '/api/.well-known', service: 'auth' },
  { prefix: '/api/auth', service: 'auth' },
  { prefix: '/api/admin', service: 'admin' },
  { prefix: '/api/storefront', service: 'catalog' },
  { prefix: '/api/products', service: 'catalog' },
  { prefix: '/api/reviews', service: 'catalog' },
  { prefix: '/api/wishlists', service: 'catalog' },
  { prefix: '/api/carts', service: 'cart' },
  { prefix: '/api/checkout', service: 'order' },
  { prefix: '/api/coupons', service: 'order' },
  { prefix: '/api/orders', service: 'order' },
  { prefix: '/api/payments', service: 'payment' },
  { prefix: '/api/inventory', service: 'inventory' },
  { prefix: '/api/fulfillment', service: 'fulfillment' },
  { prefix: '/api/procurement', service: 'procurement' },
  { prefix: '/api/notifications', service: 'notification' },
  { prefix: '/api/search', service: 'search' },
  { prefix: '/api/media', service: 'media' },
];

const forwardedHeaders = [
  'authorization',
  'cookie',
  'content-type',
  'x-client-platform',
  'x-csrf-token',
  'idempotency-key',
  'x-request-id',
  'x-correlation-id',
  'x-causation-id',
];

app.get('/api/openapi.json', (_, res) => res.json(openapi));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'TECHZONE API' }));

app.get('/api/health/:service', async (req, res) => {
  const target = targets[req.params.service];
  if (!target) return res.status(404).json({ code: 'UNKNOWN_SERVICE' });
  try {
    const response = await fetch(`${target}/health/ready`);
    res.status(response.status).type(response.headers.get('content-type') || 'application/json').send(await response.text());
  } catch {
    res.status(503).json({ code: 'SERVICE_UNAVAILABLE', service: req.params.service });
  }
});

for (const route of routes) {
  app.use(route.prefix, async (req, res) => {
    try {
      const headers = {};
      for (const name of forwardedHeaders) {
        if (req.headers[name]) headers[name] = req.headers[name];
      }
      const url = targets[route.service] + req.originalUrl.replace('/api', '');
      const response = await fetch(url, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
      });
      res.status(response.status);
      for (const name of ['content-type', 'x-request-id', 'x-correlation-id', 'x-csrf-token']) {
        const value = response.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      const setCookies = response.headers.getSetCookie?.() || [];
      if (setCookies.length) res.setHeader('set-cookie', setCookies);
      else if (response.headers.get('set-cookie')) res.setHeader('set-cookie', response.headers.get('set-cookie'));
      const body = Buffer.from(await response.arrayBuffer());
      res.send(body);
    } catch (error) {
      res.status(503).json({
        code: 'SERVICE_UNAVAILABLE',
        message: `${route.service} 서비스를 일시적으로 사용할 수 없습니다.`,
        requestId: req.id,
        details: process.env.NODE_ENV === 'production' ? undefined : { reason: error.message },
        timestamp: new Date().toISOString(),
      });
    }
  });
}

listen(app, 'gateway');
