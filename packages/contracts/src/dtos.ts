import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

export class LoginDto {
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}

export class RefreshDto {
  @IsOptional() @IsString() @MaxLength(512) refreshToken?: string;
}

export class PaymentConfirmDto {
  @IsOptional() @IsString() @MaxLength(200) paymentKey?: string;
  @IsUUID() orderId!: string;
  @IsInt() @Min(0) amount!: number;
  @IsOptional() order?: unknown;
  @IsOptional() @IsIn(['card', 'kakaopay', 'naverpay', 'bank']) provider?: string;
  @IsOptional() @IsIn(['card', 'kakaopay', 'naverpay', 'bank']) method?: string;
}

export class RefundDto {
  @IsInt() @Min(1) amount!: number;
  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

export class InventoryAdjustmentDto {
  @IsInt() @Min(0) availableQty!: number;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

export class GuestAccessDto {
  @IsString() @IsNotEmpty() @MaxLength(40) orderNumber!: string;
  @IsString() @IsNotEmpty() @MaxLength(30) phone!: string;
}

export class PaginationDto {
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(100) sort?: string;
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
  @IsOptional() @IsString() @MaxLength(200) search?: string;
}
