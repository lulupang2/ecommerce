import { Injectable } from '@nestjs/common';
import { ApiGatewayRepository, type GatewayServiceName } from '../infrastructure/persistence/repository';

@Injectable()
export class ApiGatewayApplicationService {
  constructor(private readonly repository: ApiGatewayRepository) {}

  private readonly forwardedHeaders = [
    'authorization',
    'cookie',
    'content-type',
    'x-client-platform',
    'x-csrf-token',
    'idempotency-key',
    'x-request-id',
    'x-correlation-id',
    'x-causation-id',
    'x-internal-key',
  ] as const;

  private readonly routes: ReadonlyArray<{ prefix: string; service: GatewayServiceName }> = [
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

  async health(service: string): Promise<{ status: number; contentType: string; body: string } | null> {
    if (!this.repository.has(service)) return null;
    try {
      const response = await fetch(`${this.repository.target(service)}/health/ready`);
      return {
        status: response.status,
        contentType: response.headers.get('content-type') || 'application/json',
        body: await response.text(),
      };
    } catch {
      return {
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', service }),
      };
    }
  }

  async proxy(request: any): Promise<{
    status: number;
    headers: Record<string, string | string[]>;
    body: Buffer;
  }> {
    const route = this.routes.find(candidate => request.originalUrl.startsWith(candidate.prefix));
    if (!route) {
      return {
        status: 404,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ code: 'ROUTE_NOT_FOUND' })),
      };
    }
    const headers: Record<string, string> = {};
    for (const name of this.forwardedHeaders) {
      const value = request.headers[name];
      if (typeof value === 'string') headers[name] = value;
    }
    const options: RequestInit = { method: request.method, headers };
    if (!['GET', 'HEAD'].includes(request.method)) {
      options.body = JSON.stringify(request.body ?? {});
    }
    const response = await fetch(
      this.repository.target(route.service) + request.originalUrl.replace('/api', ''),
      options,
    );
    const responseHeaders: Record<string, string | string[]> = {};
    for (const name of [
      'content-type',
      'cache-control',
      'etag',
      'last-modified',
      'x-request-id',
      'x-correlation-id',
      'x-csrf-token',
    ]) {
      const value = response.headers.get(name);
      if (value) responseHeaders[name] = value;
    }
    const cookies = response.headers.getSetCookie?.() || [];
    if (cookies.length) responseHeaders['set-cookie'] = cookies;
    else {
      const cookie = response.headers.get('set-cookie');
      if (cookie) responseHeaders['set-cookie'] = cookie;
    }
    return {
      status: response.status,
      headers: responseHeaders,
      body: Buffer.from(await response.arrayBuffer()),
    };
  }
}
