/**
 * Compose a final ABC string from a structured melody sidecar.
 *
 * Each song ships with a melody.json containing:
 *   - header   : ABC header (X, T, M, L, K, …) shared by every block
 *   - verses[] : one ABC body per verse (notes + w: line)
 *   - chorus?  : optional ABC body for the chorus (notes + w: line)
 *
 * Rendering rule — kept deliberately simple so authors don't have to
 * pre-interleave by hand:
 *
 *   • The chorus is inserted between every 2nd verse, but never as the
 *     final block — i.e. with 6 verses you get
 *         V1, V2, C, V3, V4, C, V5, V6
 *   • Short songs (≤ 2 verses) get a trailing chorus instead — i.e.
 *         V1, V2, C
 *     so hymns with a single refrain still surface it.
 *   • Songs without a chorus simply render their verses in order.
 */

export interface Melody {
  header: string;
  verses: string[];
  chorus?: string;
}

export function assembleAbc(melody: Melody): string {
  const parts: string[] = [melody.header.trim()];
  const { verses, chorus } = melody;

  for (let i = 0; i < verses.length; i++) {
    parts.push(verses[i]!.trim());
    const isLast = i === verses.length - 1;
    const completedAPair = (i + 1) % 2 === 0;
    if (chorus && completedAPair && !isLast) {
      parts.push(chorus.trim());
    }
  }

  if (chorus && verses.length > 0 && verses.length <= 2) {
    // 1-2 verse songs still get the chorus once, at the end.
    parts.push(chorus.trim());
  }

  return parts.join('\n');
}
