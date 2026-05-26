/**
 * Lyric/transcript normalisation. The matcher compares "what the user
 * sang" against "what the song says" — both are noisy, so we collapse
 * them to a comparable form:
 *
 *   - lowercase
 *   - NFD-strip diacritics ("Pane" / "páně" / "pané" → "pane")
 *   - keep only [a-z0-9]; everything else becomes a token boundary
 *   - drop tokens shorter than 2 chars (single letters from recognizer
 *     noise create spurious bigram matches)
 */

const MIN_TOKEN_LEN = 2;

// U+0300..U+036F is the Combining Diacritical Marks block — what NFD
// peels off é, š, ů, č, etc. Written as an explicit escape range so
// editors / grep / encoding hiccups can't lose the combining char.
const COMBINING_MARKS_RE = /[̀-ͯ]/g;

/** Strip diacritics, lowercase, return a clean string of tokens
 *  separated by single spaces. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(COMBINING_MARKS_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Split normalised text into tokens, dropping very short ones. */
export function tokenize(s: string): string[] {
  if (s.length === 0) return [];
  return normalizeText(s)
    .split(' ')
    .filter((t) => t.length >= MIN_TOKEN_LEN);
}
