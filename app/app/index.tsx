import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { SongIndex, SongMeta } from '../src/shared/types/song';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; songs: SongMeta[] }
  | { kind: 'error'; message: string };

export default function SongListScreen() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/songs/index.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const index = (await res.json()) as SongIndex;
        if (!cancelled) setState({ kind: 'ready', songs: index.songs });
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', message: String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Couldn't load song list</Text>
        <Text style={styles.emptyHint}>{state.message}</Text>
      </View>
    );
  }

  if (state.songs.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No songs yet</Text>
        <Text style={styles.emptyHint}>
          Run the pipeline against a songbook PDF to populate songs/.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={state.songs}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', padding: 16, gap: 12, borderBottomWidth: 1, borderColor: '#eee' },
  rowNumber: { width: 40, color: '#666', fontVariant: ['tabular-nums'] },
  rowTitle: { flex: 1, fontSize: 16 },
  empty: { padding: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyHint: { color: '#666', textAlign: 'center' },
});
