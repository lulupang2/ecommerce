'use client';

import { create } from 'zustand';

export const GUEST_WISHLIST_KEY = 'techzone-wishlist';

interface StorefrontUiState {
  cartOpen: boolean;
  menuOpen: boolean;
  searchQuery: string;
  guestWishlistIds: string[];
  guestWishlistHydrated: boolean;
  setCartOpen: (open: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  hydrateGuestWishlist: () => void;
  setGuestWishlistIds: (productIds: string[]) => void;
}

function normalizeProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string'))];
}

function readGuestWishlist(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return normalizeProductIds(JSON.parse(localStorage.getItem(GUEST_WISHLIST_KEY) || '[]'));
  } catch {
    return [];
  }
}

export const useStorefrontUiStore = create<StorefrontUiState>((set) => ({
  cartOpen: false,
  menuOpen: false,
  searchQuery: '',
  guestWishlistIds: [],
  guestWishlistHydrated: false,
  setCartOpen: cartOpen => set({ cartOpen }),
  setMenuOpen: menuOpen => set({ menuOpen }),
  setSearchQuery: searchQuery => set({ searchQuery }),
  hydrateGuestWishlist: () => set({
    guestWishlistIds: readGuestWishlist(),
    guestWishlistHydrated: true,
  }),
  setGuestWishlistIds: guestWishlistIds => {
    const normalized = normalizeProductIds(guestWishlistIds);
    if (typeof window !== 'undefined') {
      localStorage.setItem(GUEST_WISHLIST_KEY, JSON.stringify(normalized));
    }
    set({ guestWishlistIds: normalized, guestWishlistHydrated: true });
  },
}));

export function clearStoredGuestWishlist() {
  if (typeof window !== 'undefined') localStorage.removeItem(GUEST_WISHLIST_KEY);
  useStorefrontUiStore.setState({ guestWishlistIds: [], guestWishlistHydrated: true });
}
