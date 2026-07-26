import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ForbiddenException, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { CatalogRepository } from '../infrastructure/persistence/repository';
import { RichTextProvider } from '../infrastructure/providers/rich-text.provider';
import { ProductListQuery } from '../domain/product-list-query';

const { subscribe } = require('@techzone/messaging/bus') as {
  subscribe(service: string, patterns: string[], handler: (event: any) => Promise<void>): Promise<void>;
};
const logger = require('@techzone/observability/logger') as {
  warn(message: string, fields?: Record<string, unknown>): void;
};

@Injectable()
export class CatalogApplicationService implements OnModuleInit {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly richText: RichTextProvider,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repository.initialize();
    await subscribe(
      'catalog-cache',
      ['product.*', 'inventory.*'],
      async () => this.clearPublicCache(),
    );
  }

  private async remember<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
    try {
      const cached = await this.cache.get<T>(key);
      if (cached !== undefined && cached !== null) return cached;
    } catch (error) {
      logger.warn('cache.read_failed', {
        key,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
    const value = await loader();
    if (value !== null && value !== undefined) {
      try {
        await this.cache.set(key, value, ttl);
      } catch (error) {
        logger.warn('cache.write_failed', {
          key,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
    return value;
  }

  private async clearPublicCache(): Promise<void> {
    try {
      await this.cache.clear();
    } catch (error) {
      logger.warn('cache.clear_failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  private productListCacheKey(query: ProductListQuery): string {
    const normalized = Object.fromEntries(
      Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    return `products:${JSON.stringify(normalized)}`;
  }

  private responseProduct(row: any) {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      brand: row.brand,
      category: row.category,
      price: Number(row.sale_price ?? row.price),
      listPrice: Number(row.list_price ?? row.price),
      discountRate: Number(row.discount_rate || 0),
      note: this.richText.sanitize(row.note),
      color: row.color,
      image: row.image,
      stock: Number(row.stock),
      status: row.status,
      variantId: row.variant_id,
      sku: row.sku,
      modelNumber: row.model_number,
      optionValues: row.option_values,
      createdAt: row.created_at,
    };
  }

  async home(): Promise<any> {
    return this.remember('storefront:home', 60_000, async () => {
      const result = await this.repository.home();
      return {
        sections: result.sections.map((section: any) => ({
          ...section,
          products: section.products.map((row: any) => this.responseProduct(row)),
        })),
        categories: result.categories,
        brands: result.brands,
        shipping: { freeThreshold: 80_000, fee: 3_000 },
        coupon: { code: 'TECHZONE10', label: '30만원 이상 10% 할인' },
      };
    });
  }

  async products(query: ProductListQuery): Promise<any> {
    return this.remember(this.productListCacheKey(query), 30_000, async () => {
      const result = await this.repository.products(query);
      return {
        items: result.rows.map((row: any) => this.responseProduct(row)),
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        pageCount: result.pageCount,
      };
    });
  }

  async detail(field: 'id' | 'slug', value: string): Promise<any | null> {
    return this.remember(`product:${field}:${value}`, 20_000, () => this.loadDetail(field, value));
  }

  private async loadDetail(field: 'id' | 'slug', value: string): Promise<any | null> {
    const result = await this.repository.detail(field, value);
    if (!result) return null;
    const availability = await this.repository.variantAvailability(
      result.variants.map((variant: any) => variant.id),
    );
    const variants = result.variants.map((variant: any) => {
      const availableQty = availability.has(variant.id)
        ? availability.get(variant.id)
        : null;
      return {
        ...variant,
        availableQty,
        inStock: availableQty === null ? null : Number(availableQty) > 0,
      };
    });
    const hasAvailability = variants.some((variant: any) => variant.availableQty !== null);
    const product = {
      ...this.responseProduct(result.product),
      stock: hasAvailability
        ? variants.reduce(
            (sum: number, variant: any) => sum + Number(variant.availableQty || 0),
            0,
          )
        : Number(result.product.stock),
    };
    const average = result.reviews.length
      ? result.reviews.reduce((sum: number, item: any) => sum + item.rating, 0) / result.reviews.length
      : 0;
    return {
      ...product,
      variants,
      images: result.images,
      specs: result.specs,
      reviews: result.reviews,
      reviewSummary: { average: Number(average.toFixed(1)), count: result.reviews.length },
      questions: result.questions,
      related: result.related.map((row: any) => this.responseProduct(row)),
    };
  }

  async createReview(productId: string, user: any, input: any): Promise<any> {
    const purchases = await this.repository.purchases(user.sub);
    if (!purchases.includes(productId)) {
      throw new ForbiddenException({ code: 'PURCHASE_REQUIRED' });
    }
    const result = await this.repository.createReview(productId, user, input);
    await this.clearPublicCache();
    return result;
  }

  async createQuestion(productId: string, user: any, input: any) {
    const result = await this.repository.createQuestion(productId, user, input);
    await this.clearPublicCache();
    return result;
  }

  async wishlist(ownerId: string): Promise<any[]> {
    return (await this.repository.wishlist(ownerId)).map(row => this.responseProduct(row));
  }

  addWishlist(ownerId: string, productId: string) {
    return this.repository.addWishlist(ownerId, productId);
  }

  removeWishlist(ownerId: string, productId: string) {
    return this.repository.removeWishlist(ownerId, productId);
  }

  sections() { return this.repository.sections(); }
  async createSection(input: any) {
    const result = await this.repository.createSection(input);
    await this.clearPublicCache();
    return result;
  }
  async updateSection(id: string, input: any) {
    const result = await this.repository.updateSection(id, input);
    await this.clearPublicCache();
    return result;
  }

  async createProduct(input: any, actorId: string) {
    const result = await this.repository.createProduct(
      input,
      this.richText.sanitize(input.note),
      actorId,
    );
    await this.clearPublicCache();
    return result;
  }

  async updateProduct(id: string, input: any, actorId: string): Promise<any | null> {
    const result = await this.repository.updateProduct(
      id,
      input,
      input.note === undefined ? null : this.richText.sanitize(input.note),
      actorId,
    );
    await this.clearPublicCache();
    return result ? { ...result, note: this.richText.sanitize(result.note) } : null;
  }

  reviews() { return this.repository.reviews(); }
  async updateReview(id: string, status: string) {
    const result = await this.repository.updateReview(id, status);
    await this.clearPublicCache();
    return result;
  }

  async internalProducts(): Promise<any[]> {
    return (await this.repository.internalProducts()).map(row => ({
      ...this.responseProduct(row),
      variant_id: row.variant_id,
      model_number: row.model_number,
      cost_price: row.cost_price,
      created_at: row.created_at,
    }));
  }

  variants(ids: string[]) { return this.repository.variants(ids); }
  internalReviews() { return this.repository.internalReviews(); }
}
