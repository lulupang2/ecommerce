'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@techzone/api-client/store';
import {
  getCurrentUserId,
  readSession,
  type Session,
} from '@techzone/api-client/session';
import {
  clearStoredGuestWishlist,
  GUEST_WISHLIST_KEY,
  useStorefrontUiStore,
} from '@/stores/storefront-ui-store';

export const storefrontKeys = {
  all: ['storefront'] as const,
  cart: (userId: string) => [...storefrontKeys.all, 'cart', userId] as const,
  wishlist: (userId: string) => [...storefrontKeys.all, 'wishlist', userId] as const,
  search: (query: string) => [...storefrontKeys.all, 'search', query] as const,
  home: () => [...storefrontKeys.all, 'home'] as const,
  products: (params: string) => [...storefrontKeys.all, 'products', params] as const,
  product: (identity: string) => [...storefrontKeys.all, 'product', identity] as const,
  orders: (userId: string) => [...storefrontKeys.all, 'orders', userId] as const,
  order: (id: string, guest: boolean) => [...storefrontKeys.all, 'order', guest ? 'guest' : 'member', id] as const,
  quote: (lineKey: string, couponCode: string) => [...storefrontKeys.all, 'quote', lineKey, couponCode] as const,
};

export function useClientIdentity() {
  const [identity, setIdentity] = useState<{ userId: string; session: Session | null } | null>(null);

  useEffect(() => {
    setIdentity({ userId: getCurrentUserId(), session: readSession() });
  }, []);

  return identity;
}

function updateCartItem(items: any[], variantId: string, quantity: number, nextItem?: any) {
  if (quantity < 1) return items.filter(item => item.variant_id !== variantId);
  const exists = items.some(item => item.variant_id === variantId);
  if (!exists && nextItem) return [nextItem, ...items];
  return items.map(item => item.variant_id === variantId ? { ...item, quantity } : item);
}

