import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InventoryAdjustmentDto } from '@techzone/contracts/dtos';
import {
  AuthGuard,
  InternalGuard,
  PermissionGuard,
  RoleGuard,
} from '@techzone/auth-platform/nest-guards';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { InventoryApplicationService } from '../application/service';

class InventoryTransferDto {
  @IsUUID() variantId!: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsUUID() fromWarehouseId!: string;
  @IsUUID() toWarehouseId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() reason?: string;
}

@Controller()
export class InventoryController {
  constructor(private readonly application: InventoryApplicationService) {}

  private send(response: any, result: any) {
    if (result.replayed) response.setHeader('x-idempotency-replayed', 'true');
    return response.status(result.status).json(result.body);
  }

  @Get('inventory')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  async list() {
    return { items: await this.application.list() };
  }

  @Get('inventory/operations/movements')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  async movements(@Query('variantId') variantId?: string) {
    return { items: await this.application.movements(variantId) };
  }

  @Get('inventory/operations/serials')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  async serials() {
    return { items: await this.application.serials() };
  }

  @Get('inventory/operations/warehouses')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  async warehouses() {
    return { items: await this.application.warehouses() };
  }

  @Get('inventory/:productId')
  stock(@Param('productId') productId: string) {
    return this.application.stock(productId);
  }

  @Patch('inventory/:productId')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('inventory.update'))
  async adjust(
    @Param('productId') productId: string,
    @Body() body: InventoryAdjustmentDto,
    @Req() request: any,
    @Res() response: any,
  ) {
    const result = await this.application.idempotent(
      request,
      'inventory.adjust',
      () => this.application.adjust(productId, body, request.user.sub),
    );
    return this.send(response, result);
  }

  @Patch('inventory/variants/:variantId')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('inventory.update'))
  async adjustVariant(
    @Param('variantId') variantId: string,
    @Body() body: InventoryAdjustmentDto,
    @Req() request: any,
    @Res() response: any,
  ) {
    const result = await this.application.idempotent(
      request,
      'inventory.variant.adjust',
      () => this.application.adjustVariant(variantId, body, request.user.sub),
    );
    return this.send(response, result);
  }

  @Post('inventory/operations/transfers')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('inventory.update'))
  async transfer(
    @Body() body: InventoryTransferDto,
    @Req() request: any,
    @Res() response: any,
  ) {
    const result = await this.application.idempotent(
      request,
      'inventory.transfer',
      () => this.application.transfer(body, request.user.sub),
    );
    return this.send(response, result);
  }

  @Get('internal/inventory')
  @UseGuards(InternalGuard)
  async internalInventory() {
    return { items: await this.application.internalInventory() };
  }

  @Get('internal/inventory/availability')
  @UseGuards(InternalGuard)
  async availability(@Query('variantIds') rawVariantIds = '') {
    const variantIds = [...new Set(rawVariantIds.split(',').filter(Boolean))];
    return { items: await this.application.availability(variantIds) };
  }

  @Get('internal/warehouses')
  @UseGuards(InternalGuard)
  async internalWarehouses() {
    return { items: await this.application.warehouses() };
  }
}
