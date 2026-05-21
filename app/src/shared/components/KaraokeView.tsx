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

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ParsedSong, SongLine } from '../chordpro/parser';
import { transposeChord } from '../chordpro/transpose';
import { render as renderNotation } from '../chordpro/notation';
import { useSettings } from '../store/settings';
import { useTheme, type Theme } from '../store/theme';

interface KaraokeViewProps {
  song: ParsedSong;
  /** Highlighted line index from Play. `undefined` → use the first
   *  non-blank line as a passive landing state. */
  currentLineIndex: number | undefined;
}

export function KaraokeView({ song, currentLineIndex }: KaraokeViewProps) {
  const fontSize = useSettings((s) => s.fontSize);
  const notation = useSettings((s) => s.notation);
  const transpose = useSettings((s) => s.transpose);
  const theme = useTheme();

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
}: {
  line: SongLine;
  theme: Theme;
  scale: number;
  color: string;
  baseFontSize: number;
  notation: 'cs' | 'en';
  transpose: number;
  bold?: boolean;
}) {
  // Render chord + text inline like SongView, but with the chord
  // tucked superscript-style above the syllable. For a karaoke strip
  // we keep it on one wrapping line — no per-syllable break.
  const fs = Math.round(baseFontSize * scale);
  const chordFs = Math.round(fs * 0.6);
  return (
    <View style={styles.lineWrap}>
      <View style={styles.segments}>
        {line.segments.map((seg, i) => (
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
                  color,
                  fontSize: fs,
                  fontWeight: bold ? '700' : '500',
                },
              ]}
            >
              {seg.text || ' '}
            </Text>
          </View>
        ))}
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
