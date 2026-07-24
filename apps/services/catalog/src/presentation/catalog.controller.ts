import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException,
  Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import {
  AuthGuard, InternalGuard, PermissionGuard, RoleGuard,
} from '@techzone/auth-platform/nest-guards';
import { CatalogApplicationService } from '../application/service';
import {
  ProductCreateDto, ProductUpdateDto, QuestionCreateDto, ReviewCreateDto,
  ReviewStatusDto, SectionCreateDto, SectionUpdateDto,
} from './catalog.dtos';

@Controller()
export class CatalogController {
  constructor(private readonly application: CatalogApplicationService) {}

  @Get('storefront/home')
  home() { return this.application.home(); }

  @Get('products')
  products(@Query() query: Record<string, string | undefined>) {
    return this.application.products(query);
  }

  @Get('products/by-slug/:slug')
  async bySlug(@Param('slug') slug: string) {
    const result = await this.application.detail('slug', slug);
    if (!result) throw new NotFoundException({ code: 'NOT_FOUND' });
    return result;
  }

  @Get('products/:id')
  async byId(@Param('id') id: string) {
    const result = await this.application.detail('id', id);
    if (!result) throw new NotFoundException({ code: 'NOT_FOUND' });
    return result;
  }

  @Post('products/:id/reviews')
  @UseGuards(AuthGuard)
  createReview(@Param('id') id: string, @Body() body: ReviewCreateDto, @Req() request: any) {
    return this.application.createReview(id, request.user, body);
  }

  @Post('products/:id/questions')
  @UseGuards(AuthGuard)
  createQuestion(@Param('id') id: string, @Body() body: QuestionCreateDto, @Req() request: any) {
    return this.application.createQuestion(id, request.user, body);
  }

  @Get('wishlists/:ownerId')
  async wishlist(@Param('ownerId') ownerId: string) {
    return { items: await this.application.wishlist(ownerId) };
  }

  @Post('wishlists/:ownerId/:productId')
  @UseGuards(AuthGuard)
  async addWishlist(
    @Param('ownerId') ownerId: string,
    @Param('productId') productId: string,
    @Req() request: any,
  ) {
    if (request.user.sub !== ownerId) throw new ForbiddenException({ code: 'FORBIDDEN' });
    await this.application.addWishlist(ownerId, productId);
  }

  @Delete('wishlists/:ownerId/:productId')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async removeWishlist(
    @Param('ownerId') ownerId: string,
    @Param('productId') productId: string,
    @Req() request: any,
  ) {
    if (request.user.sub !== ownerId) throw new ForbiddenException({ code: 'FORBIDDEN' });
    await this.application.removeWishlist(ownerId, productId);
  }

  @Get('storefront/admin/sections')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('products.read'))
  async sections() { return { items: await this.application.sections() }; }

  @Post('storefront/admin/sections')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('products.update'))
  async createSection(@Body() body: SectionCreateDto) {
    return { id: await this.application.createSection(body) };
  }

  @Patch('storefront/admin/sections/:id')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('products.update'))
  async updateSection(@Param('id') id: string, @Body() body: SectionUpdateDto) {
    const result = await this.application.updateSection(id, body);
    if (!result) throw new NotFoundException({ code: 'NOT_FOUND' });
    return result;
  }

  @Post('products')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('products.update'))
  createProduct(@Body() body: ProductCreateDto, @Req() request: any) {
    return this.application.createProduct(body, request.user.sub);
  }

  @Patch('products/:id')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('products.update'))
  async updateProduct(
    @Param('id') id: string,
    @Body() body: ProductUpdateDto,
    @Req() request: any,
  ) {
    const result = await this.application.updateProduct(id, body, request.user.sub);
    if (!result) throw new NotFoundException({ code: 'NOT_FOUND' });
    return result;
  }

  @Get('reviews')
  @UseGuards(AuthGuard, RoleGuard('admin'))
  async reviews() { return { items: await this.application.reviews() }; }

  @Patch('reviews/:id')
  @UseGuards(AuthGuard, RoleGuard('admin'), PermissionGuard('reviews.update'))
  async updateReview(@Param('id') id: string, @Body() body: ReviewStatusDto) {
    const result = await this.application.updateReview(id, body.status);
    if (!result) throw new NotFoundException({ code: 'NOT_FOUND' });
    return result;
  }

  @Get('internal/products')
  @UseGuards(InternalGuard)
  async internalProducts() { return { items: await this.application.internalProducts() }; }

  @Get('internal/variants')
  @UseGuards(InternalGuard)
  async variants(@Query('ids') rawIds = '') {
    return { items: await this.application.variants(rawIds.split(',').filter(Boolean)) };
  }

  @Get('internal/reviews')
  @UseGuards(InternalGuard)
  async internalReviews() { return { items: await this.application.internalReviews() }; }
}
