import { describe, expect, test } from 'vitest';

import { normalizeText, tokenize } from './normalize';

describe('normalizeText', () => {
  test('lowercases', () => {
    expect(normalizeText('ABBA Otče')).toBe('abba otce');
  });

  test('strips Czech diacritics', () => {
    expect(normalizeText('Jen Ty, Páně můj')).toBe('jen ty pane muj');
  });

  test('collapses punctuation to spaces', () => {
    expect(normalizeText('hallelujah,  amen!')).toBe('hallelujah amen');
  });

  test('empty input returns empty string', () => {
    expect(normalizeText('')).toBe('');
  });

  test('numbers are preserved', () => {
    expect(normalizeText('zalm 23')).toBe('zalm 23');
  });
});

describe('tokenize', () => {
  test('splits on whitespace', () => {
    expect(tokenize('Pane, smiluj se nad námi')).toEqual([
      'pane',
      'smiluj',
      'se',
      'nad',
      'nami',
    ]);
    // 'se' is 2 chars — kept; single-char tokens dropped.
  });

  test('drops single-character tokens (e.g. recognizer noise)', () => {
    expect(tokenize('a a a Pane')).toEqual(['pane']);
  });

  test('handles diacritic-only differences', () => {
    expect(tokenize('Jen Ty Páně')).toEqual(tokenize('jen ty pane'));
  });

  test('empty input yields empty array', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });
});
