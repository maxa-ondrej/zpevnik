/**
 * Favorited song ids, persisted locally.
 *
 * Stored as an array (not a Set) for JSON-safe persistence. `has(id)` is
 * O(n) over the list — fine for the realistic upper bound (a few
 * hundred favorites).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export interface FavoritesState {
  favorites: string[];
  toggle: (id: string) => void;
  has: (id: string) => boolean;
  clear: () => void;
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function resolveStorage(): StateStorage {
  if (Platform.OS === 'web') {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls ?? noopStorage;
  }
  return AsyncStorage;
}

export const useFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      toggle: (id) =>
        set((state) => {
          const idx = state.favorites.indexOf(id);
          if (idx >= 0) {
            return { favorites: state.favorites.filter((f) => f !== id) };
          }
          return { favorites: [...state.favorites, id] };
        }),
      has: (id) => get().favorites.includes(id),
      clear: () => set({ favorites: [] }),
    }),
    {
      name: 'zpevnik-favorites',
      storage: createJSONStorage(() => resolveStorage()),
      partialize: (s) => ({ favorites: s.favorites }),
    },
  ),
);
