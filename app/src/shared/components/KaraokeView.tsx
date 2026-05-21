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

import { useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

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

// Visible vertical extent of the inline staff. Roughly two staff
// lines tall at the converter's default scale; the active line is
// kept centered via translateY.
const STAFF_VIEWPORT_HEIGHT = 140;

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

  // Inline staff: when Play advances onto a new line, abcjs posts
  // the line's y inside the AbcView's WebView. We translate the
  // inner wrapper so that y is centred inside STAFF_VIEWPORT_HEIGHT.
  const staffTranslate = useRef(new Animated.Value(0)).current;
  const onStaffLineChange = (yInsideAbcView: number) => {
    const target = Math.max(
      0,
      yInsideAbcView - STAFF_VIEWPORT_HEIGHT * 0.3,
    );
    Animated.timing(staffTranslate, {
      toValue: -target,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  // Beat tracking for progressive in-line syllable fill. We re-render
  // each time abcjs posts a beat (cheap — only the current line
  // updates), compute `progressInLine ∈ [0, 1]`, and color text
  // segments left-to-right based on that fraction.
  const [beatState, setBeatState] = useState<{ beat: number; total: number }>({
    beat: 0,
    total: 0,
  });
  const handleBeat = (beat: number, total: number) => {
    setBeatState({ beat, total });
    onBeat?.(beat, total);
  };

  // Build a list of LYRIC line indices (skip empty / directive-only
  // lines so the karaoke triplet doesn't waste a slot on a blank).
  const lyricIndices = useMemo(
    () => song.lines.flatMap((ln, i) => (lineHasText(ln) ? [i] : [])),
    [song.lines],
  );
  const lyricCount = lyricIndices.length;

  // Pick the focused index: if Play has set one, find its position in
  // lyricIndices (it may point at a blank line; snap to nearest). Else
  // start at the first lyric line.
  const focusPosition = useMemo(() => {
    if (lyricCount === 0) return 0;
    if (currentLineIndex === undefined) return 0;
    // Find the largest lyric-line index ≤ currentLineIndex.
    let pos = 0;
    for (let i = 0; i < lyricIndices.length; i += 1) {
      const idx = lyricIndices[i];
      if (idx !== undefined && idx <= currentLineIndex) pos = i;
      else break;
    }
    return pos;
  }, [currentLineIndex, lyricIndices, lyricCount]);

  if (lyricCount === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>
          No lyrics for karaoke yet.
        </Text>
      </View>
    );
  }

  const at = (pos: number): SongLine | null => {
    const idx = lyricIndices[pos];
    return idx !== undefined ? (song.lines[idx] ?? null) : null;
  };
  const prevLine = focusPosition > 0 ? at(focusPosition - 1) : null;
  const currLine = at(focusPosition);
  const nextLine = focusPosition < lyricCount - 1 ? at(focusPosition + 1) : null;

  // Progress within the current line — fraction in [0, 1]. We use
  // the SAME beat-to-line mapping as the parent's `onAbcBeat` so
  // the per-syllable cursor stays in lockstep with the lyric line.
  // For lines where the math overshoots (last line or rounding), we
  // clamp; for Play-off, we pin to 0 so nothing is "pre-filled."
  const progressInLine = useMemo(() => {
    if (!isFollowing) return 0;
    if (beatState.total <= 0 || lyricCount === 0) return 0;
    const beatsPerLine = beatState.total / lyricCount;
    if (beatsPerLine <= 0) return 0;
    const beatInLine = beatState.beat - focusPosition * beatsPerLine;
    return Math.max(0, Math.min(1, beatInLine / beatsPerLine));
  }, [beatState, focusPosition, lyricCount, isFollowing]);
  if (!currLine) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>
          No lyrics to show.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {abc ? (
        <View
          style={[
            styles.staffViewport,
            { borderColor: theme.borderSoft, backgroundColor: theme.bgAlt },
          ]}
        >
          <Animated.View
            style={{
              transform: [{ translateY: staffTranslate }],
            }}
          >
            <AbcView
              abc={abc}
              transpose={transpose}
              fontSize={fontSize * 0.8}
              isFollowing={isFollowing}
              tempo={tempo}
              onBeat={handleBeat}
              onFollowEnd={onFollowEnd}
              onStaffLineChange={onStaffLineChange}
            />
          </Animated.View>
        </View>
      ) : null}
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
          progress={progressInLine}
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
      <Text style={[styles.progress, { color: theme.textMuted }]}>
        {focusPosition + 1} / {lyricCount}
      </Text>
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
  progress,
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
  /** 0..1 fraction of line covered by Play. Per-syllable fill on the
   *  current line is driven by this — segments to the left of the
   *  cursor render in `color`, segments to the right in
   *  `unfilledColor`. Undefined → no progressive fill (every
   *  segment renders in `color`). */
  progress?: number;
  unfilledColor?: string;
}) {
  const fs = Math.round(baseFontSize * scale);
  const chordFs = Math.round(fs * 0.6);

  // Only TEXT-bearing segments count toward the fill cursor —
  // chord-only segments don't represent a syllable.
  const textSegIndices = line.segments
    .map((s, i) => (s.text.trim().length > 0 ? i : -1))
    .filter((i) => i >= 0);
  const totalText = textSegIndices.length;
  const filledCount =
    progress === undefined ? totalText : Math.floor(progress * totalText);
  // Index of the LAST filled text segment in line.segments space (or
  // -1 if none yet). Anything ≤ that index renders in `color`.
  const lastFilledIdx =
    filledCount > 0 ? (textSegIndices[filledCount - 1] ?? -1) : -1;

  return (
    <View style={styles.lineWrap}>
      <View style={styles.segments}>
        {line.segments.map((seg, i) => {
          const filled = progress === undefined || i <= lastFilledIdx;
          const lyricColor = filled ? color : (unfilledColor ?? color);
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
                    color: lyricColor,
                    fontSize: fs,
                    fontWeight: bold ? '700' : '500',
                  },
                ]}
              >
                {seg.text || ' '}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
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
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 8,
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
