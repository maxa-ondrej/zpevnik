/**
 * Renders a parsed ChordPro song with chords above lyrics.
 * Applies the current transpose + notation settings.
 *
 * Optionally accepts a `highlightedLineIndex` (used by play mode) and an
 * `onLineLayout` callback so the parent can scroll the highlighted line
 * into view.
 */

import { Text, View, StyleSheet, type LayoutChangeEvent } from 'react-native';

import { render as renderNotation } from '../chordpro/notation';
import type { ParsedSong, SongLine } from '../chordpro/parser';
import { transposeChord } from '../chordpro/transpose';
import { useSettings } from '../store/settings';
import { useTheme, type Theme } from '../store/theme';

interface Props {
  song: ParsedSong;
  /** Index of the line to visually highlight (play mode). */
  highlightedLineIndex?: number;
  /** Called whenever a line's vertical layout is known. */
  onLineLayout?: (index: number, y: number, height: number) => void;
}

export function SongView({ song, highlightedLineIndex, onLineLayout }: Props) {
  const { notation, transpose, fontSize, lineSpacing } = useSettings();
  const theme = useTheme();
  return (
    <View style={styles.container}>
      {song.lines.map((line, i) => (
        <LineRow
          key={i}
          line={line}
          index={i}
          fontSize={fontSize}
          lineSpacing={lineSpacing}
          transpose={transpose}
          notation={notation}
          theme={theme}
          highlighted={i === highlightedLineIndex}
          onLayout={onLineLayout}
        />
      ))}
    </View>
  );
}

interface LineRowProps {
  line: SongLine;
  index: number;
  fontSize: number;
  lineSpacing: number;
  transpose: number;
  notation: 'cs' | 'en';
  theme: Theme;
  highlighted: boolean;
  onLayout?: (index: number, y: number, height: number) => void;
}

function LineRow({
  line,
  index,
  fontSize,
  lineSpacing,
  transpose,
  notation,
  theme,
  highlighted,
  onLayout,
}: LineRowProps) {
  const handleLayout = onLayout
    ? (ev: LayoutChangeEvent) => {
        const { y, height } = ev.nativeEvent.layout;
        onLayout(index, y, height);
      }
    : undefined;

  if (line.segments.length === 0) {
    return <View style={{ height: fontSize * lineSpacing }} onLayout={handleLayout} />;
  }
  // Scale the per-line gap so the user's lineSpacing setting actually shows
  // up between chord/lyric rows, not just on blank lines.
  const lineMargin = 8 * lineSpacing;
  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.line,
        { marginBottom: lineMargin },
        line.section === 'chorus' && [styles.chorus, { borderLeftColor: theme.textMuted }],
        highlighted && [styles.highlighted, { backgroundColor: theme.accentBg }],
      ]}
    >
      <View style={styles.chordRow}>
        {line.segments.map((seg, i) => (
          <Text
            key={`c${i}`}
            style={[styles.chord, { fontSize: fontSize * 0.85, color: theme.accent }]}
          >
            {seg.chord ? renderNotation(transposeChord(seg.chord, transpose), notation) : ''}
            {seg.text.length > 0 ? ' '.repeat(seg.text.length) : ''}
          </Text>
        ))}
      </View>
      <View style={styles.lyricRow}>
        {line.segments.map((seg, i) => (
          <Text key={`l${i}`} style={[styles.lyric, { fontSize, color: theme.text }]}>
            {seg.text}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  // marginBottom is overridden inline by `lineMargin` so the lineSpacing
  // setting actually affects per-line gap.
  line: {},
  chorus: { paddingLeft: 16, borderLeftWidth: 2 },
  highlighted: {
    // Negative side margins + matching padding extend the highlight to
    // the edges of the container while keeping the chord/lyric content
    // visually unchanged.
    marginLeft: -8,
    marginRight: -8,
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  chordRow: { flexDirection: 'row' },
  lyricRow: { flexDirection: 'row' },
  chord: { fontFamily: 'monospace', fontWeight: '600' },
  lyric: { fontFamily: 'monospace' },
});
