/**
 * App-wide UI settings — persisted locally.
 * Uses zustand with manual persistence (cross-platform: AsyncStorage on
 * native, localStorage on web; both can be wired up in `app/_layout.tsx`).
 */

import { create } from 'zustand';

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

export const useSettings = create<SettingsState>((set) => ({
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
}));
