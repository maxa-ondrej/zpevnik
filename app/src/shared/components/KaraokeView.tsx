/**
 * Karaoke view — focused "previous + current + next" lyric strip.
 *
 * Default phone view. Renders three consecutive ChordPro lines from
 * the parsed song, with the current line large + centred + the
 * accent color, the neighbouring lines smaller + faded as
 * "what just was" / "what comes next" hints.
 *
 * Driven by `currentLineIndex` which the parent computes from the
 * same Play machinery the staves view uses (abcjs `TimingCallbacks`
 * beatCallback → onAbcBeat → followLine). When Play is off (no
 * follow active) we fall back to showing the first non-blank line
 * as the "current" so the screen isn't empty.
 *
 * v1 scope: line-level highlight only. Per-syllable cursor is the
 * obvious next polish — `TimingCallbacks` already fires per note
 * over the existing onBeat bridge.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ParsedSong, SongLine } from '../chordpro/parser';
import { transposeChord } from '../chordpro/transpose';
import { render as renderNotation } from '../chordpro/notation';
import { useSettings } from '../store/settings';
import { useTheme, type Theme } from '../store/theme';
import { AbcView } from './AbcView';

interface KaraokeViewProps {
  song: ParsedSong;
  /** Highlighted line index from Play. `undefined` → use the first
   *  non-blank line as a passive landing state. */
  currentLineIndex: number | undefined;
  /** Optional ABC notation for the song. When provided, a compact
   *  inline staff renders above the lyric strip; the staff auto-
   *  scrolls (translateY) to keep the active line visible inside a
   *  clipped viewport. */
  abc?: string | null;
  /** Play-state flag to drive the inline AbcView's TimingCallbacks. */
  isFollowing?: boolean;
  /** Quarters per minute, for the inline AbcView. */
  tempo?: number;
  /** Forwarded to the inline AbcView so the parent can advance
   *  `followLine` from per-beat callbacks. */
  onBeat?: (beat: number, total: number) => void;
  /** Forwarded so the parent can stop following when the song ends. */
  onFollowEnd?: () => void;
}

// Visible vertical extent of the staff cut-out. Sized to fit ~2
// staff lines so the user sees the active phrase plus a peek of
// what's next; the scrollView auto-scrolls to keep it centered.
const STAFF_VIEWPORT_HEIGHT = 280;

