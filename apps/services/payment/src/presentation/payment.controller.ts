import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { PaymentConfirmDto, RefundDto } from '@techzone/contracts/dtos';
import {
  AuthGuard,
  InternalGuard,
  PermissionGuard,
  RoleGuard,
} from '@techzone/auth-platform/nest-guards';
import { PaymentApplicationService } from '../application/service';

@Controller()
export class PaymentController {
  constructor(private readonly application: PaymentApplicationService) {}

  private send(response: any, result: any) {
    if (result.replayed) response.setHeader('x-idempotency-replayed', 'true');
    return response.status(result.status).json(result.body);
  }

  @Post('payments/confirm')
  async confirm(@Body() body: PaymentConfirmDto, @Req() request: any, @Res() response: any) {
    const result = await this.application.idempotent(
      request,
      'payment.confirm',
      () => this.application.confirm(body),
    );
    return this.send(response, result);
  }

  @Post('payments/:orderId/refunds')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('payments.refund'))
  async refund(
    @Param('orderId') orderId: string,
    @Body() body: RefundDto,
    @Req() request: any,
    @Res() response: any,
  ) {
    const result = await this.application.idempotent(
      request,
      'payment.refund',
      () => this.application.refund(orderId, body, request.user.sub),
    );
    return this.send(response, result);
  }

  @Get('payments/:orderId')
  async detail(@Param('orderId') orderId: string) {
    const result = await this.application.detail(orderId);
    if (!result) throw new NotFoundException({ code: 'NOT_FOUND' });
    return result;
  }

  @Get('internal/payments')
  @UseGuards(InternalGuard)
  async all() {
    return { items: await this.application.all() };
  }
}
