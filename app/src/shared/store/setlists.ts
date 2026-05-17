/**
 * Setlists — local-only ordered collections of songs.
 *
 * A setlist has a stable id, a user-editable name, and an ordered list
 * of song ids. Persisted under its own storage key so the wipe-this-
 * store mental model doesn't entangle with settings/recents/favorites.
 *
 * Ids are generated client-side (timestamp + random suffix); there's no
 * server identity to worry about. Setlists carry createdAt/updatedAt
 * so the list view can sort by recency.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export interface Setlist {
  id: string;
  name: string;
  songIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SetlistsState {
  setlists: Setlist[];
  create: (name: string) => string;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  addSong: (setlistId: string, songId: string) => void;
  removeSong: (setlistId: string, songId: string) => void;
  moveSong: (setlistId: string, fromIdx: number, toIdx: number) => void;
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

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function bumpUpdated(s: Setlist): Setlist {
  return { ...s, updatedAt: Date.now() };
}

export const useSetlists = create<SetlistsState>()(
  persist(
    (set) => ({
      setlists: [],

      create: (name) => {
        const id = newId();
        const now = Date.now();
        set((state) => ({
          setlists: [
            ...state.setlists,
            { id, name: name.trim() || 'Untitled', songIds: [], createdAt: now, updatedAt: now },
          ],
        }));
        return id;
      },

      rename: (id, name) =>
        set((state) => ({
          setlists: state.setlists.map((s) =>
            s.id === id ? bumpUpdated({ ...s, name: name.trim() || s.name }) : s,
          ),
        })),

      remove: (id) =>
        set((state) => ({ setlists: state.setlists.filter((s) => s.id !== id) })),

      addSong: (setlistId, songId) =>
        set((state) => ({
          setlists: state.setlists.map((s) =>
            s.id === setlistId && !s.songIds.includes(songId)
              ? bumpUpdated({ ...s, songIds: [...s.songIds, songId] })
              : s,
          ),
        })),

      removeSong: (setlistId, songId) =>
        set((state) => ({
          setlists: state.setlists.map((s) =>
            s.id === setlistId
              ? bumpUpdated({ ...s, songIds: s.songIds.filter((id) => id !== songId) })
              : s,
          ),
        })),

      moveSong: (setlistId, fromIdx, toIdx) =>
        set((state) => ({
          setlists: state.setlists.map((s) => {
            if (s.id !== setlistId) return s;
            if (
              fromIdx === toIdx ||
              fromIdx < 0 ||
              toIdx < 0 ||
              fromIdx >= s.songIds.length ||
              toIdx >= s.songIds.length
            ) {
              return s;
            }
            const next = s.songIds.slice();
            const [moved] = next.splice(fromIdx, 1);
            if (moved !== undefined) next.splice(toIdx, 0, moved);
            return bumpUpdated({ ...s, songIds: next });
          }),
        })),

      clear: () => set({ setlists: [] }),
    }),
    {
      name: 'zpevnik-setlists',
      storage: createJSONStorage(() => resolveStorage()),
      partialize: (s) => ({ setlists: s.setlists }),
    },
  ),
);
