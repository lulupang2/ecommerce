import { HttpException, Injectable, OnModuleInit } from '@nestjs/common';
import { CartRepository } from '../infrastructure/persistence/repository';

@Injectable()
export class CartApplicationService implements OnModuleInit {
  constructor(private readonly repository: CartRepository) {}

  onModuleInit() { return this.repository.initialize(); }

  async authorizeOwner(userId: string, user: any): Promise<'allowed' | 'auth_required' | 'forbidden' | 'unavailable'> {
    if (user) return user.sub === userId || user.role === 'admin' ? 'allowed' : 'forbidden';
    try {
      const response = await fetch(
        `${process.env.AUTH_URL || 'http://localhost:3001'}/internal/users/${userId}/exists`,
        { headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || 'techzone-internal' } },
      );
      const payload = response.ok ? await response.json() as any : null;
      return payload?.exists ? 'auth_required' : 'allowed';
    } catch {
      return 'unavailable';
    }
  }

  private internalHeaders() {
    return { 'x-internal-key': process.env.INTERNAL_API_KEY || 'techzone-internal' };
  }

  private async availability(variantIds: string[]): Promise<Map<string, number>> {
    const response = await fetch(
      `${process.env.INVENTORY_URL || 'http://localhost:3006'}/internal/inventory/availability?variantIds=${variantIds.join(',')}`,
      { headers: this.internalHeaders() },
    );
    if (!response.ok) {
      throw new HttpException({ code: 'INVENTORY_UNAVAILABLE' }, 503);
    }
    const payload = await response.json() as any;
    return new Map(
      (payload.items || []).map((item: any) => [
        item.variant_id,
        Number(item.available_qty),
      ]),
    );
  }

  private async canonicalVariants(identifier: string): Promise<any[]> {
    const response = await fetch(
      `${process.env.CATALOG_URL || 'http://localhost:3002'}/internal/variants?ids=${identifier}`,
      { headers: this.internalHeaders() },
    );
    if (!response.ok) {
      throw new HttpException({ code: 'CATALOG_UNAVAILABLE' }, 503);
    }
    const payload = await response.json() as any;
    const variants = (payload.items || []).filter(
      (variant: any) => variant.status === 'active' && variant.product_status === 'published',
    );
    if (!variants.length) {
      throw new HttpException({ code: 'PRODUCT_UNAVAILABLE' }, 409);
    }
    return variants;
  }

  private assertStock(variantId: string, quantity: number, availableQty: number): void {
    if (quantity > availableQty) {
      throw new HttpException({
        code: 'INSUFFICIENT_STOCK',
        details: { variantId, requestedQty: quantity, availableQty },
      }, 409);
    }
  }

  async list(userId: string) {
    const items = await this.repository.list(userId);
    if (!items.length) return items;
    try {
      const availability = await this.availability(items.map(item => item.variant_id));
      return items.map(item => ({
        ...item,
        available_qty: Number(availability.get(item.variant_id) || 0),
        in_stock: Number(availability.get(item.variant_id) || 0) >= Number(item.quantity),
      }));
    } catch {
      return items.map(item => ({ ...item, available_qty: null, in_stock: null }));
    }
  }

  async upsert(userId: string, input: any) {
    const identifier = input.variantId || input.productId;
    const quantity = Number(input.quantity || 1);
    const variants = await this.canonicalVariants(identifier);
    const availability = await this.availability(
      variants.map((variant: any) => variant.variant_id),
    );
    const variant = input.variantId
      ? variants.find((item: any) => item.variant_id === input.variantId)
      : variants.find((item: any) => Number(availability.get(item.variant_id) || 0) > 0)
        || variants[0];
    if (!variant) throw new HttpException({ code: 'PRODUCT_UNAVAILABLE' }, 409);
    const availableQty = Number(availability.get(variant.variant_id) || 0);
    this.assertStock(variant.variant_id, quantity, availableQty);
    return this.repository.upsert(userId, {
      productId: variant.product_id,
      variantId: variant.variant_id,
      sku: variant.sku,
      name: variant.name,
      brand: variant.brand,
      optionValues: variant.option_values,
      image: variant.image,
      price: Number(variant.sale_price),
      quantity,
    });
  }

  async updateQuantity(userId: string, variantId: string, quantity: number) {
    if (quantity < 1) return this.repository.updateQuantity(userId, variantId, quantity);
    const item = await this.repository.item(userId, variantId);
    if (!item) throw new HttpException({ code: 'CART_ITEM_NOT_FOUND' }, 404);
    const [, availability] = await Promise.all([
      this.canonicalVariants(variantId),
      this.availability([variantId]),
    ]);
    this.assertStock(variantId, quantity, Number(availability.get(variantId) || 0));
    return this.repository.updateQuantity(userId, variantId, quantity);
  }
  clear(userId: string) { return this.repository.clear(userId); }
}
