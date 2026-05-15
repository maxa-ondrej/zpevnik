/**
 * Czech ↔ English chord notation.
 *
 * Storage is canonical English (A, B, C, …, Bb). The UI may render in
 * Czech (A, H, B, C, …) per user setting.
 *
 * Czech convention:
 *   English B  → Czech H
 *   English Bb → Czech B
 *
 * Everything else (sharps/flats, suffixes) is identical.
 */

export type Notation = 'en' | 'cs';

const CZECH_MAP: Record<string, string> = {
  Bb: 'B',
  B: 'H',
};

const ENGLISH_MAP: Record<string, string> = {
  H: 'B',
  B: 'Bb',
};

const ROOT_RE = /^([A-H][b#]?)(.*)$/;

export function toCzech(chord: string): string {
  const m = chord.match(ROOT_RE);
  if (!m) return chord;
  const [, root, suffix] = m as [string, string, string];
  return (CZECH_MAP[root] ?? root) + suffix;
}

export function toEnglish(chord: string): string {
  const m = chord.match(ROOT_RE);
  if (!m) return chord;
  const [, root, suffix] = m as [string, string, string];
  return (ENGLISH_MAP[root] ?? root) + suffix;
}

export function render(chord: string, notation: Notation): string {
  return notation === 'cs' ? toCzech(chord) : toEnglish(chord);
}