export function useCartState() {
  const identity = useClientIdentity();
  const queryClient = useQueryClient();
  const userId = identity?.userId || '';
  const queryKey = storefrontKeys.cart(userId);
  const cartQuery = useQuery({
    queryKey,
    queryFn: () => api(`/carts/${userId}`),
    enabled: Boolean(userId),
  });

  const addMutation = useMutation({
    mutationFn: (item: any) => api(`/carts/${userId}/items`, {
      method: 'POST',
      body: JSON.stringify(item),
    }),
    onMutate: async item => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<any>(queryKey);
      const items = previous?.items || [];
      const existing = items.find(value => value.variant_id === item.variantId);
      const optimistic = {
        product_id: item.productId,
        variant_id: item.variantId,
        sku: item.sku,
        name: item.name,
        brand: item.brand,
        option_values: item.optionValues,
        image: item.image,
        price: item.price,
        quantity: item.quantity,
      };
      queryClient.setQueryData(queryKey, {
        ...(previous || {}),
        items: updateCartItem(items, item.variantId, existing ? item.quantity : item.quantity, optimistic),
      });
      return { previous };
    },
    onError: (_error, _item, context) => queryClient.setQueryData(queryKey, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const changeMutation = useMutation({
    mutationFn: ({ variantId, quantity }: { variantId: string; quantity: number }) => api(
      `/carts/${userId}/items/${variantId}`,
      { method: 'PATCH', body: JSON.stringify({ quantity }) },
    ),
    onMutate: async ({ variantId, quantity }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<any>(queryKey);
      queryClient.setQueryData(queryKey, {
        ...(previous || {}),
        items: updateCartItem(previous?.items || [], variantId, quantity),
      });
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(queryKey, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const clearMutation = useMutation({
    mutationFn: () => api(`/carts/${userId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.setQueryData(queryKey, { items: [] }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const cart = cartQuery.data?.items || [];

  async function add(product: any, variant?: any, quantity = 1) {
    if (!userId) throw new Error('CART_NOT_READY');
    const selected = variant || product.variants?.[0] || {
      id: product.variantId,
      sku: product.sku,
      salePrice: product.price,
      optionValues: product.optionValues,
    };
    const existing = cart.find(item => item.variant_id === selected.id);
    await addMutation.mutateAsync({
      productId: product.id,
      variantId: selected.id,
      sku: selected.sku,
      name: product.name,
      brand: product.brand,
      optionValues: selected.optionValues || {},
      image: product.image,
      price: Number(selected.salePrice || product.price),
      quantity: (existing?.quantity || 0) + quantity,
    });
  }

  return {
    cart,
    cartLoading: cartQuery.isPending,
    add,
    change: (variantId: string, quantity: number) => changeMutation.mutateAsync({ variantId, quantity }),
    clear: () => clearMutation.mutateAsync(),
  };
}

export function useWishlistState() {
  const identity = useClientIdentity();
  const queryClient = useQueryClient();
  const hydrateGuestWishlist = useStorefrontUiStore(state => state.hydrateGuestWishlist);
  const guestWishlistHydrated = useStorefrontUiStore(state => state.guestWishlistHydrated);
  const guestWishlistIds = useStorefrontUiStore(state => state.guestWishlistIds);
  const setGuestWishlistIds = useStorefrontUiStore(state => state.setGuestWishlistIds);
  const session = identity?.session || null;
  const userId = session?.user?.id || '';
  const queryKey = storefrontKeys.wishlist(userId);

  useEffect(() => {
    if (!guestWishlistHydrated) hydrateGuestWishlist();
  }, [guestWishlistHydrated, hydrateGuestWishlist]);
  useEffect(() => {
    if (session) return;
    const syncWishlist = (event: StorageEvent) => {
      if (event.key === GUEST_WISHLIST_KEY) hydrateGuestWishlist();
    };
    window.addEventListener('storage', syncWishlist);
    return () => window.removeEventListener('storage', syncWishlist);
  }, [hydrateGuestWishlist, session]);

  const wishlistQuery = useQuery({
    queryKey,
    queryFn: () => api(`/wishlists/${userId}`, { cache: 'no-store' }),
    enabled: Boolean(userId),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ productId, removing }: { productId: string; removing: boolean }) => api(
      `/wishlists/${userId}/${productId}`,
      { method: removing ? 'DELETE' : 'POST' },
    ),
    onMutate: async ({ productId, removing }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<any>(queryKey);
      const items = previous?.items || [];
      queryClient.setQueryData(queryKey, {
        ...(previous || {}),
        items: removing
          ? items.filter(item => item.id !== productId)
          : [{ id: productId }, ...items],
      });
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(queryKey, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const serverWishlistIds = (wishlistQuery.data?.items || []).map(item => item.id);
  const wishlistIds = session ? serverWishlistIds : guestWishlistIds;

  async function toggleWishlist(productId: string) {
    const removing = wishlistIds.includes(productId);
    if (!session) {
      setGuestWishlistIds(
        removing
          ? guestWishlistIds.filter(id => id !== productId)
          : [...guestWishlistIds, productId],
      );
      return true;
    }
    try {
      await toggleMutation.mutateAsync({ productId, removing });
      return true;
    } catch {
      return false;
    }
  }

  const mergeGuestWishlist = useCallback(async () => {
    if (!session || !guestWishlistIds.length) return;
    await Promise.all(guestWishlistIds.map(productId => api(
      `/wishlists/${session.user.id}/${productId}`,
      { method: 'POST' },
    )));
    clearStoredGuestWishlist();
    await queryClient.invalidateQueries({ queryKey: storefrontKeys.wishlist(session.user.id) });
  }, [guestWishlistIds, queryClient, session]);

  return {
    session,
    wishlistIds,
    wishlistProducts: wishlistQuery.data?.items || [],
    wishlistLoading: Boolean(userId) && wishlistQuery.isPending,
    toggleWishlist,
    mergeGuestWishlist,
  };
}

export function useSearchSuggestions(query: string) {
  return useQuery({
    queryKey: storefrontKeys.search(query.trim()),
    queryFn: () => api(`/products?q=${encodeURIComponent(query.trim())}&pageSize=5`),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });
}

export function useStorefrontHome(initialData?: any) {
  return useQuery({
    queryKey: storefrontKeys.home(),
    queryFn: () => api('/storefront/home'),
    initialData: initialData || undefined,
    staleTime: 60_000,
  });
}

export function useStorefrontProducts(params: string, initialData?: any) {
  return useQuery({
    queryKey: storefrontKeys.products(params),
    queryFn: () => api(`/products?${params}`),
    initialData: initialData || undefined,
    placeholderData: previous => previous,
  });
}

export function useStorefrontProduct({
  slug,
  id,
  initialProduct,
}: {
  slug?: string | null;
  id?: string | null;
  initialProduct?: any;
}) {
  const identity = slug ? `slug:${slug}` : `id:${id || ''}`;
  return useQuery({
    queryKey: storefrontKeys.product(identity),
    queryFn: () => api(slug ? `/products/by-slug/${slug}` : `/products/${id}`),
    enabled: Boolean(slug || id),
    initialData: initialProduct || undefined,
    staleTime: 60_000,
  });
}

export function useMemberOrders() {
  const identity = useClientIdentity();
  const session = identity?.session || null;
  const userId = session?.user?.id || '';
  const query = useQuery({
    queryKey: storefrontKeys.orders(userId),
    queryFn: () => api(`/orders?userId=${encodeURIComponent(userId)}`),
    enabled: Boolean(userId),
  });

  return {
    identityReady: identity !== null,
    session,
    orders: query.data?.items || [],
    ...query,
  };
}

export function useOrderDetail(orderNumber: string) {
  const [access, setAccess] = useState<{ id: string; token: string | null } | null | undefined>(undefined);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id');
    setAccess(id ? {
      id,
      token: localStorage.getItem(`techzone-guest-order-${orderNumber}`),
    } : null);
  }, [orderNumber]);

  const query = useQuery({
    queryKey: storefrontKeys.order(access?.id || '', Boolean(access?.token)),
    queryFn: () => api(
      access?.token ? `/orders/guest/${access.id}` : `/orders/${access?.id}`,
      access?.token ? { headers: { authorization: `Bearer ${access.token}` } } : {},
    ),
    enabled: Boolean(access?.id),
  });

  return {
    ...query,
    accessReady: access !== undefined,
    missingOrderId: access === null,
    orderId: access?.id || '',
  };
}

export function useCheckoutQuote(lines: any[], couponCode: string) {
  const lineKey = JSON.stringify(lines);
  return useQuery({
    queryKey: storefrontKeys.quote(lineKey, couponCode),
    queryFn: () => api('/checkout/quote', {
      method: 'POST',
      body: JSON.stringify({ items: lines, couponCode: couponCode || undefined }),
    }),
    enabled: lines.length > 0,
    staleTime: 0,
    retry: false,
  });
}
