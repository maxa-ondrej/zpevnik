/**
 * Setlist detail — editable name, ordered song rows with reorder /
 * remove controls, and a delete-setlist affordance at the bottom.
 *
 * Adding songs happens from the song detail page ("+ Setlist"), not
 * here — keeps this screen focused on organizing what's already in.
 */

import { Link, Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { songFetch } from '../../src/shared/assets/songFetch';
import { useSetlists } from '../../src/shared/store/setlists';
import { useTheme } from '../../src/shared/store/theme';
import type { SongIndex, SongMeta } from '../../src/shared/types/song';

export default function SetlistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const setlist = useSetlists((s) => s.setlists.find((sl) => sl.id === id));
  const rename = useSetlists((s) => s.rename);
  const remove = useSetlists((s) => s.remove);
  const removeSong = useSetlists((s) => s.removeSong);
  const moveSong = useSetlists((s) => s.moveSong);

  const [songsById, setSongsById] = useState<Map<string, SongMeta> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await songFetch('/songs/index.json');
        if (!r.ok) return;
        const idx = (await r.json()) as SongIndex;
        if (!cancelled) {
          setSongsById(new Map(idx.songs.map((s) => [s.id, s] as const)));
        }
      } catch {
        // Non-fatal: the rows will fall back to "Unknown song".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (typeof id !== 'string' || !setlist) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.textMuted }}>Setlist not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={styles.container}
    >
      <Stack.Screen options={{ title: setlist.name }} />
      <Text style={[styles.label, { color: theme.textMuted }]}>Name</Text>
      <TextInput
        value={setlist.name}
        onChangeText={(t) => rename(setlist.id, t)}
        style={[
          styles.nameInput,
          { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text },
        ]}
        placeholderTextColor={theme.textDim}
      />

      <Text style={[styles.label, { color: theme.textMuted, marginTop: 16 }]}>
        Songs ({setlist.songIds.length})
      </Text>

      {setlist.songIds.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.borderSoft }]}>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            No songs in this setlist yet. Open a song and tap{' '}
            <Text style={{ color: theme.text, fontWeight: '600' }}>+ Setlist</Text> to add it.
          </Text>
        </View>
      ) : songsById === null ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        setlist.songIds.map((songId, idx) => {
          const meta = songsById.get(songId);
          const isFirst = idx === 0;
          const isLast = idx === setlist.songIds.length - 1;
          return (
            <View
              key={`${songId}-${idx}`}
              style={[styles.songRow, { borderColor: theme.borderSoft }]}
            >
              <Text style={[styles.songIdx, { color: theme.textMuted }]}>{idx + 1}</Text>
              <Link
                href={{
                  pathname: '/song/[id]',
                  params: { id: songId, setlistId: setlist.id },
                }}
                asChild
              >
                <Pressable style={styles.songMain}>
                  <Text style={[styles.songTitle, { color: theme.text }]} numberOfLines={1}>
                    {meta ? meta.title : `Unknown (${songId})`}
                  </Text>
                  {meta?.number !== null && meta?.number !== undefined && (
                    <Text style={[styles.songMeta, { color: theme.textMuted }]}>
                      #{meta.number}
                    </Text>
                  )}
                </Pressable>
              </Link>
              <Pressable
                onPress={() => moveSong(setlist.id, idx, idx - 1)}
                disabled={isFirst}
                style={[
                  styles.iconBtn,
                  { borderColor: theme.border, opacity: isFirst ? 0.3 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Move up"
              >
                <Text style={{ color: theme.text }}>↑</Text>
              </Pressable>
              <Pressable
                onPress={() => moveSong(setlist.id, idx, idx + 1)}
                disabled={isLast}
                style={[
                  styles.iconBtn,
                  { borderColor: theme.border, opacity: isLast ? 0.3 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Move down"
              >
                <Text style={{ color: theme.text }}>↓</Text>
              </Pressable>
              <Pressable
                onPress={() => removeSong(setlist.id, songId)}
                style={[styles.iconBtn, { borderColor: theme.border }]}
                accessibilityRole="button"
                accessibilityLabel="Remove from setlist"
              >
                <Text style={{ color: theme.danger }}>✕</Text>
              </Pressable>
            </View>
          );
        })
      )}

      <Pressable
        onPress={() => {
          remove(setlist.id);
          router.back();
        }}
        style={[styles.deleteBtn, { borderColor: theme.danger }]}
        accessibilityRole="button"
        accessibilityLabel="Delete this setlist"
      >
        <Text style={[styles.deleteBtnText, { color: theme.danger }]}>Delete setlist</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  nameInput: {
    fontSize: 18,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 6,
  },
  empty: {
    marginTop: 8,
    padding: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 6,
  },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  loadingRow: { padding: 24, alignItems: 'center' },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  songIdx: {
    width: 24,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    fontSize: 13,
  },
  songMain: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  songTitle: { flex: 1, fontSize: 15 },
  songMeta: { fontSize: 12, fontVariant: ['tabular-nums'] },
  iconBtn: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    marginTop: 24,
    padding: 12,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
  },
  deleteBtnText: { fontWeight: '600' },
});
