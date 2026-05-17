import { Link, Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { parseChordPro } from '../src/shared/chordpro/parser';
import { fold, matches } from '../src/shared/search/fold';
import { extractLyrics } from '../src/shared/search/lyrics';
import { useFavorites } from '../src/shared/store/favorites';
import { useRecents } from '../src/shared/store/recents';
import { useTheme } from '../src/shared/store/theme';
import type { SongIndex, SongMeta } from '../src/shared/types/song';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; songs: SongMeta[] }
  | { kind: 'error'; message: string };

export default function SongListScreen() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [query, setQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  /**
   * Folded lyric text per song id, populated in the background after the
   * index loads. Empty until ready; title/number search works immediately.
   * Stored in a ref so updates don't re-render the whole list — we only
   * read it inside the search useMemo, which re-runs when `query` changes.
   */
  const [lyricsBySong, setLyricsBySong] = useState<Map<string, string>>(
    () => new Map(),
  );
  const lyricsLoadedRef = useRef(false);
  const recents = useRecents((s) => s.recents);
  const favorites = useFavorites((s) => s.favorites);
  const isFavorite = useCallback(
    (id: string) => favorites.includes(id),
    [favorites],
  );
  const theme = useTheme();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/songs/index.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const index = (await res.json()) as SongIndex;
        if (!cancelled) setState({ kind: 'ready', songs: index.songs });

        // Background-load every song's chordpro and build a folded lyric
        // index. Failures per-song are non-fatal — that song just won't
        // match lyric queries until the next load.
        if (!lyricsLoadedRef.current) {
          lyricsLoadedRef.current = true;
          const entries = await Promise.all(
            index.songs.map(async (s): Promise<[string, string] | null> => {
              try {
                const r = await fetch(`/songs/${s.id}-${s.slug}/song.cho`);
                if (!r.ok) return null;
                const cho = await r.text();
                return [s.id, extractLyrics(parseChordPro(cho))];
              } catch {
                return null;
              }
            }),
          );
          if (cancelled) return;
          const map = new Map<string, string>();
          for (const e of entries) if (e) map.set(e[0], e[1]);
          setLyricsBySong(map);
        }
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
    const base = showFavoritesOnly
      ? state.songs.filter((s) => favorites.includes(s.id))
      : state.songs;
    const trimmed = query.trim();
    if (trimmed.length === 0) return base;
    const needle = fold(trimmed);
    return base.filter(
      (s) =>
        matches(s.title, query) ||
        matches(String(s.number ?? ''), query) ||
        (lyricsBySong.get(s.id)?.includes(needle) ?? false),
    );
  }, [state, query, lyricsBySong, showFavoritesOnly, favorites]);

  /** Recent songs in mark-order (newest first), filtered to known ids. */
  const recentSongs = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const byId = new Map(state.songs.map((s) => [s.id, s] as const));
    return recents
      .map((id) => byId.get(id))
      .filter((s): s is SongMeta => s !== undefined);
  }, [state, recents]);

  const showRecents =
    query.trim().length === 0 && !showFavoritesOnly && recentSongs.length > 0;

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
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/setlists')}
              style={styles.headerLink}
              accessibilityRole="link"
              accessibilityLabel="Open setlists"
            >
              <Text style={[styles.headerLinkText, { color: theme.accent }]}>Setlists</Text>
            </Pressable>
          ),
        }}
      />
      <View style={[styles.searchBar, { borderColor: theme.borderSoft }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search title, number, or lyrics…"
          placeholderTextColor={theme.textDim}
          style={[
            styles.search,
            { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text },
          ]}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Pressable
          onPress={() => setShowFavoritesOnly((v) => !v)}
          style={[
            styles.favFilterBtn,
            {
              borderColor: showFavoritesOnly ? theme.accent : theme.border,
              backgroundColor: showFavoritesOnly ? theme.accent : theme.inputBg,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={showFavoritesOnly ? 'Show all songs' : 'Show favorites only'}
          accessibilityState={{ selected: showFavoritesOnly }}
        >
          <Text
            style={[
              styles.favFilterIcon,
              { color: showFavoritesOnly ? theme.accentText : theme.textMuted },
            ]}
          >
            ★
          </Text>
        </Pressable>
        <Text style={[styles.count, { color: theme.textMuted }]}>
          {filtered.length}/{state.songs.length}
        </Text>
      </View>
      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyHint, { color: theme.textMuted }]}>
            {showFavoritesOnly && favorites.length === 0
              ? 'No favorites yet — tap ★ on a song to add it.'
              : 'No matches.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          ListHeaderComponent={
            showRecents ? (
              <View>
                <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
                  Recently viewed
                </Text>
                {recentSongs.map((s) => (
                  <Link
                    key={`r-${s.id}`}
                    href={{ pathname: '/song/[id]', params: { id: s.id } }}
                    asChild
                  >
                    <Pressable style={[styles.row, { borderColor: theme.borderSoft }]}>
                      <Text style={[styles.rowNumber, { color: theme.textMuted }]}>
                        {s.number ?? ''}
                      </Text>
                      <Text style={[styles.rowTitle, { color: theme.text }]}>{s.title}</Text>
                      {isFavorite(s.id) && (
                        <Text style={[styles.rowFav, { color: theme.accent }]}>★</Text>
                      )}
                    </Pressable>
                  </Link>
                ))}
                <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>All songs</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Link href={{ pathname: '/song/[id]', params: { id: item.id } }} asChild>
              <Pressable style={[styles.row, { borderColor: theme.borderSoft }]}>
                <Text style={[styles.rowNumber, { color: theme.textMuted }]}>{item.number ?? ''}</Text>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{item.title}</Text>
                {isFavorite(item.id) && (
                  <Text style={[styles.rowFav, { color: theme.accent }]}>★</Text>
                )}
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
  favFilterBtn: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favFilterIcon: { fontSize: 16, lineHeight: 18 },
  row: { flexDirection: 'row', padding: 16, gap: 12, borderBottomWidth: 1, alignItems: 'center' },
  rowNumber: { width: 40, fontVariant: ['tabular-nums'] },
  rowTitle: { flex: 1, fontSize: 16 },
  rowFav: { fontSize: 16 },
  empty: { padding: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyHint: { textAlign: 'center' },
  sectionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  headerLink: { paddingHorizontal: 12, paddingVertical: 6 },
  headerLinkText: { fontSize: 15, fontWeight: '500' },
});
