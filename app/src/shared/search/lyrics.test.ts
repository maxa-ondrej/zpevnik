import { describe, expect, test } from 'vitest';

import { parseChordPro } from '../chordpro/parser';
import { extractLyrics } from './lyrics';

describe('extractLyrics', () => {
  test('returns lyric text with chords stripped', () => {
    const song = parseChordPro('[C]Hello [G]world');
    expect(extractLyrics(song)).toBe('hello world');
  });

  test('folds diacritics so Czech queries are case- and accent-insensitive', () => {
    const song = parseChordPro('Pána chválit budu');
    const lyrics = extractLyrics(song);
    expect(lyrics).toContain('pana');
    expect(lyrics).toContain('chvalit');
  });

  test('rejoins hyphen-syllabified words', () => {
    const song = parseChordPro('Pá-na chvá-lit bu-du');
    const lyrics = extractLyrics(song);
    // After hyphen-collapse: "pana chvalit budu" (after folding).
    expect(lyrics).toContain('pana');
    expect(lyrics).toContain('chvalit');
    expect(lyrics).toContain('budu');
    // The hyphenated form itself should NOT appear — a search for
    // "pá-na" or "pa-na" would otherwise spuriously match.
    expect(lyrics).not.toContain('-');
  });

  test('joins multiple lines into one searchable blob', () => {
    const song = parseChordPro('Line one\nLine two\nLine three');
    expect(extractLyrics(song)).toContain('line one');
    expect(extractLyrics(song)).toContain('line two');
    expect(extractLyrics(song)).toContain('line three');
  });

  test('ignores ChordPro directives', () => {
    const song = parseChordPro(
      '{title: Test Song}\n{start_of_verse}\n[C]Hello\n{end_of_verse}',
    );
    const lyrics = extractLyrics(song);
    expect(lyrics).toContain('hello');
    // Directives don't survive parsing into segments, so 'test' / 'verse'
    // shouldn't show up.
    expect(lyrics).not.toContain('start_of_verse');
    expect(lyrics).not.toContain('title');
  });
});
