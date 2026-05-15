import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { SongView } from '../../src/shared/components/SongView';
import { parseChordPro } from '../../src/shared/chordpro/parser';

// Placeholder: until the pipeline emits real songs, render a literal example
// so the renderer is exercisable end-to-end.
const PLACEHOLDER = `{title: Ave Maria, Pán buď s Tebou}
{key: A}
{start_of_verse}
[A]A-ve Ma-[E]ri-a, [A]Pán buď s [D]Te-bou,
[A]po-žeh-[E]na-ná ty mezi že-[A]na-mi.
{end_of_verse}
`;

export default function SongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const song = parseChordPro(PLACEHOLDER);
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{song.meta.title ?? `Song ${id}`}</Text>
      <SongView song={song} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
});
