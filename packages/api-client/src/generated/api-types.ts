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
export interface ProductVariant {
  id: string;
  sku: string;
  modelNumber?: string | null;
  optionValues: Record<string, string>;
  listPrice: number;
  salePrice: number;
  status: 'active' | 'inactive' | 'sold_out';
  availableQty: number | null;
  inStock: boolean | null;
}
export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  variants: ProductVariant[];
}
export interface CheckoutQuote {
  lines: Array<{
    productId: string;
    variantId: string;
    sku: string;
    name: string;
    price: number;
    quantity: number;
    availableQty: number;
  }>;
  subtotalAmount: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
  quoteToken: string;
  expiresIn: number;
}
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'approved' | 'partially_refunded' | 'refunded' | 'cancelled' | 'failed';
export type FulfillmentStatus = 'unfulfilled' | 'ready' | 'shipped' | 'delivered' | 'returned';
