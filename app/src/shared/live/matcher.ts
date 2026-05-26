/**
 * Fuzzy lyric-line matcher.
 *
 * Given a sliding window of recently-transcribed words and the current
 * line the user is "near", picks the best-fit line index in the song.
 *
 * Strategy:
 *   - Pre-tokenise each ChordPro line into a normalised token array
 *     (handled by `buildLineTokens` so the caller can cache the result
 *     for the whole song).
 *   - Score candidates in a window around `currentLine` (forward-biased)
 *     by bigram-overlap with the recent transcript tokens, plus a smaller
 *     unigram weight.
 *   - Add a small distance penalty so a tie breaks toward the nearer
 *     line, and a backward penalty so the cursor doesn't oscillate when
 *     a token also appears in an earlier line (chorus repeat).
 *   - Threshold the best score; below threshold → no change.
 *
 * Pure functions, no React, no IO — easy to unit-test against synthetic
 * songs + transcripts.
 */

import type { ParsedSong } from '../chordpro/parser';

import { tokenize } from './normalize';

export interface MatcherOptions {
  /** How far back from currentLine to consider as candidates. Small —
   *  the user can repeat a chorus, but not jump back to verse 1. */
  lookback?: number;
  /** How far forward from currentLine to consider. Generous so a quick
   *  singer can skip ahead a phrase or two without losing the follow. */
  lookahead?: number;
  /** Minimum match score before we update the line. Below this, the
   *  matcher returns null and the caller keeps the current line. */
  minScore?: number;
  /** Penalty per line of distance from currentLine. Keeps ties + close
   *  scores anchored to the current position. */
  distancePenalty?: number;
  /** Extra penalty for going backwards. */
  backwardPenalty?: number;
}

const DEFAULTS: Required<MatcherOptions> = {
  lookback: 2,
  lookahead: 8,
  minScore: 1.5,
  distancePenalty: 0.05,
  backwardPenalty: 0.5,
};

export interface MatchResult {
  /** Best-fit line index in the song. */
  lineIdx: number;
  /** Score after biases — kept on the result so callers can log or
   *  threshold further if they want. */
  score: number;
}

/** Tokenise every line of a parsed song. Caller should cache this
 *  per-song; it's O(text length) and we don't want to redo it on
 *  every transcript update. */
export function buildLineTokens(song: ParsedSong): string[][] {
  return song.lines.map((line) => {
    const text = line.segments.map((s) => s.text).join('');
    return tokenize(text);
  });
}

/** Score how well `transcript` (recent normalised tokens) overlaps
 *  with `line` (one line's normalised tokens). Bigram matches weighted
 *  2×, unigram 1×. Returns a non-negative raw score. */
function rawScore(transcript: string[], line: string[]): number {
  if (transcript.length === 0 || line.length === 0) return 0;
  const lineSet = new Set(line);
  let uni = 0;
  for (const t of transcript) {
    if (lineSet.has(t)) uni += 1;
  }
  const lineBigrams = new Set<string>();
  for (let i = 0; i < line.length - 1; i++) {
    lineBigrams.add(`${line[i]} ${line[i + 1]}`);
  }
  let bi = 0;
  for (let i = 0; i < transcript.length - 1; i++) {
    if (lineBigrams.has(`${transcript[i]} ${transcript[i + 1]}`)) bi += 1;
  }
  return uni + 2 * bi;
}

/**
 * Find the best-fit line for the recent transcript tokens.
 *
 * @param lineTokens  Output of {@link buildLineTokens}, cached per song.
 * @param recent      Sliding-window of recently-heard tokens (normalised).
 * @param currentLine Where the follow cursor sits right now.
 * @param options     See {@link MatcherOptions}.
 * @returns The new line + score, or `null` if no candidate clears the
 *          minScore threshold.
 */
export function matchLine(
  lineTokens: string[][],
  recent: string[],
  currentLine: number,
  options: MatcherOptions = {},
): MatchResult | null {
  const o = { ...DEFAULTS, ...options };
  if (lineTokens.length === 0 || recent.length === 0) return null;

  const lo = Math.max(0, currentLine - o.lookback);
  const hi = Math.min(lineTokens.length - 1, currentLine + o.lookahead);

  let best: MatchResult | null = null;
  for (let i = lo; i <= hi; i++) {
    const raw = rawScore(recent, lineTokens[i]!);
    if (raw === 0) continue;
    const distance = Math.abs(i - currentLine);
    const isBackward = i < currentLine;
    const score =
      raw - o.distancePenalty * distance - (isBackward ? o.backwardPenalty : 0);
    if (score < o.minScore) continue;
    if (best === null || score > best.score) {
      best = { lineIdx: i, score };
    }
  }
  return best;
}
