const RECENT_PRODUCTS_KEY = 'techzone-recent';
const RECENT_PRODUCTS_LIMIT = 8;

export interface RecentProduct {
  id: string;
  slug: string;
  name: string;
  image: string;
  price: number;
  brand?: string;
  listPrice?: number;
  discountRate?: number;
  stock?: number;
}

function isRecentProduct(value: unknown): value is RecentProduct {
  if (!value || typeof value !== 'object') return false;
  const product = value as Record<string, unknown>;
  return (
    typeof product.id === 'string'
    && typeof product.slug === 'string'
    && typeof product.name === 'string'
    && typeof product.image === 'string'
    && Number.isFinite(Number(product.price))
  );
}

export function readRecentlyViewed(): RecentProduct[] {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_PRODUCTS_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter(isRecentProduct).slice(0, RECENT_PRODUCTS_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function saveRecentlyViewed(product: Partial<RecentProduct>): RecentProduct[] {
  if (typeof window === 'undefined' || !isRecentProduct(product)) {
    return readRecentlyViewed();
  }

  const next = [
    {
      id: product.id,
      slug: product.slug,
      name: product.name,
      image: product.image,
      price: Number(product.price),
      brand: product.brand,
      listPrice: product.listPrice == null ? undefined : Number(product.listPrice),
      discountRate: product.discountRate == null ? undefined : Number(product.discountRate),
      stock: product.stock == null ? undefined : Number(product.stock),
    },
    ...readRecentlyViewed().filter(value => value.id !== product.id),
  ].slice(0, RECENT_PRODUCTS_LIMIT);

  localStorage.setItem(RECENT_PRODUCTS_KEY, JSON.stringify(next));
  return next;
}
