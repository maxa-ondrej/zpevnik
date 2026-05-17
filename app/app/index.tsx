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
import { useTheme } from '../src/shared/store/theme';
import type { SongIndex, SongMeta } from '../src/shared/types/song';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; songs: SongMeta[] }
  | { kind: 'error'; message: string };

export default function SongListScreen() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [query, setQuery] = useState('');
  const theme = useTheme();

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
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={[styles.empty, { backgroundColor: theme.bg }]}>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>Couldn't load song list</Text>
        <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{state.message}</Text>
      </View>
    );
  }

  if (state.songs.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.bg }]}>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>No songs yet</Text>
        <Text style={[styles.emptyHint, { color: theme.textMuted }]}>
          Run the pipeline against a songbook PDF to populate songs/.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.searchBar, { borderColor: theme.borderSoft }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by title or number…"
          placeholderTextColor={theme.textDim}
          style={[
            styles.search,
            { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text },
          ]}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Text style={[styles.count, { color: theme.textMuted }]}>
          {filtered.length}/{state.songs.length}
        </Text>
      </View>
      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyHint, { color: theme.textMuted }]}>No matches.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <Link href={{ pathname: '/song/[id]', params: { id: item.id } }} asChild>
              <Pressable style={[styles.row, { borderColor: theme.borderSoft }]}>
                <Text style={[styles.rowNumber, { color: theme.textMuted }]}>{item.number ?? ''}</Text>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{item.title}</Text>
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
  },
  search: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 6,
  },
  count: { fontSize: 12, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', padding: 16, gap: 12, borderBottomWidth: 1 },
  rowNumber: { width: 40, fontVariant: ['tabular-nums'] },
  rowTitle: { flex: 1, fontSize: 16 },
  empty: { padding: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyHint: { textAlign: 'center' },
});
