/**
 * Recently-viewed song ids, persisted locally.
 *
 * Tracks the last N song ids opened (most recent first). `mark(id)` is
 * called from the detail screen on mount; the list screen reads
 * `recents` to render a "Recently viewed" section.
 *
 * Stored separately from the main settings store: settings are user
 * preferences ("how do I want things to look"), recents is activity
 * data. Keeping them apart means clearing recents (when we add a UI for
 * it) doesn't risk touching preferences.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export const RECENTS_CAP = 10;

export interface RecentsState {
  recents: string[];
  mark: (id: string) => void;
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

export const useRecents = create<RecentsState>()(
  persist(
    (set) => ({
      recents: [],
      mark: (id) =>
        set((state) => {
          const without = state.recents.filter((r) => r !== id);
          return { recents: [id, ...without].slice(0, RECENTS_CAP) };
        }),
      clear: () => set({ recents: [] }),
    }),
    {
      name: 'zpevnik-recents',
      storage: createJSONStorage(() => resolveStorage()),
      partialize: (s) => ({ recents: s.recents }),
    },
  ),
);
