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

/**
 * Song-detail view modes.
 *   karaoke — three-line "current phrase + neighbors" focus view
 *   staves  — abcjs staff notation (the original default)
 *   lyrics  — full chord chart (ChordPro text + chords)
 */
export type ViewMode = 'karaoke' | 'staves' | 'lyrics';

export interface SettingsState {
  notation: Notation;
  transpose: number;
  capo: number;
  fontSize: number;
  lineSpacing: number;
  darkMode: 'light' | 'dark' | 'system';
  viewMode: ViewMode;
  autoScrollSpeed: number;
  setNotation: (n: Notation) => void;
  setTranspose: (n: number) => void;
  setCapo: (n: number) => void;
  setFontSize: (n: number) => void;
  setLineSpacing: (n: number) => void;
  setDarkMode: (m: 'light' | 'dark' | 'system') => void;
  setViewMode: (m: ViewMode) => void;
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
      viewMode: 'karaoke',
      autoScrollSpeed: 30,
      setNotation: (notation) => set({ notation }),
      setTranspose: (transpose) => set({ transpose }),
      setCapo: (capo) => set({ capo }),
      setFontSize: (fontSize) => set({ fontSize }),
      setLineSpacing: (lineSpacing) => set({ lineSpacing }),
      setDarkMode: (darkMode) => set({ darkMode }),
      setViewMode: (viewMode) => set({ viewMode }),
      setAutoScrollSpeed: (autoScrollSpeed) => set({ autoScrollSpeed }),
    }),
    {
      name: 'zpevnik-settings',
      version: 2,
      // v1 → v2: split `showStaves: boolean` into `viewMode`.
      // true → 'staves' (the old default); false → 'lyrics'.
      // Karaoke is the NEW default for first-time installs.
      migrate: (persisted: unknown, fromVersion: number) => {
        if (fromVersion < 2 && persisted && typeof persisted === 'object') {
          const p = persisted as Record<string, unknown>;
          if ('showStaves' in p && typeof p.showStaves === 'boolean') {
            p.viewMode = p.showStaves ? 'staves' : 'lyrics';
            delete p.showStaves;
          }
        }
        return persisted as Partial<SettingsState>;
      },
      storage: createJSONStorage(() => resolveStorage()),
      partialize: (s) => ({
        notation: s.notation,
        transpose: s.transpose,
        capo: s.capo,
        fontSize: s.fontSize,
        lineSpacing: s.lineSpacing,
        darkMode: s.darkMode,
        viewMode: s.viewMode,
        autoScrollSpeed: s.autoScrollSpeed,
      }),
    },
  ),
);
