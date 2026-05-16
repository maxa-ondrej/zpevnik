/**
 * App-wide UI settings — persisted locally.
 * Uses zustand with the persist middleware. localStorage on web,
 * AsyncStorage on native; both back the same JSON schema.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import type { Notation } from '../chordpro/notation';

export interface SettingsState {
  notation: Notation;
  transpose: number;
  capo: number;
  fontSize: number;
  lineSpacing: number;
  darkMode: 'light' | 'dark' | 'system';
  showStaves: boolean;
  autoScrollSpeed: number;
  setNotation: (n: Notation) => void;
  setTranspose: (n: number) => void;
  setCapo: (n: number) => void;
  setFontSize: (n: number) => void;
  setLineSpacing: (n: number) => void;
  setDarkMode: (m: 'light' | 'dark' | 'system') => void;
  setShowStaves: (b: boolean) => void;
  setAutoScrollSpeed: (n: number) => void;
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

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      notation: 'cs',
      transpose: 0,
      capo: 0,
      fontSize: 16,
      lineSpacing: 1.4,
      darkMode: 'system',
      showStaves: true,
      autoScrollSpeed: 1,
      setNotation: (notation) => set({ notation }),
      setTranspose: (transpose) => set({ transpose }),
      setCapo: (capo) => set({ capo }),
      setFontSize: (fontSize) => set({ fontSize }),
      setLineSpacing: (lineSpacing) => set({ lineSpacing }),
      setDarkMode: (darkMode) => set({ darkMode }),
      setShowStaves: (showStaves) => set({ showStaves }),
      setAutoScrollSpeed: (autoScrollSpeed) => set({ autoScrollSpeed }),
    }),
    {
      name: 'zpevnik-settings',
      storage: createJSONStorage(() => resolveStorage()),
      partialize: (s) => ({
        notation: s.notation,
        transpose: s.transpose,
        capo: s.capo,
        fontSize: s.fontSize,
        lineSpacing: s.lineSpacing,
        darkMode: s.darkMode,
        showStaves: s.showStaves,
        autoScrollSpeed: s.autoScrollSpeed,
      }),
    },
  ),
);
