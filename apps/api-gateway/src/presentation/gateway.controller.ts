import { All, Controller, Get, Param, Req, Res } from '@nestjs/common';
import openapi from '@techzone/contracts/openapi.json';
import { ApiGatewayApplicationService } from '../application/service';

const PROXY_PATHS = [
  'api/.well-known/{*path}',
  'api/auth/{*path}',
  'api/admin/{*path}',
  'api/storefront/{*path}',
  'api/products/{*path}',
  'api/reviews/{*path}',
  'api/wishlists/{*path}',
  'api/carts/{*path}',
  'api/checkout/{*path}',
  'api/coupons/{*path}',
  'api/orders/{*path}',
  'api/payments/{*path}',
  'api/inventory/{*path}',
  'api/fulfillment/{*path}',
  'api/procurement/{*path}',
  'api/notifications/{*path}',
  'api/search/{*path}',
  'api/media/{*path}',
  'api/.well-known',
  'api/auth',
  'api/admin',
  'api/storefront',
  'api/products',
  'api/reviews',
  'api/wishlists',
  'api/carts',
  'api/checkout',
  'api/coupons',
  'api/orders',
  'api/payments',
  'api/inventory',
  'api/fulfillment',
  'api/procurement',
  'api/notifications',
  'api/search',
  'api/media',
];

@Controller()
export class GatewayController {
  constructor(private readonly application: ApiGatewayApplicationService) {}

  @Get('api/openapi.json')
  openApi() {
    return openapi;
  }

  @Get('api/health/:service')
  async health(@Param('service') service: string, @Res() response: any) {
    const result = await this.application.health(service);
    if (!result) return response.status(404).json({ code: 'UNKNOWN_SERVICE' });
    return response.status(result.status).type(result.contentType).send(result.body);
  }

  @All(PROXY_PATHS)
  async proxy(@Req() request: any, @Res() response: any) {
    try {
      const result = await this.application.proxy(request);
      response.status(result.status);
      for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
      return response.send(result.body);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      return response.status(503).json({
        code: 'SERVICE_UNAVAILABLE',
        message: '서비스를 일시적으로 사용할 수 없습니다.',
        requestId: request.requestId,
        details: process.env.NODE_ENV === 'production' ? undefined : { reason },
        timestamp: new Date().toISOString(),
      });
    }
  }
}
