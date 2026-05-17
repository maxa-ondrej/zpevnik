import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { RECENTS_CAP, useRecents } from './recents';

function reset() {
  useRecents.setState({ recents: [] });
}

describe('useRecents', () => {
  afterEach(reset);

  test('mark prepends an id to the front of the list', () => {
    const { result } = renderHook(() => useRecents());
    act(() => result.current.mark('001'));
    expect(result.current.recents).toEqual(['001']);

    act(() => result.current.mark('002'));
    expect(result.current.recents).toEqual(['002', '001']);
  });

  test('marking an already-recent id moves it to the front (no duplicates)', () => {
    const { result } = renderHook(() => useRecents());
    act(() => {
      result.current.mark('001');
      result.current.mark('002');
      result.current.mark('003');
      // Re-mark 001 — should hop to the front, not duplicate.
      result.current.mark('001');
    });
    expect(result.current.recents).toEqual(['001', '003', '002']);
  });

  test('caps the list to RECENTS_CAP entries', () => {
    const { result } = renderHook(() => useRecents());
    act(() => {
      for (let i = 0; i < RECENTS_CAP + 5; i++) {
        result.current.mark(`s${i}`);
      }
    });
    expect(result.current.recents.length).toBe(RECENTS_CAP);
    // The MOST recent is the last one we marked; the OLDEST kept is
    // RECENTS_CAP-1 back from there.
    expect(result.current.recents[0]).toBe(`s${RECENTS_CAP + 4}`);
    expect(result.current.recents[RECENTS_CAP - 1]).toBe(`s5`);
  });

  test('clear empties the list', () => {
    const { result } = renderHook(() => useRecents());
    act(() => {
      result.current.mark('001');
      result.current.mark('002');
      result.current.clear();
    });
    expect(result.current.recents).toEqual([]);
  });
});
