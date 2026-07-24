import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { GuestAccessDto } from '@techzone/contracts/dtos';
import {
  AuthGuard,
  InternalGuard,
  OptionalAuthGuard,
  PermissionGuard,
  RoleGuard,
} from '@techzone/auth-platform/nest-guards';
import { OrderApplicationService } from '../application/service';
import {
  CancelOrderDto,
  CheckoutQuoteDto,
  CouponCreateDto,
  CouponUpdateDto,
  CreateOrderDto,
  OrderStatusDto,
} from './order.dtos';

@Controller()
export class OrderController {
  constructor(private readonly application: OrderApplicationService) {}

  private send(response: any, result: any) {
    if (result.replayed) response.setHeader('x-idempotency-replayed', 'true');
    return response.status(result.status).json(result.body);
  }

  @Post('checkout/quote')
  async quote(@Body() body: CheckoutQuoteDto, @Res() response: any) {
    return this.send(response, await this.application.quote(body));
  }

  @Get('coupons/public')
  async publicCoupons() {
    return { items: await this.application.publicCoupons() };
  }

  @Get('coupons/admin')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('orders.read'))
  async adminCoupons() {
    return { items: await this.application.adminCoupons() };
  }

  @Post('coupons/admin')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('orders.update'))
  async createCoupon(@Body() body: CouponCreateDto) {
    return { id: await this.application.createCoupon(body) };
  }

  @Patch('coupons/admin/:id')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('orders.update'))
  async updateCoupon(@Param('id') id: string, @Body() body: CouponUpdateDto) {
    const result = await this.application.updateCoupon(id, body);
    if (!result) throw new NotFoundException({ code: 'NOT_FOUND' });
    return result;
  }

  @Post('orders')
  @UseGuards(OptionalAuthGuard)
  async createOrder(
    @Body() body: CreateOrderDto,
    @Req() request: any,
    @Res() response: any,
  ) {
    const result = await this.application.idempotent(
      request,
      'order.create',
      () => this.application.createOrder(body, request),
    );
    return this.send(response, result);
  }

  @Post('orders/guest/access')
  async guestAccess(@Body() body: GuestAccessDto) {
    const result = await this.application.guestAccess(body);
    if (!result) {
      throw new UnauthorizedException({ code: 'GUEST_ORDER_AUTH_FAILED' });
    }
    return result;
  }

  @Get('orders/guest/:id')
  async guestOrder(@Param('id') id: string, @Req() request: any) {
    if (!this.application.verifyGuest(request.headers.authorization, id)) {
      throw new UnauthorizedException({ code: 'GUEST_TOKEN_REQUIRED' });
    }
    const result = await this.application.detail(id);
    if (!result) throw new NotFoundException({ code: 'NOT_FOUND' });
    return result;
  }

  @Post('orders/guest/:id/cancel')
  async cancelGuestOrder(
    @Param('id') id: string,
    @Body() body: CancelOrderDto,
    @Req() request: any,
    @Res() response: any,
  ) {
    if (!this.application.verifyGuest(request.headers.authorization, id)) {
      return response.status(401).json({ code: 'GUEST_TOKEN_REQUIRED' });
    }
    const result = await this.application.cancelGuestOrder(id, body.reason);
    if (!result) return response.status(409).json({ code: 'ORDER_NOT_CANCELLABLE' });
    return response.json(result);
  }

  @Get('orders')
  @UseGuards(AuthGuard)
  async orders(@Query('userId') userId: string | undefined, @Req() request: any) {
    if (!userId && request.user.role !== 'admin') {
      throw new ForbiddenException({ code: 'FORBIDDEN' });
    }
    if (userId && request.user.sub !== userId && request.user.role !== 'admin') {
      throw new ForbiddenException({ code: 'RESOURCE_FORBIDDEN' });
    }
    return { items: await this.application.list(userId) };
  }

  @Patch('orders/:id/status')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('orders.update'))
  async updateStatus(
    @Param('id') id: string,
    @Body() body: OrderStatusDto,
    @Req() request: any,
    @Res() response: any,
  ) {
    const result = await this.application.updateStatus(
      id,
      body.status,
      request.user.sub,
      body.reason,
    );
    if (result.kind === 'not_found') return response.status(404).json({ code: 'NOT_FOUND' });
    if (result.kind === 'invalid') {
      return response.status(409).json({
        code: 'INVALID_STATUS_TRANSITION',
        from: result.from,
        to: result.to,
      });
    }
    return response.json({ id: result.id, status: result.status });
  }

  @Get('orders/:id')
  @UseGuards(AuthGuard)
  async detail(@Param('id') id: string, @Req() request: any) {
    const result = await this.application.detail(id);
    if (!result) throw new NotFoundException({ code: 'NOT_FOUND' });
    if (result.user_id !== request.user.sub && request.user.role !== 'admin') {
      throw new ForbiddenException({ code: 'RESOURCE_FORBIDDEN' });
    }
    return result;
  }

  @Get('internal/orders')
  @UseGuards(InternalGuard)
  async internalOrders() {
    return { items: await this.application.internalOrders() };
  }

  @Get('internal/orders/:id/items')
  @UseGuards(InternalGuard)
  async orderItems(@Param('id') id: string) {
    return { items: await this.application.orderItems(id) };
  }

  @Get('internal/users/:id/purchases')
  @UseGuards(InternalGuard)
  async purchases(@Param('id') id: string) {
    return { productIds: await this.application.purchases(id) };
  }
}
