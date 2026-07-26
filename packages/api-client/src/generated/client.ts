/* Generated from contracts/openapi.json. Do not edit manually. */
import type { CheckoutQuote, Page, ProductDetail, Session } from './api-types';

export class TechzoneApiClient {
  constructor(private readonly baseUrl: string, private readonly headers: () => Record<string, string> = () => ({})) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',
      ...options,
      headers: { 'content-type': 'application/json', ...this.headers(), ...(options.headers || {}) },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw Object.assign(new Error(data?.message || data?.code || 'REQUEST_FAILED'), { status: response.status, data });
    return data as T;
  }

  login(body: { email: string; password: string }) { return this.request<Session>('/auth/login', { method: 'POST', body: JSON.stringify(body) }); }
  refreshSession() { return this.request<Session>('/auth/refresh', { method: 'POST', body: '{}' }); }
  listProducts(query = '') { return this.request<Page>(`/products${query ? `?${query}` : ''}`); }
  getProductBySlug(slug: string) { return this.request<ProductDetail>(`/products/by-slug/${encodeURIComponent(slug)}`); }
  createCheckoutQuote(body: { items: Array<{ variantId: string; quantity: number }>; couponCode?: string }) { return this.request<CheckoutQuote>('/checkout/quote', { method: 'POST', body: JSON.stringify(body) }); }
  getWishlist(userId: string) { return this.request<{ items: unknown[] }>(`/wishlists/${encodeURIComponent(userId)}`); }
  addWishlistProduct(userId: string, productId: string) { return this.request<unknown>(`/wishlists/${encodeURIComponent(userId)}/${encodeURIComponent(productId)}`, { method: 'POST', body: '{}' }); }
  removeWishlistProduct(userId: string, productId: string) { return this.request<void>(`/wishlists/${encodeURIComponent(userId)}/${encodeURIComponent(productId)}`, { method: 'DELETE' }); }
  createOrder(body: unknown, idempotencyKey: string) { return this.request<unknown>('/orders', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) }); }
  getAdminDashboard(query = '') { return this.request<unknown>(`/admin/dashboard${query ? `?${query}` : ''}`); }
  listDeadLetters(query = '') { return this.request<Page>(`/admin/dead-letters${query ? `?${query}` : ''}`); }
}
