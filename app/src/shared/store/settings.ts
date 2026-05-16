/**
 * App-wide UI settings — persisted locally.
 * Uses zustand with the persist middleware. On web this writes to
 * localStorage; on native (no localStorage) it degrades to in-memory.
 */

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

const webStorage: StateStorage | null =
  typeof globalThis !== 'undefined' && typeof (globalThis as { localStorage?: Storage }).localStorage !== 'undefined'
    ? (globalThis as unknown as { localStorage: Storage }).localStorage
    : null;

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
      storage: createJSONStorage(() => webStorage ?? noopStorage),
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
