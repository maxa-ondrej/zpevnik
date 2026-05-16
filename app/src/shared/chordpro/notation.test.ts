import { describe, expect, test } from 'vitest';

import { render, toCzech, toEnglish } from './notation';

describe('toCzech', () => {
  test('English B becomes Czech H', () => {
    expect(toCzech('B')).toBe('H');
    expect(toCzech('Bm7')).toBe('Hm7');
  });

  test('English Bb becomes Czech B', () => {
    expect(toCzech('Bb')).toBe('B');
    expect(toCzech('Bbmaj7')).toBe('Bmaj7');
  });

  test('other roots pass through', () => {
    expect(toCzech('C')).toBe('C');
    expect(toCzech('F#m')).toBe('F#m');
    expect(toCzech('A')).toBe('A');
  });
});

describe('toEnglish', () => {
  test('Czech H becomes English B', () => {
    expect(toEnglish('H')).toBe('B');
    expect(toEnglish('Hm7')).toBe('Bm7');
  });

  test('Czech B becomes English Bb', () => {
    expect(toEnglish('B')).toBe('Bb');
    expect(toEnglish('Bmaj7')).toBe('Bbmaj7');
  });

  test('roundtrip Czech→English→Czech is stable', () => {
    for (const c of ['H', 'B', 'Hm7', 'Bmaj7', 'C', 'F#m', 'A7sus4']) {
      expect(toCzech(toEnglish(c))).toBe(c);
    }
  });
});

describe('render', () => {
  test('en mode normalizes Czech input to English', () => {
    expect(render('H', 'en')).toBe('B');
  });

  test('cs mode renders canonical English in Czech', () => {
    expect(render('B', 'cs')).toBe('H');
    expect(render('Bb', 'cs')).toBe('B');
  });
});
