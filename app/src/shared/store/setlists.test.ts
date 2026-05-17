import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { useSetlists } from './setlists';

function reset() {
  useSetlists.setState({ setlists: [] });
}

describe('useSetlists', () => {
  afterEach(reset);

  test('create appends a setlist with name + empty songs', () => {
    const { result } = renderHook(() => useSetlists());
    let id = '';
    act(() => {
      id = result.current.create('Sunday morning');
    });
    expect(result.current.setlists).toHaveLength(1);
    expect(result.current.setlists[0]?.name).toBe('Sunday morning');
    expect(result.current.setlists[0]?.songIds).toEqual([]);
    expect(result.current.setlists[0]?.id).toBe(id);
  });

  test('create falls back to "Untitled" on blank name', () => {
    const { result } = renderHook(() => useSetlists());
    act(() => result.current.create('   '));
    expect(result.current.setlists[0]?.name).toBe('Untitled');
  });

  test('addSong appends a song id, ignoring duplicates', () => {
    const { result } = renderHook(() => useSetlists());
    let id = '';
    act(() => {
      id = result.current.create('test');
      result.current.addSong(id, '001');
      result.current.addSong(id, '002');
      result.current.addSong(id, '001'); // dup — should not appear twice
    });
    expect(result.current.setlists[0]?.songIds).toEqual(['001', '002']);
  });

  test('removeSong drops the song from the list', () => {
    const { result } = renderHook(() => useSetlists());
    let id = '';
    act(() => {
      id = result.current.create('test');
      result.current.addSong(id, '001');
      result.current.addSong(id, '002');
      result.current.removeSong(id, '001');
    });
    expect(result.current.setlists[0]?.songIds).toEqual(['002']);
  });

  test('moveSong reorders within bounds; out-of-bounds is a no-op', () => {
    const { result } = renderHook(() => useSetlists());
    let id = '';
    act(() => {
      id = result.current.create('test');
      ['001', '002', '003', '004'].forEach((s) => result.current.addSong(id, s));
      result.current.moveSong(id, 0, 2); // 001 → after 003
    });
    expect(result.current.setlists[0]?.songIds).toEqual(['002', '003', '001', '004']);

    act(() => {
      result.current.moveSong(id, 99, 0); // out of bounds
    });
    // Unchanged
    expect(result.current.setlists[0]?.songIds).toEqual(['002', '003', '001', '004']);
  });

  test('rename trims whitespace and falls back to old name on blank', () => {
    const { result } = renderHook(() => useSetlists());
    let id = '';
    act(() => {
      id = result.current.create('Original');
      result.current.rename(id, '  Renamed  ');
    });
    expect(result.current.setlists[0]?.name).toBe('Renamed');

    act(() => {
      result.current.rename(id, '   ');
    });
    expect(result.current.setlists[0]?.name).toBe('Renamed');
  });

  test('remove drops a setlist by id', () => {
    const { result } = renderHook(() => useSetlists());
    let id1 = '';
    let id2 = '';
    act(() => {
      id1 = result.current.create('a');
      id2 = result.current.create('b');
      result.current.remove(id1);
    });
    expect(result.current.setlists).toHaveLength(1);
    expect(result.current.setlists[0]?.id).toBe(id2);
  });

  test('updatedAt bumps on every mutation but createdAt does not', async () => {
    const { result } = renderHook(() => useSetlists());
    let id = '';
    act(() => {
      id = result.current.create('test');
    });
    const createdAt = result.current.setlists[0]?.createdAt ?? 0;
    const initialUpdatedAt = result.current.setlists[0]?.updatedAt ?? 0;

    // Wait at least 2 ms so Date.now() advances.
    await new Promise((r) => setTimeout(r, 2));
    act(() => result.current.addSong(id, '001'));

    expect(result.current.setlists[0]?.createdAt).toBe(createdAt);
    expect(result.current.setlists[0]?.updatedAt).toBeGreaterThan(initialUpdatedAt);
  });
});
