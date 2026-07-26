import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpException,
  Param, Patch, Post, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { OptionalAuthGuard } from '@techzone/auth-platform/nest-guards';
import {
  IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Max, Min,
} from 'class-validator';
import { CartApplicationService } from '../application/service';

class CartItemDto {
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() variantId?: string;
  @IsOptional() @IsString() sku?: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsObject() optionValues?: Record<string, string>;
  @IsOptional() @IsString() image?: string;
  @IsInt() @Min(0) price!: number;
  @IsOptional() @IsInt() @Min(1) @Max(20) quantity?: number;
}

class CartQuantityDto {
  @IsInt() @Min(0) @Max(20) quantity!: number;
}

@Controller('carts/:userId')
@UseGuards(OptionalAuthGuard)
export class CartController {
  constructor(private readonly application: CartApplicationService) {}

  private async authorize(userId: string, request: any): Promise<void> {
    const result = await this.application.authorizeOwner(userId, request.user);
    if (result === 'unavailable') throw new HttpException({ code: 'AUTH_UNAVAILABLE' }, 503);
    if (result === 'auth_required') {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: '회원 장바구니는 로그인이 필요합니다.' });
    }
    if (result === 'forbidden') {
      throw new ForbiddenException({ code: 'RESOURCE_FORBIDDEN', message: '다른 사용자의 장바구니에 접근할 수 없습니다.' });
    }
  }

  @Get()
  async list(@Param('userId') userId: string, @Req() request: any) {
    await this.authorize(userId, request);
    return { items: await this.application.list(userId) };
  }

  @Post('items')
  async upsert(@Param('userId') userId: string, @Body() body: CartItemDto, @Req() request: any) {
    await this.authorize(userId, request);
    return this.application.upsert(userId, body);
  }

  @Patch('items/:variantId')
  @HttpCode(204)
  async update(
    @Param('userId') userId: string,
    @Param('variantId') variantId: string,
    @Body() body: CartQuantityDto,
    @Req() request: any,
  ) {
    await this.authorize(userId, request);
    await this.application.updateQuantity(userId, variantId, body.quantity);
  }

  @Delete()
  @HttpCode(204)
  async clear(@Param('userId') userId: string, @Req() request: any) {
    await this.authorize(userId, request);
    await this.application.clear(userId);
  }
}
