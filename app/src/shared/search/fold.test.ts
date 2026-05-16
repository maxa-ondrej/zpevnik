import { describe, expect, test } from 'vitest';

import { fold, matches } from './fold';

describe('fold', () => {
  test('strips Czech diacritics', () => {
    expect(fold('Pána chválit budu')).toBe('pana chvalit budu');
    expect(fold('Hospodin je můj pastýř')).toBe('hospodin je muj pastyr');
  });

  test('lowercases ASCII', () => {
    expect(fold('Hello WORLD')).toBe('hello world');
  });

  test('idempotent on already-folded input', () => {
    expect(fold(fold('Bože náš'))).toBe(fold('Bože náš'));
  });
});

describe('matches', () => {
  test('case- and diacritic-insensitive substring', () => {
    expect(matches('Pána chválit budu', 'pana')).toBe(true);
    expect(matches('Pána chválit budu', 'CHVAL')).toBe(true);
  });

  test('empty needle matches everything', () => {
    expect(matches('anything', '')).toBe(true);
    expect(matches('anything', '   ')).toBe(true);
  });

  test('miss when token absent', () => {
    expect(matches('Pána chválit budu', 'aleluja')).toBe(false);
  });
});