export function KaraokeView({
  song,
  currentLineIndex,
  abc,
  isFollowing,
  tempo,
  onBeat,
  onFollowEnd,
}: KaraokeViewProps) {
  const fontSize = useSettings((s) => s.fontSize);
  const notation = useSettings((s) => s.notation);
  const transpose = useSettings((s) => s.transpose);
  const theme = useTheme();

  // Inline staff cut-out: keep just the active line visible inside
  // STAFF_VIEWPORT_HEIGHT. The AbcView renders the WHOLE staff into
  // its WebView; we wrap it in a ScrollView pinned to that height and
  // call `scrollTo` whenever abcjs posts a new staff-line y. Pure
  // RN scrolling — no Animated.Value transform (which mysteriously
  // left a gray rectangle on iOS).
  const staffScrollRef = useRef<ScrollView>(null);
  const onStaffLineChange = (yInsideAbcView: number) => {
    const target = Math.max(
      0,
      yInsideAbcView - STAFF_VIEWPORT_HEIGHT * 0.3,
    );
    staffScrollRef.current?.scrollTo({ y: target, animated: true });
  };

  // GLOBAL note counter across the whole song. The inline AbcView's
  // `onNoteEvent` fires once per played event. We bucket the running
  // count against `cumSyllables` to derive which line is active and
  // how far into that line the cursor sits — no dependency on the
  // parent's coarser beat-based `followLine` for line transitions.
  const [noteIndex, setNoteIndex] = useState(0);

  // Reset the cursor whenever a new Play session starts (off → on).
  // Without this, restarting Play mid-song would resume from
  // wherever the previous run left off.
  const wasFollowing = useRef(isFollowing);
  useEffect(() => {
    if (isFollowing && !wasFollowing.current) {
      setNoteIndex(0);
    }
    wasFollowing.current = isFollowing;
  }, [isFollowing]);

  const handleNoteEvent = () => setNoteIndex((n) => n + 1);

  // Forward beats to parent so anything else that depends on
  // `followLine` (e.g. the staves view's line highlight in a
  // future "show both" mode) still works.
  const handleBeat = (beat: number, total: number) => {
    onBeat?.(beat, total);
  };

  // Build a list of LYRIC line indices (skip empty / directive-only
  // lines so the karaoke triplet doesn't waste a slot on a blank).
  const lyricIndices = useMemo(
    () => song.lines.flatMap((ln, i) => (lineHasText(ln) ? [i] : [])),
    [song.lines],
  );
  const lyricCount = lyricIndices.length;

  // Cumulative syllable count up to and including each lyric line.
  // Drives the line-and-syllable cursor below: a global noteIndex is
  // bucketed against this to find which line we're on and where
  // inside it.
  const cumSyllables = useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const i of lyricIndices) {
      const line = song.lines[i];
      if (line) {
        for (const seg of line.segments) acc += countSyllables(seg.text);
      }
      out.push(acc);
    }
    return out;
  }, [lyricIndices, song.lines]);

  if (lyricCount === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>
          No lyrics for karaoke yet.
        </Text>
      </View>
    );
  }

  // Resolve focusPosition + per-line offset from the global noteIndex.
  // `cumSyllables[i]` is the total syllables through line i; the
  // active line is the smallest i where noteIndex < cumSyllables[i].
  // When Play is off (or noteIndex is 0), default to line 0 / first
  // lyric line via parent prop.
  const focusPosition = useMemo(() => {
    if (lyricCount === 0) return 0;
    if (!isFollowing) {
      // Parent's coarse `followLine` still drives the passive
      // landing state when Play isn't running — e.g. clicking
      // forward via some future "next phrase" affordance.
      if (currentLineIndex === undefined) return 0;
      let pos = 0;
      for (let i = 0; i < lyricIndices.length; i += 1) {
        const idx = lyricIndices[i];
        if (idx !== undefined && idx <= currentLineIndex) pos = i;
        else break;
      }
      return pos;
    }
    for (let i = 0; i < cumSyllables.length; i += 1) {
      const c = cumSyllables[i];
      if (c !== undefined && noteIndex < c) return i;
    }
    return lyricCount - 1;
  }, [isFollowing, noteIndex, cumSyllables, currentLineIndex, lyricIndices, lyricCount]);

  const at = (pos: number): SongLine | null => {
    const idx = lyricIndices[pos];
    return idx !== undefined ? (song.lines[idx] ?? null) : null;
  };
  const prevLine = focusPosition > 0 ? at(focusPosition - 1) : null;
  const currLine = at(focusPosition);
  const nextLine = focusPosition < lyricCount - 1 ? at(focusPosition + 1) : null;

  // Syllable count for the current line — sum across all its
  // segments. Drives the in-line per-syllable cursor.
  const currentSyllableCount = useMemo(
    () =>
      currLine
        ? currLine.segments.reduce(
            (acc, s) => acc + countSyllables(s.text),
            0,
          )
        : 0,
    [currLine],
  );
  // Offset within the current line = noteIndex - cumSyllables[focusPosition-1].
  const lineStart = focusPosition > 0 ? (cumSyllables[focusPosition - 1] ?? 0) : 0;
  const noteInLine = Math.max(0, noteIndex - lineStart);
  const filledSyllables = !isFollowing
    ? currentSyllableCount  // Play off → show the whole line in accent.
    : Math.min(noteInLine, currentSyllableCount);
  if (!currLine) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>
          No lyrics to show.
        </Text>
      </View>
    );
  }

  // With a staff present, the lyrics under the notes (abcjs's `w:`
  // directive) ARE the karaoke text — no separate lyric strip
  // needed. The staff cut-out shows ~2 lines at a time, abcjs
  // highlights the active note red, and ScrollView keeps the
  // active phrase centered. When the song has NO melody.json
  // (lyric-only), fall back to the prev/current/next text strip.
  if (abc) {
    return (
      <View style={styles.container}>
        <ScrollView
          ref={staffScrollRef}
          style={styles.staffViewport}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
        >
          <AbcView
            abc={abc}
            transpose={transpose}
            fontSize={fontSize}
            isFollowing={isFollowing}
            tempo={tempo}
            onBeat={handleBeat}
            onFollowEnd={onFollowEnd}
            onStaffLineChange={onStaffLineChange}
            onNoteEvent={handleNoteEvent}
          />
        </ScrollView>
      </View>
    );
  }

  // Fallback for melody-less songs: prev / current / next lyric
  // strip with per-syllable cursor on the current line.
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {prevLine ? (
          <KaraokeLine
            line={prevLine}
            theme={theme}
            scale={0.7}
            color={theme.textDim}
            baseFontSize={fontSize}
            notation={notation}
            transpose={transpose}
          />
        ) : (
          <View style={styles.spacerLine} />
        )}
      </View>
      <View style={[styles.row, styles.currentRow]}>
        <KaraokeLine
          line={currLine}
          theme={theme}
          scale={1.5}
          color={theme.accent}
          baseFontSize={fontSize}
          notation={notation}
          transpose={transpose}
          bold
          filledTextSegments={filledSyllables}
          unfilledColor={theme.text}
        />
      </View>
      <View style={styles.row}>
        {nextLine ? (
          <KaraokeLine
            line={nextLine}
            theme={theme}
            scale={0.7}
            color={theme.textDim}
            baseFontSize={fontSize}
            notation={notation}
            transpose={transpose}
          />
        ) : (
          <View style={styles.spacerLine} />
        )}
      </View>
    </View>
  );
}

