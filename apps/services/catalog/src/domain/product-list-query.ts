export const PRODUCT_LIST_SORTS = [
  'popular',
  'newest',
  'discount',
  'price_asc',
  'price_desc',
] as const;

export interface ProductListQuery {
  q?: string | undefined;
  search?: string | undefined;
  category?: string | undefined;
  brand?: string | undefined;
  minPrice?: string | undefined;
  maxPrice?: string | undefined;
  inStock?: string | undefined;
  discounted?: string | undefined;
  sort?: typeof PRODUCT_LIST_SORTS[number] | undefined;
  page?: string | undefined;
  pageSize?: string | undefined;
  status?: string | undefined;
}
