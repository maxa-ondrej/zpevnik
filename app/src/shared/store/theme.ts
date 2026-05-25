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

import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';

import { useSettings } from './settings';

// Cross-platform "is the system in dark mode?" hook.
// Replaces `useColorScheme()` because RN-web's implementation has been
// observed returning 'light' even when the OS prefers dark (likely a
// hydration-timing quirk in the static export). Subscribing to
// `Appearance` directly with an explicit listener works reliably on
// both web (which reads matchMedia) and native.
function useSystemColorScheme(): 'light' | 'dark' {
  const [scheme, setScheme] = useState<'light' | 'dark'>(() => {
    const initial = Appearance.getColorScheme();
    return initial === 'dark' ? 'dark' : 'light';
  });
  useEffect(() => {
    // Snap to whatever Appearance reports NOW — guards against a stale
    // initial value if `getColorScheme()` returned null during the
    // first render (SSR or pre-hydration).
    const current = Appearance.getColorScheme();
    setScheme(current === 'dark' ? 'dark' : 'light');
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
  }, []);
  return scheme;
}

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
  /** Tinted background derived from `accent`; used for soft highlights
   *  (play-mode line, etc.). Readable text on top should be `text`. */
  accentBg: string;
  accentText: string;
  danger: string;
  inputBg: string;
  /** Semi-transparent overlay color for modal scrims and tap-outside
   *  pressables. Dark-mode value uses a heavier alpha so the scrim is
   *  still visibly darker than the already-dark bg behind it. */
  backdrop: string;
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
  accentBg: '#e6f5ee',
  accentText: '#ffffff',
  danger: '#a00',
  inputBg: '#ffffff',
  backdrop: 'rgba(0,0,0,0.35)',
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
  accentBg: '#163026',
  accentText: '#0a1f17',
  danger: '#ff8b8b',
  inputBg: '#1c1c1c',
  backdrop: 'rgba(0,0,0,0.55)',
};

export function useTheme(): Theme {
  const setting = useSettings((s) => s.darkMode);
  const systemScheme = useSystemColorScheme();
  const effective: 'light' | 'dark' =
    setting === 'system' ? systemScheme : setting;
  return effective === 'dark' ? DARK : LIGHT;
}
