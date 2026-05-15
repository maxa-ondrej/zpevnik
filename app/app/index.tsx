import { Link } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { SongMeta } from '../src/shared/types/song';

// Placeholder data — replaced in Phase 3 by loading index.json from the
// bundle (and later from a remote update channel).
const SAMPLE: SongMeta[] = [];

export default function SongListScreen() {
  return (
    <View style={styles.container}>
      {SAMPLE.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No songs yet</Text>
          <Text style={styles.emptyHint}>
            Run the pipeline against a songbook PDF, then rebuild the app to
            embed the generated songs/ tree.
          </Text>
        </View>
      ) : (
        <FlatList
          data={SAMPLE}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <Link href={{ pathname: '/song/[id]', params: { id: item.id } }} asChild>
              <Pressable style={styles.row}>
                <Text style={styles.rowNumber}>{item.number ?? ''}</Text>
                <Text style={styles.rowTitle}>{item.title}</Text>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: 'row', padding: 16, gap: 12, borderBottomWidth: 1, borderColor: '#eee' },
  rowNumber: { width: 40, color: '#666', fontVariant: ['tabular-nums'] },
  rowTitle: { flex: 1, fontSize: 16 },
  empty: { padding: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyHint: { color: '#666', textAlign: 'center' },
});
