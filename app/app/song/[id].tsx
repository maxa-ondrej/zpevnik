import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SongControls } from '../../src/shared/components/SongControls';
import { SongView } from '../../src/shared/components/SongView';
import { parseChordPro, type ParsedSong } from '../../src/shared/chordpro/parser';
import { useSettings } from '../../src/shared/store/settings';
import type { SongIndex, SongMeta } from '../../src/shared/types/song';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; meta: SongMeta; song: ParsedSong; staveUris: string[] }
  | { kind: 'error'; message: string };

function staveUrisFor(dir: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `${dir}/staves/${n}.png`;
  });
}

export default function SongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const showStaves = useSettings((s) => s.showStaves);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const indexRes = await fetch('/songs/index.json');
        if (!indexRes.ok) throw new Error(`index HTTP ${indexRes.status}`);
        const index = (await indexRes.json()) as SongIndex;
        const meta = index.songs.find((s) => s.id === id);
        if (!meta) throw new Error(`song ${id} not in index`);

        const dir = `/songs/${meta.id}-${meta.slug}`;
        const choRes = await fetch(`${dir}/song.cho`);
        if (!choRes.ok) throw new Error(`song.cho HTTP ${choRes.status}`);
        const cho = await choRes.text();
        const song = parseChordPro(cho);
        const staveUris = staveUrisFor(dir, meta.staveCount);

        if (!cancelled) setState({ kind: 'ready', meta, song, staveUris });
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', message: String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Couldn't load song: {state.message}</Text>
      </View>
    );
  }

  const headerTitle = state.meta.number !== null
    ? `${state.meta.number}. ${state.meta.title}`
    : state.meta.title;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: headerTitle }} />
      <Text style={styles.title}>{state.meta.title}</Text>
      <SongControls />
      {showStaves && state.staveUris.length > 0 && (
        <View style={styles.staves}>
          {state.staveUris.map((uri) => (
            <Image
              key={uri}
              source={{ uri }}
              style={styles.stave}
              resizeMode="contain"
              accessibilityLabel="Stave notation"
            />
          ))}
        </View>
      )}
      <SongView song={state.song} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  error: { color: '#a00' },
  staves: { marginBottom: 16, gap: 6 },
  stave: { width: '100%', aspectRatio: 12, backgroundColor: '#fafafa' },
});
