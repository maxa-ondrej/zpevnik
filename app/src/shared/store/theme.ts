/**
 * Theme resolution for the reader.
 *
 * The `darkMode` setting is tri-state (`light` | `dark` | `system`). For
 * `system`, we read RN's `useColorScheme()` — null/undefined (vitest+jsdom,
 * SSR, or web before a user preference is detectable) falls through to
 * `light`.
 *
 * Colors stay flat and semantic (`bg`, `text`, `accent`, …) so each
 * component can opt in to whichever colors it actually needs.
 */

import { useColorScheme } from 'react-native';

import { useSettings } from './settings';

export interface Theme {
  isDark: boolean;
  bg: string;
  bgAlt: string;
  text: string;
  textMuted: string;
  textDim: string;
  border: string;
  borderSoft: string;
  accent: string;
  accentText: string;
  danger: string;
  inputBg: string;
}

const LIGHT: Theme = {
  isDark: false,
  bg: '#ffffff',
  bgAlt: '#fafafa',
  text: '#1a1a1a',
  textMuted: '#666',
  textDim: '#999',
  border: '#ddd',
  borderSoft: '#eee',
  accent: '#0a6',
  accentText: '#ffffff',
  danger: '#a00',
  inputBg: '#ffffff',
};

const DARK: Theme = {
  isDark: true,
  bg: '#121212',
  bgAlt: '#1c1c1c',
  text: '#e8e8e8',
  textMuted: '#a0a0a0',
  textDim: '#777',
  border: '#333',
  borderSoft: '#222',
  accent: '#3dd498',
  accentText: '#0a1f17',
  danger: '#ff8b8b',
  inputBg: '#1c1c1c',
};

export function useTheme(): Theme {
  const setting = useSettings((s) => s.darkMode);
  const systemScheme = useColorScheme();
  const effective: 'light' | 'dark' =
    setting === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : setting;
  return effective === 'dark' ? DARK : LIGHT;
}
