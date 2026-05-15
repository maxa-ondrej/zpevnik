/**
 * Transpose a canonical English chord token by N semitones.
 *
 * The chord is split into root + optional bass (e.g. "G/B"). Each is shifted
 * independently. Suffix (m, 7, maj7, sus4, …) is preserved verbatim.
 */

const SEMITONES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
};

const ROOT_RE = /^([A-G][b#]?)(.*)$/;

function shiftRoot(root: string, semis: number): string {
  const normalized = FLAT_TO_SHARP[root] ?? root;
  const idx = SEMITONES.indexOf(normalized);
  if (idx < 0) return root;
  const next = (idx + (semis % 12) + 12) % 12;
  return SEMITONES[next] ?? root;
}

export function transposeChord(chord: string, semitones: number): string {
  if (semitones === 0) return chord;
  const [main, bass] = chord.split('/');
  const shiftedMain = shiftPart(main ?? chord, semitones);
  if (!bass) return shiftedMain;
  return `${shiftedMain}/${shiftPart(bass, semitones)}`;
}

function shiftPart(part: string, semitones: number): string {
  const m = part.match(ROOT_RE);
  if (!m) return part;
  const [, root, suffix] = m as [string, string, string];
  return shiftRoot(root, semitones) + suffix;
}
