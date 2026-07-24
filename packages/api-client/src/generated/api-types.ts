/* Generated from contracts/openapi.json. Do not edit manually. */
export interface ApiError {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
  timestamp: string;
}
export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  adminRole?: string | null;
  permissions?: string[];
}
export interface Session {
  user: User;
  accessToken: string;
  refreshToken?: string;
  csrfToken: string;
}
export interface Page<T = unknown> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'approved' | 'partially_refunded' | 'refunded' | 'cancelled' | 'failed';
export type FulfillmentStatus = 'unfulfilled' | 'ready' | 'shipped' | 'delivered' | 'returned';
