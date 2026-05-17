/**
 * Lyric extraction for full-text search.
 *
 * The reader's song list filters on title + number from index.json. For
 * the spec's "search across full-text lyrics," we need the raw lyric
 * text — which lives in each song's .cho and isn't in the index.
 *
 * `extractLyrics()` flattens a parsed ChordPro song into a single
 * lowercase, diacritic-folded string suitable for substring matching.
 * Czech lyrics often syllabify across hyphens (`Pá-na chvá-lit`); we
 * strip those hyphens so the search query "pana" still matches.
 */

import type { ParsedSong } from '../chordpro/parser';
import { fold } from './fold';

export function extractLyrics(song: ParsedSong): string {
  const text = song.lines
    .flatMap((line) => line.segments.map((seg) => seg.text))
    .join(' ');
  // Syllable hyphenation: collapse `-` between letters into nothing so
  // hyphenated tokens become whole words again.
  const rejoined = text.replace(/(\p{L})-(\p{L})/gu, '$1$2');
  // Segments often carry trailing spaces ("Hello " + "world" → joined with
  // another space → "Hello  world"). Collapse to a single space.
  return fold(rejoined).replace(/\s+/g, ' ').trim();
}
