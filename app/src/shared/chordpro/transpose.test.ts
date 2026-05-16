import { describe, expect, test } from 'vitest';

import { transposeChord } from './transpose';

describe('transposeChord', () => {
  test('zero semitones is identity', () => {
    expect(transposeChord('Am7', 0)).toBe('Am7');
  });

  test('shifts root up by N semitones', () => {
    expect(transposeChord('C', 2)).toBe('D');
    expect(transposeChord('C', 7)).toBe('G');
  });

  test('wraps around 12 semitones', () => {
    expect(transposeChord('B', 1)).toBe('C');
    expect(transposeChord('C', -1)).toBe('B');
  });

  test('preserves suffix verbatim', () => {
    expect(transposeChord('Cmaj7sus4', 2)).toBe('Dmaj7sus4');
    expect(transposeChord('Am7', 3)).toBe('Cm7');
  });

  test('normalizes flats to sharps before shifting', () => {
    expect(transposeChord('Bb', 1)).toBe('B');
    expect(transposeChord('Eb', 0)).toBe('Eb'); // identity short-circuits, no normalization
    expect(transposeChord('Eb', 1)).toBe('E');
  });

  test('shifts slash-bass independently', () => {
    expect(transposeChord('G/B', 2)).toBe('A/C#');
    expect(transposeChord('C/E', 5)).toBe('F/A');
  });

  test('non-chord garbage returns unchanged', () => {
    expect(transposeChord('???', 3)).toBe('???');
  });
});
