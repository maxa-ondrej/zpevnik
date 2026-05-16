import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AbcView } from '../../src/shared/components/AbcView';
import { SongControls } from '../../src/shared/components/SongControls';
import { SongView } from '../../src/shared/components/SongView';
import { parseChordPro, type ParsedSong } from '../../src/shared/chordpro/parser';
import { assembleAbc, type Melody } from '../../src/shared/melody/assemble';
import { useSettings } from '../../src/shared/store/settings';
import type { SongIndex, SongMeta } from '../../src/shared/types/song';

type State =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      meta: SongMeta;
      song: ParsedSong;
      staveUris: string[];
      abc: string | null;
    }
  | { kind: 'error'; message: string };

function staveUrisFor(dir: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `${dir}/staves/${n}.png`;
  });
}

async function fetchOptionalMelody(dir: string): Promise<Melody | null> {
  try {
    const r = await fetch(`${dir}/melody.json`);
    if (!r.ok) return null;
    return (await r.json()) as Melody;
  } catch {
    return null;
  }
}

export default function SongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const showStaves = useSettings((s) => s.showStaves);
  const transpose = useSettings((s) => s.transpose);
  const fontSize = useSettings((s) => s.fontSize);
  const autoScrollSpeed = useSettings((s) => s.autoScrollSpeed);

  // --- Autoscroll machinery ----------------------------------------------
  const [isPlaying, setIsPlaying] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const currentYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);
  // Used to detect manual scroll while autoscroll is running: onScroll-reported y
  // that differs from our driven position by more than a small slack means the
  // user dragged — pause and adopt the new position.
  const expectedYRef = useRef(0);

  // Speed is read every frame; mirror it into a ref to avoid restarting the
  // rAF loop on every slider tick.
  const speedRef = useRef(autoScrollSpeed);
  useEffect(() => {
    speedRef.current = autoScrollSpeed;
  }, [autoScrollSpeed]);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      stopLoop();
      return;
    }
    lastTimeRef.current = 0;
    const tick = (now: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = now;
      }
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;
      const speed = speedRef.current;
      const next = currentYRef.current + (dt * speed) / 1000;

      const maxY = Math.max(0, contentHeightRef.current - layoutHeightRef.current);
      const clamped = Math.min(next, maxY);
      currentYRef.current = clamped;
      expectedYRef.current = clamped;
      scrollRef.current?.scrollTo({ y: clamped, animated: false });

      // End-of-content stop
      if (
        contentHeightRef.current > 0 &&
        layoutHeightRef.current > 0 &&
        clamped + layoutHeightRef.current >= contentHeightRef.current - 1
      ) {
        rafRef.current = null;
        setIsPlaying(false);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return stopLoop;
  }, [isPlaying, stopLoop]);

  // Unmount safety net
  useEffect(() => stopLoop, [stopLoop]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    contentHeightRef.current = contentSize.height;
    layoutHeightRef.current = layoutMeasurement.height;
    const y = contentOffset.y;
    if (rafRef.current !== null && Math.abs(y - expectedYRef.current) > 6) {
      // Manual scroll override while playing.
      setIsPlaying(false);
      currentYRef.current = y;
    } else if (rafRef.current === null) {
      currentYRef.current = y;
    }
  }, []);

  // --- Song loading -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setIsPlaying(false);
    currentYRef.current = 0;
    expectedYRef.current = 0;
    contentHeightRef.current = 0;
    layoutHeightRef.current = 0;
    (async () => {
      try {
        const indexRes = await fetch('/songs/index.json');
        if (!indexRes.ok) throw new Error(`index HTTP ${indexRes.status}`);
        const index = (await indexRes.json()) as SongIndex;
        const meta = index.songs.find((s) => s.id === id);
        if (!meta) throw new Error(`song ${id} not in index`);

        const dir = `/songs/${meta.id}-${meta.slug}`;
        const [choRes, melody] = await Promise.all([
          fetch(`${dir}/song.cho`),
          fetchOptionalMelody(dir),
        ]);
        if (!choRes.ok) throw new Error(`song.cho HTTP ${choRes.status}`);
        const cho = await choRes.text();
        const song = parseChordPro(cho);
        const staveUris = staveUrisFor(dir, meta.staveCount);
        const abc = melody ? assembleAbc(melody) : null;

        if (!cancelled) setState({ kind: 'ready', meta, song, staveUris, abc });
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
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.container}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <Stack.Screen options={{ title: headerTitle }} />
      <Text style={styles.title}>{state.meta.title}</Text>
      <SongControls isPlaying={isPlaying} onTogglePlay={togglePlay} />
      {showStaves && state.abc !== null && (
        <AbcView abc={state.abc} transpose={transpose} fontSize={fontSize} />
      )}
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
