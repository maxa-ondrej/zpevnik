/**
 * Renders a parsed ChordPro song with chords above lyrics.
 * Applies the current transpose + notation settings.
 */

import { Text, View, StyleSheet } from 'react-native';

import { render as renderNotation } from '../chordpro/notation';
import type { ParsedSong, SongLine } from '../chordpro/parser';
import { transposeChord } from '../chordpro/transpose';
import { useSettings } from '../store/settings';
import { useTheme, type Theme } from '../store/theme';

interface Props {
  song: ParsedSong;
}

export function SongView({ song }: Props) {
  const { notation, transpose, fontSize, lineSpacing } = useSettings();
  const theme = useTheme();
  return (
    <View style={styles.container}>
      {song.lines.map((line, i) => (
        <LineRow
          key={i}
          line={line}
          fontSize={fontSize}
          lineSpacing={lineSpacing}
          transpose={transpose}
          notation={notation}
          theme={theme}
        />
      ))}
    </View>
  );
}

interface LineRowProps {
  line: SongLine;
  fontSize: number;
  lineSpacing: number;
  transpose: number;
  notation: 'cs' | 'en';
  theme: Theme;
}

function LineRow({ line, fontSize, lineSpacing, transpose, notation, theme }: LineRowProps) {
  if (line.segments.length === 0) {
    return <View style={{ height: fontSize * lineSpacing }} />;
  }
  // Scale the per-line gap so the user's lineSpacing setting actually shows
  // up between chord/lyric rows, not just on blank lines.
  const lineMargin = 8 * lineSpacing;
  return (
    <View
      style={[
        styles.line,
        { marginBottom: lineMargin },
        line.section === 'chorus' && [styles.chorus, { borderLeftColor: theme.textMuted }],
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
  chordRow: { flexDirection: 'row' },
  lyricRow: { flexDirection: 'row' },
  chord: { fontFamily: 'monospace', fontWeight: '600' },
  lyric: { fontFamily: 'monospace' },
});
