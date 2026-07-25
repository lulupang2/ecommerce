import {
  Body, ConflictException, Controller, Get, Param, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import {
  AuthGuard, InternalGuard, PermissionGuard, RoleGuard,
} from '@techzone/auth-platform/nest-guards';
import {
  IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProcurementApplicationService } from '../application/service';

class PurchaseOrderItemDto {
  @IsOptional() @IsUUID() productId?: string;
  @IsUUID() variantId!: string;
  @IsString() sku!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsInt() @Min(0) unitCost!: number;
}

class PurchaseOrderCreateDto {
  @IsUUID() supplierId!: string;
  @IsUUID() warehouseId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];
  @IsOptional() @IsString() expectedAt?: string;
}

class ReceiptItemDto {
  @IsUUID() itemId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsIn(['good', 'damaged']) condition?: string;
}

class ReceiptCreateDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiptItemDto)
  items!: ReceiptItemDto[];
}

@Controller()
export class ProcurementController {
  constructor(private readonly application: ProcurementApplicationService) {}

  @Get('procurement/suppliers')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  async suppliers() { return { items: await this.application.suppliers() }; }

  @Get('procurement/purchase-orders')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  async purchaseOrders() { return { items: await this.application.purchaseOrders() }; }

  @Post('procurement/purchase-orders')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('procurement.update'))
  create(@Body() body: PurchaseOrderCreateDto, @Req() request: any) {
    return this.application.create(body, request.user.sub);
  }

  @Patch('procurement/purchase-orders/:id/approve')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('procurement.update'))
  async approve(@Param('id') id: string, @Req() request: any) {
    const result = await this.application.approve(id, request.user.sub);
    if (!result) throw new ConflictException({ code: 'PURCHASE_ORDER_NOT_DRAFT' });
    return result;
  }

  @Post('procurement/purchase-orders/:id/receipts')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('procurement.update'))
  async receive(
    @Param('id') id: string,
    @Body() body: ReceiptCreateDto,
    @Req() request: any,
  ) {
    const result = await this.application.receive(id, body, request.user.sub);
    if (!result) throw new ConflictException({ code: 'PURCHASE_ORDER_NOT_RECEIVABLE' });
    return result;
  }

  @Get('internal/purchase-orders')
  @UseGuards(InternalGuard)
  async internalPurchaseOrders() {
    return { items: await this.application.purchaseOrders() };
  }
}
