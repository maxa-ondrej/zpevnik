import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { useFavorites } from './favorites';

function reset() {
  useFavorites.setState({ favorites: [] });
}

describe('useFavorites', () => {
  afterEach(reset);

  test('toggle adds an id when absent', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => result.current.toggle('001'));
    expect(result.current.favorites).toEqual(['001']);
    expect(result.current.has('001')).toBe(true);
  });

  test('toggle removes an id when present', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.toggle('001');
      result.current.toggle('001');
    });
    expect(result.current.favorites).toEqual([]);
    expect(result.current.has('001')).toBe(false);
  });

  test('toggling distinct ids accumulates them', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.toggle('001');
      result.current.toggle('002');
      result.current.toggle('003');
    });
    expect(result.current.favorites).toEqual(['001', '002', '003']);
  });

  test('has returns false for unknown ids', () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.has('nope')).toBe(false);
  });

  test('clear empties the favorites list', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => {
      result.current.toggle('001');
      result.current.toggle('002');
      result.current.clear();
    });
    expect(result.current.favorites).toEqual([]);
  });
});
