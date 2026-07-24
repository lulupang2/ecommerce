/* Generated from contracts/openapi.json. Do not edit manually. */
import type { Page, Session } from './api-types';

export class TechzoneApiClient {
  constructor(private readonly baseUrl: string, private readonly headers: () => Record<string, string> = () => ({})) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',
      ...options,
      headers: { 'content-type': 'application/json', ...this.headers(), ...(options.headers || {}) },
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.message || data.code), { status: response.status, data });
    return data as T;
  }

  login(body: { email: string; password: string }) { return this.request<Session>('/auth/login', { method: 'POST', body: JSON.stringify(body) }); }
  refreshSession() { return this.request<Session>('/auth/refresh', { method: 'POST', body: '{}' }); }
  listProducts(query = '') { return this.request<Page>(`/products${query ? `?${query}` : ''}`); }
  createOrder(body: unknown, idempotencyKey: string) { return this.request<unknown>('/orders', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) }); }
  getAdminDashboard(query = '') { return this.request<unknown>(`/admin/dashboard${query ? `?${query}` : ''}`); }
  listDeadLetters(query = '') { return this.request<Page>(`/admin/dead-letters${query ? `?${query}` : ''}`); }
}
