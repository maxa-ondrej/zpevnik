/**
 * Renders a parsed ChordPro song with chords above lyrics.
 * Applies the current transpose + notation settings.
 */

import { Text, View, StyleSheet } from 'react-native';

import { render as renderNotation } from '../chordpro/notation';
import type { ParsedSong, SongLine } from '../chordpro/parser';
import { transposeChord } from '../chordpro/transpose';
import { useSettings } from '../store/settings';

interface Props {
  song: ParsedSong;
}

export function SongView({ song }: Props) {
  const { notation, transpose, fontSize, lineSpacing } = useSettings();
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
}

function LineRow({ line, fontSize, lineSpacing, transpose, notation }: LineRowProps) {
  if (line.segments.length === 0) {
    return <View style={{ height: fontSize * lineSpacing }} />;
  }
  return (
    <View style={[styles.line, line.section === 'chorus' && styles.chorus]}>
      <View style={styles.chordRow}>
        {line.segments.map((seg, i) => (
          <Text
            key={`c${i}`}
            style={[styles.chord, { fontSize: fontSize * 0.85 }]}
          >
            {seg.chord ? renderNotation(transposeChord(seg.chord, transpose), notation) : ''}
            {seg.text.length > 0 ? ' '.repeat(seg.text.length) : ''}
          </Text>
        ))}
      </View>
      <View style={styles.lyricRow}>
        {line.segments.map((seg, i) => (
          <Text key={`l${i}`} style={[styles.lyric, { fontSize }]}>
            {seg.text}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  line: { marginBottom: 8 },
  chorus: { paddingLeft: 16, borderLeftWidth: 2, borderLeftColor: '#888' },
  chordRow: { flexDirection: 'row' },
  lyricRow: { flexDirection: 'row' },
  chord: { fontFamily: 'monospace', color: '#0a6', fontWeight: '600' },
  lyric: { fontFamily: 'monospace' },
});