function KaraokeLine({
  line,
  theme,
  scale,
  color,
  baseFontSize,
  notation,
  transpose,
  bold = false,
  filledTextSegments,
  unfilledColor,
}: {
  line: SongLine;
  theme: Theme;
  scale: number;
  color: string;
  baseFontSize: number;
  notation: 'cs' | 'en';
  transpose: number;
  bold?: boolean;
  /** Number of SYLLABLES already passed by Play's cursor on this line
   *  (across ALL segments). Syllables = tokens between whitespace
   *  AND hyphens in the segment text. `undefined` → no progressive
   *  fill (everything renders in `color`). */
  filledTextSegments?: number;
  unfilledColor?: string;
}) {
  const fs = Math.round(baseFontSize * scale);
  const chordFs = Math.round(fs * 0.6);

  // Walk segments and split each one's text into [syllable, sep,
  // syllable, sep, …] tokens. Maintain a global syllable index so the
  // fill cursor knows where it is across segment boundaries.
  let syllableCursor = 0;
  const showAll = filledTextSegments === undefined;

  return (
    <View style={styles.lineWrap}>
      <View style={styles.segments}>
        {line.segments.map((seg, i) => {
          const tokens = tokenize(seg.text);
          return (
            <View key={i} style={styles.segment}>
              {seg.chord ? (
                <Text style={[styles.chord, { color: theme.textMuted, fontSize: chordFs }]}>
                  {renderNotation(transposeChord(seg.chord, transpose), notation)}
                </Text>
              ) : (
                <Text style={[styles.chord, { fontSize: chordFs }]}> </Text>
              )}
              <Text
                style={[
                  styles.lyric,
                  {
                    fontSize: fs,
                    fontWeight: bold ? '700' : '500',
                  },
                ]}
              >
                {tokens.map((tok, j) => {
                  if (tok.kind === 'syllable') {
                    const filled = showAll || syllableCursor < (filledTextSegments ?? 0);
                    syllableCursor += 1;
                    return (
                      <Text
                        key={j}
                        style={{
                          color: filled ? color : (unfilledColor ?? color),
                        }}
                      >
                        {tok.text}
                      </Text>
                    );
                  }
                  // Separators (whitespace / hyphen) stay muted so the
                  // active syllable visually pops vs the structure.
                  return (
                    <Text key={j} style={{ color: unfilledColor ?? color }}>
                      {tok.text}
                    </Text>
                  );
                })}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

type Token = { kind: 'syllable' | 'sep'; text: string };

const SYL_SEP_RE = /(\s+|-)/g;

function tokenize(text: string): Token[] {
  if (!text) return [];
  const out: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = SYL_SEP_RE.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ kind: 'syllable', text: text.slice(last, m.index) });
    }
    out.push({ kind: 'sep', text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push({ kind: 'syllable', text: text.slice(last) });
  }
  return out;
}

function countSyllables(text: string): number {
  return tokenize(text).filter((t) => t.kind === 'syllable').length;
}

function lineHasText(line: SongLine): boolean {
  return line.segments.some((s) => s.text.trim().length > 0);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffViewport: {
    width: '100%',
    height: STAFF_VIEWPORT_HEIGHT,
    marginBottom: 16,
  },
  row: {
    width: '100%',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  currentRow: {
    marginVertical: 24,
  },
  lineWrap: {
    width: '100%',
    alignItems: 'center',
  },
  segments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  segment: {
    alignItems: 'center',
    marginRight: 2,
  },
  chord: {
    fontWeight: '600',
    lineHeight: undefined,
  },
  lyric: {
    lineHeight: undefined,
  },
  spacerLine: {
    height: 24,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  progress: {
    marginTop: 32,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
