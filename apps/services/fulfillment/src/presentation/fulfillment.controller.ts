import {
  Body, Controller, Get, Param, Patch, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import {
  AuthGuard, InternalGuard, PermissionGuard, RoleGuard,
} from '@techzone/auth-platform/nest-guards';
import {
  IsIn, IsInt, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';
import { FulfillmentApplicationService } from '../application/service';

class ShipmentCreateDto {
  @IsUUID() orderId!: string;
  @IsOptional() @IsString() recipient?: string;
}

class ShipmentStatusDto {
  @IsIn(['packed', 'shipped', 'delivered', 'cancelled']) status!: string;
  @IsOptional() @IsString() trackingNumber?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() reason?: string;
}

class ReturnCreateDto {
  @IsUUID() orderId!: string;
  @IsString() reason!: string;
  @IsOptional() @IsInt() @Min(0) refundAmount?: number;
}

class GuestReturnCreateDto {
  @IsUUID() orderId!: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsInt() @Min(0) refundAmount?: number;
}

class ReturnStatusDto {
  @IsIn(['approved', 'received', 'refunded', 'rejected']) status!: string;
  @IsOptional() @IsString() reason?: string;
}

class RefundDto {
  @IsOptional() @IsInt() @Min(1) amount?: number;
  @IsOptional() @IsString() reason?: string;
}

@Controller()
export class FulfillmentController {
  constructor(private readonly application: FulfillmentApplicationService) {}

  private send(response: any, result: any) {
    if (result.replayed) response.setHeader('x-idempotency-replayed', 'true');
    return response.status(result.status).json(result.body);
  }

  @Get('fulfillment/shipments')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  async shipments() { return { items: await this.application.shipments() }; }

  @Post('fulfillment/shipments')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('fulfillment.update'))
  async createShipment(
    @Body() body: ShipmentCreateDto,
    @Req() request: any,
    @Res() response: any,
  ) {
    const result = await this.application.idempotent(
      request,
      'fulfillment.shipment',
      () => this.application.createShipment(body, request.user.sub),
    );
    return this.send(response, result);
  }

  @Patch('fulfillment/shipments/:id/status')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('fulfillment.update'))
  async updateShipment(
    @Param('id') id: string,
    @Body() body: ShipmentStatusDto,
    @Req() request: any,
    @Res() response: any,
  ) {
    const result = await this.application.updateShipment(id, body, request.user.sub);
    if (result.kind === 'not_found') return response.status(404).json({ code: 'NOT_FOUND' });
    if (result.kind === 'invalid') {
      return response.status(409).json({ code: 'INVALID_STATUS_TRANSITION' });
    }
    return response.json(result.value);
  }

  @Get('fulfillment/returns')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  async returns() { return { items: await this.application.returns() }; }

  @Post('fulfillment/returns')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('fulfillment.update'))
  createReturn(@Body() body: ReturnCreateDto, @Req() request: any) {
    return this.application.createReturn(body, request.user.sub);
  }

  @Post('fulfillment/returns/guest')
  async createGuestReturn(
    @Body() body: GuestReturnCreateDto,
    @Req() request: any,
    @Res() response: any,
  ) {
    return this.send(
      response,
      await this.application.createGuestReturn(body, request.headers.authorization),
    );
  }

  @Patch('fulfillment/returns/:id/status')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('fulfillment.update'))
  async updateReturn(
    @Param('id') id: string,
    @Body() body: ReturnStatusDto,
    @Req() request: any,
    @Res() response: any,
  ) {
    const result = await this.application.updateReturn(id, body, request.user.sub);
    if (result.kind === 'not_found') return response.status(404).json({ code: 'NOT_FOUND' });
    if (result.kind === 'invalid') {
      return response.status(409).json({ code: 'INVALID_STATUS_TRANSITION' });
    }
    return response.json(result.value);
  }

  @Post('fulfillment/returns/:id/refund')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('payments.refund'))
  async refund(
    @Param('id') id: string,
    @Body() body: RefundDto,
    @Req() request: any,
    @Res() response: any,
  ) {
    return this.send(
      response,
      await this.application.refund(
        id,
        body,
        request.user.sub,
        request.headers.authorization,
      ),
    );
  }

  @Get('internal/shipments')
  @UseGuards(InternalGuard)
  async internalShipments() { return { items: await this.application.shipments() }; }

  @Get('internal/returns')
  @UseGuards(InternalGuard)
  async internalReturns() { return { items: await this.application.returns() }; }
}
