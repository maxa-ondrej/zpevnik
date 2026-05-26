import { describe, expect, test } from 'vitest';

import { parseChordPro } from '../chordpro/parser';

import { buildLineTokens, matchLine } from './matcher';
import { tokenize } from './normalize';

const SONG = parseChordPro(`
Jen Ty Pane můj jsi má skála
Tobě svěřuji svou cestu
Smiluj se nad námi a slyš
Hallelujah amen
`);

describe('buildLineTokens', () => {
  test('tokenises every line (incl. blank lines as empty arrays)', () => {
    const lt = buildLineTokens(SONG);
    expect(lt.length).toBe(SONG.lines.length);
    // First non-blank line.
    const firstNonBlank = lt.find((arr) => arr.length > 0);
    expect(firstNonBlank).toEqual(['jen', 'ty', 'pane', 'muj', 'jsi', 'ma', 'skala']);
  });
});

describe('matchLine', () => {
  // Skip blank lines — currentLine and result indices refer to the
  // ParsedSong.lines indices, including blank lines.
  const lt = buildLineTokens(SONG);
  const firstLineIdx = lt.findIndex((a) => a.length > 0);
  const secondLineIdx = lt.findIndex(
    (a, i) => i > firstLineIdx && a.length > 0,
  );

  test('returns null when no transcript tokens', () => {
    expect(matchLine(lt, [], firstLineIdx)).toBeNull();
  });

  test('returns null when nothing matches above threshold', () => {
    expect(matchLine(lt, tokenize('completely unrelated words'), firstLineIdx)).toBeNull();
  });

  test('matches the first lyric line on a partial transcript', () => {
    const recent = tokenize('jen ty pane');
    const m = matchLine(lt, recent, firstLineIdx);
    expect(m).not.toBeNull();
    expect(m!.lineIdx).toBe(firstLineIdx);
  });

  test('advances when transcript catches up to a later line', () => {
    const recent = tokenize('tobe sveruji svou cestu');
    const m = matchLine(lt, recent, firstLineIdx);
    expect(m).not.toBeNull();
    expect(m!.lineIdx).toBe(secondLineIdx);
  });

  test('respects lookahead window — distant lines are out of reach', () => {
    // currentLine=firstLineIdx, lookahead=1 → can't reach the 4th line.
    const last = lt.findIndex((a) => a.length > 0 && a.includes('hallelujah'));
    const recent = tokenize('hallelujah amen');
    const tight = matchLine(lt, recent, firstLineIdx, { lookahead: 1 });
    expect(tight).toBeNull();
    // With a generous window it does find it.
    const loose = matchLine(lt, recent, firstLineIdx, { lookahead: 20 });
    expect(loose).not.toBeNull();
    expect(loose!.lineIdx).toBe(last);
  });

  test('backward penalty favours staying put on ambiguous matches', () => {
    // "smiluj se" only appears in line 3. From currentLine = line 4, the
    // matcher could either stay or jump back. With the default backward
    // penalty it must still jump back (no candidate at currentLine).
    const lineWithSmiluj = lt.findIndex((a) => a.includes('smiluj'));
    const recent = tokenize('smiluj se nad nami');
    // currentLine just past the smiluj line.
    const fromAhead = matchLine(lt, recent, lineWithSmiluj + 2);
    expect(fromAhead).not.toBeNull();
    expect(fromAhead!.lineIdx).toBe(lineWithSmiluj);
  });

  test('diacritic-insensitive: ASCII transcript still matches Czech lyrics', () => {
    // Recognizer sometimes returns ASCII-folded output even for cs-CZ.
    const recent = tokenize('Pane muj jsi ma skala');
    const m = matchLine(lt, recent, 0, { lookahead: 20 });
    expect(m).not.toBeNull();
    expect(m!.lineIdx).toBe(firstLineIdx);
  });

  test('survives empty/blank lines in the song', () => {
    const songWithGaps = parseChordPro(`
line one alpha beta

line two gamma delta
`);
    const ltg = buildLineTokens(songWithGaps);
    const m = matchLine(ltg, tokenize('gamma delta'), 0, { lookahead: 20 });
    expect(m).not.toBeNull();
    expect(ltg[m!.lineIdx]).toContain('gamma');
  });
});
