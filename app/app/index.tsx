import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { matches } from '../src/shared/search/fold';
import type { SongIndex, SongMeta } from '../src/shared/types/song';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; songs: SongMeta[] }
  | { kind: 'error'; message: string };

export default function SongListScreen() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [query, setQuery] = useState('');

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

  const filtered = useMemo(() => {
    if (state.kind !== 'ready') return [];
    if (query.trim().length === 0) return state.songs;
    return state.songs.filter((s) => matches(s.title, query) || matches(String(s.number ?? ''), query));
  }, [state, query]);

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
      <View style={styles.searchBar}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by title or number…"
          placeholderTextColor="#999"
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Text style={styles.count}>
          {filtered.length}/{state.songs.length}
        </Text>
      </View>
      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyHint}>No matches.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  search: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  count: { color: '#888', fontSize: 12, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', padding: 16, gap: 12, borderBottomWidth: 1, borderColor: '#eee' },
  rowNumber: { width: 40, color: '#666', fontVariant: ['tabular-nums'] },
  rowTitle: { flex: 1, fontSize: 16 },
  empty: { padding: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyHint: { color: '#666', textAlign: 'center' },
});
