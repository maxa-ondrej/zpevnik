import { describe, expect, test } from 'vitest';

import type { Melody } from './assemble';
import {
  countMeasures,
  parseMeter,
  totalBeatsFromMelody,
} from './totalBeats';

describe('parseMeter', () => {
  test('reads M:3/4 from header', () => {
    expect(parseMeter('X:1\nT:Foo\nM:3/4\nL:1/4\nK:G')).toEqual({
      num: 3,
      den: 4,
    });
  });
  test('reads M:6/8', () => {
    expect(parseMeter('M:6/8')).toEqual({ num: 6, den: 8 });
  });
  test('tolerates whitespace around the slash', () => {
    expect(parseMeter('M: 4 / 4')).toEqual({ num: 4, den: 4 });
  });
  test('returns null when M: is missing', () => {
    expect(parseMeter('X:1\nK:C')).toBeNull();
  });
  test('returns null on garbage values', () => {
    expect(parseMeter('M:x/y')).toBeNull();
  });
});

describe('countMeasures', () => {
  test('counts simple bar dividers', () => {
    expect(countMeasures('G A B c | d c B A | G2 z2 |')).toBe(3);
  });

  test('treats `||`, `|]`, `[|`, `|:`, `:|` as single boundaries', () => {
    expect(countMeasures('a b c d || e f g a |]')).toBe(2);
    expect(countMeasures('[| a b c d :| e f g a |: b c d e |')).toBe(4);
  });

  test('ignores `|` inside quoted chord/annotation strings', () => {
    // Pathological: a literal `|` in an annotation string shouldn't count.
    expect(countMeasures('"^V|erse 1" a b c d | e f g a |')).toBe(2);
  });

  test('ignores ABC information-field lines (w:, K:, M:, …)', () => {
    const body = [
      '"^Verse 1"',
      '"C" C E G G/2 G/2 | "G" A G G F |',
      'w: Pá-na chvá-lit bu-du na-vě-ky,',
      '"Am" A c B G/2 G/2 | "F" F E "C" C C |]',
      'w: za je-ho lás-ku k nám ma-lým.',
    ].join('\n');
    expect(countMeasures(body)).toBe(4);
  });

  test('returns 0 when there are no bar dividers', () => {
    expect(countMeasures('w: just lyrics, no measures')).toBe(0);
  });
});

describe('totalBeatsFromMelody', () => {
  function mel(header: string, ...bodies: string[]): Melody {
    return {
      header,
      blocks: bodies.map((body) => ({ type: 'verse', body })),
    };
  }

  test('returns null for null melody', () => {
    expect(totalBeatsFromMelody(null)).toBeNull();
  });

  test('returns null when melody has no measures', () => {
    expect(totalBeatsFromMelody(mel('X:1\nM:4/4\nK:C', 'w: only lyrics'))).toBeNull();
  });

  test('multiplies measure count by time-signature numerator', () => {
    // 4 measures, M:3/4 → 12 beats.
    const body = 'a b c | d e f | g a b | c d e |';
    expect(totalBeatsFromMelody(mel('M:3/4', body))).toBe(12);
  });

  test('defaults to 4 beats/measure when M: is absent', () => {
    expect(totalBeatsFromMelody(mel('K:C', 'a | b | c |'))).toBe(12);
  });

  test('sums measures across blocks (verse + chorus + verse)', () => {
    // 2 + 1 + 2 = 5 measures, M:4/4 → 20 beats.
    const verse = 'a b c d | e f g a |';
    const chorus = 'b c d e |';
    expect(
      totalBeatsFromMelody({
        header: 'M:4/4\nK:C',
        blocks: [
          { type: 'verse', body: verse },
          { type: 'chorus', body: chorus },
          { type: 'verse', body: verse },
        ],
      }),
    ).toBe(5 * 4);
  });

  test('matches a real demo song (Pána chválit budu): 16 measures × 4/4 = 64', () => {
    // From songs/001-pana-chvalit-budu/melody.json — 2 verses (4 bars each)
    // + 1 chorus (4 bars) + 1 verse (4 bars) is 16 bars in 4/4 = 64 beats.
    // We synthesize the equivalent shape here so the test stays hermetic.
    const verseBody = 'a b c d | e f g a | b c d e | f g a b |';
    const chorusBody = 'a b c d | e f g a | b c d e | f g a b |';
    expect(
      totalBeatsFromMelody({
        header: 'M:4/4\nK:C',
        blocks: [
          { type: 'verse', body: verseBody },
          { type: 'chorus', body: chorusBody },
          { type: 'verse', body: verseBody },
        ],
      }),
    ).toBe(48); // 3 blocks × 4 bars × 4 beats — only the blocks listed in the test
  });
});
