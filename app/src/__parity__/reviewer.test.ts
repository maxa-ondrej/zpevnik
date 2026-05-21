/**
 * Reviewer JS ↔ app TS parity tests.
 *
 * The reviewer (`pipeline/zpevnik_pipeline/review/static/*.js`) ships
 * hand-ported plain-JS copies of the app's TypeScript modules so the
 * static review UI can run them in the browser without a build step.
 * The HANDOVER's "keep in sync" gotcha is now a test: if either side
 * drifts on a chord transform, a notation rename, a ChordPro section
 * boundary, or an assemble formatter, this fails loudly.
 *
 * What we lock down (function-pair → input battery):
 *   toCzech / toEnglish        — root letters, sharps/flats, suffixes,
 *                                slash bass, garbage input.
 *   transposeChord             — chord battery × representative semitones
 *                                including negatives, wrap-around, 0.
 *   parseChordPro              — directives, inline chords, blank lines,
 *                                multi-section markers, comments.
 *   assembleAbc                — empty, single block, V-C-V order,
 *                                whitespace trimming.
 *
 * Not covered (intentional):
 *   chord.js's `renderNotation` and `transformChord` are pure
 *   compositions of the functions above; if those pass, the wrappers
 *   pass too.
 */

import { describe, expect, test } from 'vitest';

// --- TS side ----------------------------------------------------------
import {
  toCzech as tsToCzech,
  toEnglish as tsToEnglish,
} from '../shared/chordpro/notation';
import { transposeChord as tsTransposeChord } from '../shared/chordpro/transpose';
import { parseChordPro as tsParseChordPro } from '../shared/chordpro/parser';
import { assembleAbc as tsAssembleAbc, type Melody } from '../shared/melody/assemble';

// --- JS side (reviewer runtime) --------------------------------------
// These resolve to plain-JS modules; TS treats their exports as `any`
// which is exactly what we want — the assertions compare against the
// strongly-typed TS implementation.
import {
  toCzech as jsToCzech,
  toEnglish as jsToEnglish,
  transposeChord as jsTransposeChord,
} from '../../../pipeline/zpevnik_pipeline/review/static/chord.js';
import { parseChordPro as jsParseChordPro } from '../../../pipeline/zpevnik_pipeline/review/static/chordpro.js';
import { assembleAbc as jsAssembleAbc } from '../../../pipeline/zpevnik_pipeline/review/static/assemble.js';

const CHORD_BATTERY = [
  // Plain roots — every degree, including the Czech-sensitive B/H.
  'C', 'D', 'E', 'F', 'G', 'A', 'B', 'H',
  // Sharps + flats.
  'C#', 'D#', 'F#', 'G#', 'A#', 'Db', 'Eb', 'Gb', 'Ab', 'Bb',
  // Suffixes.
  'Am', 'Dm', 'Em', 'G7', 'Cmaj7', 'F#m7', 'Bbsus4', 'Asus2', 'Adim',
  // Slash bass.
  'C/E', 'D/F#', 'G/B', 'Bb/D',
  // Garbage / no-op.
  '', 'X', 'lol', '   ',
];

const SEMITONE_BATTERY = [-12, -7, -3, -1, 0, 1, 3, 5, 7, 11, 12, 24];

const CHORDPRO_BATTERY: string[] = [
  '',
  'Just lyrics no chords',
  '[G]Hello [C]world',
  '{title: A}\n[G]hi',
  '{soc}\n[D]chorus line\n{eoc}',
  '{sob}\n[A]bridge[B]line\n{eob}',
  // Multi-section + blanks + comments.
  '{title: Test}\n[C]Verse line\n\n{soc}\n[F]chorus\n{eoc}\n\n[G]Another verse',
  // Edge: chord with no lyric trailing
  '[Am]',
  // Edge: directive only
  '{tempo: 120}',
];

const MELODY_BATTERY: Melody[] = [
  { header: '', blocks: [] },
  { header: 'X:1\nK:C', blocks: [] },
  {
    header: '  X:1\nK:G  ',
    blocks: [{ type: 'verse', body: ' "G" GAB | "D" cBA |\n' }],
  },
  {
    header: 'X:1\nT:Foo\nM:4/4\nK:C',
    blocks: [
      { type: 'verse', body: '"C" C D E F |' },
      { type: 'chorus', body: '"G" G A B c |' },
      { type: 'verse', body: '"F" F E D C |' },
    ],
  },
];

describe('reviewer parity — notation (toCzech / toEnglish)', () => {
  test.each(CHORD_BATTERY)('toCzech(%s) matches', (chord) => {
    expect(jsToCzech(chord)).toBe(tsToCzech(chord));
  });

  test.each(CHORD_BATTERY)('toEnglish(%s) matches', (chord) => {
    expect(jsToEnglish(chord)).toBe(tsToEnglish(chord));
  });
});

describe('reviewer parity — transposeChord', () => {
  for (const chord of CHORD_BATTERY) {
    for (const semis of SEMITONE_BATTERY) {
      test(`transposeChord(${JSON.stringify(chord)}, ${semis})`, () => {
        expect(jsTransposeChord(chord, semis)).toBe(
          tsTransposeChord(chord, semis),
        );
      });
    }
  }
});

describe('reviewer parity — parseChordPro', () => {
  test.each(CHORDPRO_BATTERY.map((s, i) => [i, s] as const))(
    'parseChordPro case #%i',
    (_i, source) => {
      // Deep-equal: both sides should produce structurally identical
      // ParsedSong trees. If either side renames a field or adds a
      // property, this fails loudly.
      expect(jsParseChordPro(source)).toEqual(tsParseChordPro(source));
    },
  );
});

describe('reviewer parity — assembleAbc', () => {
  test.each(MELODY_BATTERY.map((m, i) => [i, m] as const))(
    'assembleAbc case #%i',
    (_i, melody) => {
      expect(jsAssembleAbc(melody)).toBe(tsAssembleAbc(melody));
    },
  );
});
