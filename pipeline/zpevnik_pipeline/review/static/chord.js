/**
 * Czech ↔ English notation + transpose, plain-JS port of
 * app/src/shared/chordpro/{notation,transpose}.ts.
 *
 * Storage is canonical English (A, B, C, …, Bb). The reviewer's
 * chord-chart preview can render in Czech (A, H, B for English A, B, Bb)
 * and at an arbitrary transpose offset, both purely visual — no edits.
 *
 * Keep in sync with the TS originals if either side grows new chord
 * suffixes or notation conventions.
 */

const CZECH_MAP = { Bb: 'B', B: 'H' };
const ENGLISH_MAP = { H: 'B', B: 'Bb' };
const NOTATION_ROOT_RE = /^([A-H][b#]?)(.*)$/;
const TRANSPOSE_ROOT_RE = /^([A-G][b#]?)(.*)$/;

const SEMITONES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];
const FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

export function toCzech(chord) {
  const m = chord.match(NOTATION_ROOT_RE);
  if (!m) return chord;
  return (CZECH_MAP[m[1]] ?? m[1]) + m[2];
}

export function toEnglish(chord) {
  const m = chord.match(NOTATION_ROOT_RE);
  if (!m) return chord;
  return (ENGLISH_MAP[m[1]] ?? m[1]) + m[2];
}

export function renderNotation(chord, notation) {
  return notation === 'cs' ? toCzech(chord) : toEnglish(chord);
}

function shiftRoot(root, semis) {
  const normalized = FLAT_TO_SHARP[root] ?? root;
  const idx = SEMITONES.indexOf(normalized);
  if (idx < 0) return root;
  const next = (idx + (semis % 12) + 12) % 12;
  return SEMITONES[next] ?? root;
}

function shiftPart(part, semis) {
  const m = part.match(TRANSPOSE_ROOT_RE);
  if (!m) return part;
  return shiftRoot(m[1], semis) + m[2];
}

export function transposeChord(chord, semitones) {
  if (semitones === 0) return chord;
  const [main, bass] = chord.split('/');
  const shiftedMain = shiftPart(main ?? chord, semitones);
  if (!bass) return shiftedMain;
  return `${shiftedMain}/${shiftPart(bass, semitones)}`;
}

/**
 * Convenience: transpose first, then render in the requested notation.
 * Matches what the app's SongView does per-segment.
 */
export function transformChord(chord, semitones, notation) {
  return renderNotation(transposeChord(chord, semitones), notation);
}
