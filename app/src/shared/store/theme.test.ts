/**
 * Tests for `useTheme()`.
 *
 * We don't try to mock `useColorScheme` here — under vitest+jsdom it returns
 * `null`, which our hook treats as 'light'. That's enough to pin the
 * light/dark/system branches; the only branch we can't exercise from the
 * jsdom side is "system === dark" (no MediaQueryList in jsdom).
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { useSettings } from './settings';
import { useTheme } from './theme';

function resetSettings() {
  useSettings.setState({
    notation: 'cs',
    transpose: 0,
    capo: 0,
    fontSize: 16,
    lineSpacing: 1.4,
    darkMode: 'system',
    viewMode: 'staves',
    autoScrollSpeed: 30,
  });
}

describe('useTheme', () => {
  afterEach(() => {
    resetSettings();
  });

  test('darkMode=light → light palette', () => {
    act(() => useSettings.setState({ darkMode: 'light' }));
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(false);
    expect(result.current.bg).toBe('#ffffff');
  });

  test('darkMode=dark → dark palette', () => {
    act(() => useSettings.setState({ darkMode: 'dark' }));
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(true);
    expect(result.current.bg).toBe('#121212');
  });

  test('darkMode=system falls back to light under jsdom (no MediaQuery)', () => {
    act(() => useSettings.setState({ darkMode: 'system' }));
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(false);
  });

  test('changing darkMode re-renders the theme', () => {
    act(() => useSettings.setState({ darkMode: 'light' }));
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(false);

    act(() => useSettings.setState({ darkMode: 'dark' }));
    expect(result.current.isDark).toBe(true);
  });
});
