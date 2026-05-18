/**
 * Compute the total beat count of an assembled melody by counting
 * measure boundaries across every block and multiplying by the
 * header's time-signature numerator.
 *
 * Used to derive a song-length-proportional `beatsPerLine` for the
 * lyric-only Play fallback (when AbcView's TimingCallbacks are not the
 * timing source — e.g. staves off, or native).
 */
import type { Melody } from './assemble';

const METER_RE = /^M:\s*(\d+)\s*\/\s*(\d+)/m;

/**
 * Parses the M: directive from an ABC header. Returns `null` when the
 * header is missing the directive or its value is malformed.
 */
export function parseMeter(header: string): { num: number; den: number } | null {
  const m = METER_RE.exec(header);
  if (!m) return null;
  const num = Number(m[1]);
  const den = Number(m[2]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) {
    return null;
  }
  return { num, den };
}

/**
 * Counts measure boundaries in an ABC body. Treats any consecutive run
 * of `|` characters (incl. `||`, `|]`, `[|`, `|:`, `:|`) as a single
 * boundary. Quoted chord/annotation strings and ABC information-field
 * lines (e.g. `w:`, `K:`) are stripped first so embedded `|`s don't
 * confuse the count.
 */
export function countMeasures(body: string): number {
  const stripped = body
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      // ABC information fields use a single uppercase letter followed by
      // `:` at the very start of a line. `w:` lyric continuations follow
      // the same shape with a lowercase letter and must also be excluded.
      return !/^[A-Za-z]:/.test(t);
    })
    .join('\n')
    // Quoted chord / annotation strings: "C", "^Verse 1", etc.
    .replace(/"[^"]*"/g, '');
  const matches = stripped.match(/\|+/g);
  return matches ? matches.length : 0;
}

/**
 * Returns the total beat count of the melody (sum of measures across
 * all blocks × time-signature numerator), or `null` when the melody is
 * absent or doesn't contain at least one measure.
 */
export function totalBeatsFromMelody(melody: Melody | null): number | null {
  if (!melody) return null;
  const meter = parseMeter(melody.header);
  const beatsPerMeasure = meter ? meter.num : 4;
  let totalMeasures = 0;
  for (const block of melody.blocks) {
    totalMeasures += countMeasures(block.body);
  }
  if (totalMeasures === 0) return null;
  return totalMeasures * beatsPerMeasure;
}
