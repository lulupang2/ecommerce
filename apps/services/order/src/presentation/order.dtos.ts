import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuoteItemDto {
  @IsUUID() variantId!: string;
  @IsInt() @Min(1) @Max(20) quantity!: number;
}

export class CheckoutQuoteDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => QuoteItemDto)
  items!: QuoteItemDto[];
  @IsOptional() @IsString() @MaxLength(50) couponCode?: string;
}

export class OrderItemDto {
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() variantId?: string;
  @IsOptional() @IsString() sku?: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() brand!: string;
  @IsOptional() @IsString() image?: string;
  @IsInt() @Min(0) price!: number;
  @IsInt() @Min(1) @Max(20) quantity!: number;
}

export class ShippingDto {
  @IsString() @IsNotEmpty() recipient!: string;
  @IsString() @IsNotEmpty() phone!: string;
  @IsString() @IsNotEmpty() address!: string;
  @IsOptional() @IsString() address2?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() memo?: string;
}

export class CreateOrderDto {
  @IsUUID() userId!: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OrderItemDto)
  items?: OrderItemDto[];
  @ValidateNested() @Type(() => ShippingDto) shipping!: ShippingDto;
  @IsOptional() @IsString() quoteToken?: string;
  @IsOptional() @IsBoolean() guestOrder?: boolean;
  @IsOptional() @IsIn(['card', 'kakaopay', 'naverpay', 'bank']) paymentMethod?: string;
}

export class CouponCreateDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsOptional() @IsIn(['percent', 'fixed']) type?: string;
  @IsInt() @Min(1) value!: number;
  @IsOptional() @IsInt() @Min(0) minOrderAmount?: number;
  @IsOptional() @IsInt() @Min(1) maxDiscountAmount?: number;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
  @IsOptional() @IsInt() @Min(1) usageLimit?: number;
}

export class CouponUpdateDto {
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
  @IsOptional() @IsString() endsAt?: string;
}

export class OrderStatusDto {
  @IsIn(['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'])
  status!: string;
  @IsOptional() @IsString() reason?: string;
}

export class CancelOrderDto {
  @IsOptional() @IsString() reason?: string;
}
