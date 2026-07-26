import { ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { CatalogRepository } from '../infrastructure/persistence/repository';
import { RichTextProvider } from '../infrastructure/providers/rich-text.provider';
import { ProductListQuery } from '../domain/product-list-query';

@Injectable()
export class CatalogApplicationService implements OnModuleInit {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly richText: RichTextProvider,
  ) {}

  onModuleInit() { return this.repository.initialize(); }

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
  }

  async products(query: ProductListQuery): Promise<any> {
    const result = await this.repository.products(query);
    return {
      items: result.rows.map((row: any) => this.responseProduct(row)),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      pageCount: result.pageCount,
    };
  }

  async detail(field: 'id' | 'slug', value: string): Promise<any | null> {
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
    return this.repository.createReview(productId, user, input);
  }

  createQuestion(productId: string, user: any, input: any) {
    return this.repository.createQuestion(productId, user, input);
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
  createSection(input: any) { return this.repository.createSection(input); }
  updateSection(id: string, input: any) { return this.repository.updateSection(id, input); }

  createProduct(input: any, actorId: string) {
    return this.repository.createProduct(
      input,
      this.richText.sanitize(input.note),
      actorId,
    );
  }

  async updateProduct(id: string, input: any, actorId: string): Promise<any | null> {
    const result = await this.repository.updateProduct(
      id,
      input,
      input.note === undefined ? null : this.richText.sanitize(input.note),
      actorId,
    );
    return result ? { ...result, note: this.richText.sanitize(result.note) } : null;
  }

  reviews() { return this.repository.reviews(); }
  updateReview(id: string, status: string) { return this.repository.updateReview(id, status); }

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
