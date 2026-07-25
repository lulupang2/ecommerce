import { Injectable } from '@nestjs/common';

export type GatewayServiceName =
  | 'auth'
  | 'catalog'
  | 'cart'
  | 'order'
  | 'payment'
  | 'inventory'
  | 'notification'
  | 'search'
  | 'media'
  | 'fulfillment'
  | 'procurement'
  | 'admin';

@Injectable()
export class ApiGatewayRepository {
  readonly owner = 'api-gateway';

  private readonly targets: Record<GatewayServiceName, string> = {
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

  target(service: GatewayServiceName): string {
    return this.targets[service];
  }

  has(service: string): service is GatewayServiceName {
    return service in this.targets;
  }
}
