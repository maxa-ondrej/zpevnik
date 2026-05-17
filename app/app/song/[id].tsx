import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AbcView } from '../../src/shared/components/AbcView';
import { AddToSetlistSheet } from '../../src/shared/components/AddToSetlistSheet';
import { SongControls } from '../../src/shared/components/SongControls';
import { SongView } from '../../src/shared/components/SongView';
import { parseChordPro, type ParsedSong } from '../../src/shared/chordpro/parser';
import { assembleAbc, type Melody } from '../../src/shared/melody/assemble';
import { useFavorites } from '../../src/shared/store/favorites';
import { useRecents } from '../../src/shared/store/recents';
import { useSettings } from '../../src/shared/store/settings';
import { useTheme } from '../../src/shared/store/theme';
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
  const markRecent = useRecents((s) => s.mark);
  const favorites = useFavorites((s) => s.favorites);
  const toggleFavorite = useFavorites((s) => s.toggle);
  const isFavorite = typeof id === 'string' && favorites.includes(id);
  const [setlistSheetOpen, setSetlistSheetOpen] = useState(false);
  const theme = useTheme();

  // Record this song as recently viewed. Fires once per id change.
  useEffect(() => {
    if (typeof id === 'string' && id.length > 0) markRecent(id);
  }, [id, markRecent]);

  // --- Play (tempo-paced follow) machinery -------------------------------
  // Highlights one ChordPro line at a time at the song's tempo, and scrolls
  // to keep that line in view. Line-level granularity is the MVP — beat-
  // accurate sync per note would need melody.json + abcjs TimingCallbacks.
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLine, setFollowLine] = useState(0);
  /** Y-coordinate of each rendered line in SongView, populated via
   *  onLineLayout from below. Used to scrollTo a useful offset. */
  const lineYsRef = useRef<Map<number, number>>(new Map());
  const followIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopFollow = useCallback(() => {
    if (followIntervalRef.current !== null) {
      clearInterval(followIntervalRef.current);
      followIntervalRef.current = null;
    }
  }, []);

  const toggleFollow = useCallback(() => {
    setIsFollowing((f) => {
      if (!f) setFollowLine(0); // restart from the top on play press
      return !f;
    });
  }, []);

  const onLineLayout = useCallback((index: number, y: number, _height: number) => {
    lineYsRef.current.set(index, y);
  }, []);

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

  // Follow-loop fallback: only used when AbcView is NOT rendered (no
  // staves on, or no melody.json). When the AbcView IS on screen, its
  // abcjs TimingCallbacks drives playback at note-level granularity and
  // calls back via `onBeat`; this setInterval is a coarser line-by-line
  // backup so play mode still does something useful in lyrics-only view.
  const useAbcjsTiming =
    state.kind === 'ready' && showStaves && state.abc !== null;

  useEffect(() => {
    if (!isFollowing || useAbcjsTiming) {
      stopFollow();
      return;
    }
    const meta = state.kind === 'ready' ? state.meta : null;
    const bpm = meta?.tempo ?? 100;
    const beatsPerLine = 4;
    const intervalMs = (60_000 / bpm) * beatsPerLine;

    followIntervalRef.current = setInterval(() => {
      setFollowLine((current) => {
        const totalLines = state.kind === 'ready' ? state.song.lines.length : 0;
        const next = current + 1;
        if (next >= totalLines) {
          // Reached the end — stop on the last line.
          setIsFollowing(false);
          return current;
        }
        return next;
      });
    }, intervalMs);

    return stopFollow;
  }, [isFollowing, useAbcjsTiming, state, stopFollow]);

  // When abcjs is the timing source, derive the current lyric line from
  // the beat callback. Fired by AbcView via onBeat. We snap the line index
  // by even distribution — fine for hymns where each line is roughly the
  // same length; a future improvement is to use measure structure from
  // melody.json directly.
  const onAbcBeat = useCallback(
    (beatNumber: number, totalBeats: number) => {
      if (state.kind !== 'ready' || totalBeats <= 0) return;
      const lineCount = state.song.lines.length;
      if (lineCount === 0) return;
      const beatsPerLine = totalBeats / lineCount;
      const idx = Math.min(lineCount - 1, Math.floor(beatNumber / beatsPerLine));
      setFollowLine(idx);
    },
    [state],
  );

  const onAbcFollowEnd = useCallback(() => {
    setIsFollowing(false);
  }, []);

  // When the followed line advances, scroll so it sits ~30% from the top.
  useEffect(() => {
    if (!isFollowing) return;
    const y = lineYsRef.current.get(followLine);
    if (y === undefined) return;
    // SongView is rendered inside the same ScrollView as the title + controls,
    // so its origin is offset by those siblings. The `y` we record is
    // SongView-local; we approximate the parent offset by the static
    // ScrollView padding plus a small head-of-content fudge.
    const headOffset = layoutHeightRef.current * 0.3;
    const targetY = Math.max(0, y - headOffset);
    scrollRef.current?.scrollTo({ y: targetY, animated: true });
    currentYRef.current = targetY;
    expectedYRef.current = targetY;
  }, [isFollowing, followLine]);

  // Unmount safety
  useEffect(() => stopFollow, [stopFollow]);

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
    setIsFollowing(false);
    setFollowLine(0);
    lineYsRef.current.clear();
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
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <Text style={[styles.error, { color: theme.danger }]}>
          Couldn't load song: {state.message}
        </Text>
      </View>
    );
  }

  const headerTitle = state.meta.number !== null
    ? `${state.meta.number}. ${state.meta.title}`
    : state.meta.title;

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={styles.container}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <Stack.Screen options={{ title: headerTitle }} />
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.text }]}>{state.meta.title}</Text>
        <Pressable
          onPress={() => setSetlistSheetOpen(true)}
          style={({ pressed }) => [
            styles.setlistBtn,
            { borderColor: theme.border, backgroundColor: theme.inputBg },
            pressed && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add to setlist"
        >
          <Text style={[styles.setlistBtnText, { color: theme.text }]}>+ Setlist</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (typeof id === 'string') toggleFavorite(id);
          }}
          style={({ pressed }) => [styles.favBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          accessibilityState={{ selected: isFavorite }}
        >
          <Text style={[styles.favIcon, { color: isFavorite ? theme.accent : theme.textDim }]}>
            {isFavorite ? '★' : '☆'}
          </Text>
        </Pressable>
      </View>
      {typeof id === 'string' && (
        <AddToSetlistSheet
          songId={id}
          visible={setlistSheetOpen}
          onClose={() => setSetlistSheetOpen(false)}
        />
      )}
      <SongControls
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        isFollowing={isFollowing}
        onToggleFollow={toggleFollow}
      />
      {showStaves && state.abc !== null && (
        <AbcView
          abc={state.abc}
          transpose={transpose}
          fontSize={fontSize}
          isFollowing={isFollowing}
          tempo={state.meta.tempo ?? undefined}
          onBeat={onAbcBeat}
          onFollowEnd={onAbcFollowEnd}
        />
      )}
      {showStaves && state.staveUris.length > 0 && (
        <View style={styles.staves}>
          {state.staveUris.map((uri) => (
            <Image
              key={uri}
              source={{ uri }}
              style={[styles.stave, { backgroundColor: theme.bgAlt }]}
              resizeMode="contain"
              accessibilityLabel="Stave notation"
            />
          ))}
        </View>
      )}
      {/* SongView (lyrics+chords) renders when:
           - staves are off (the normal text view), OR
           - play mode is on (so the line highlight is visible even when
             the user has staves enabled — full note-on-staff highlighting
             would need abcjs TimingCallbacks, future work). */}
      {(!showStaves || isFollowing) && (
        <SongView
          song={state.song}
          highlightedLineIndex={isFollowing ? followLine : undefined}
          onLineLayout={onLineLayout}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  title: { fontSize: 22, fontWeight: '600', flex: 1 },
  setlistBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 6,
  },
  setlistBtnText: { fontSize: 13, fontWeight: '500' },
  favBtn: { padding: 4 },
  favIcon: { fontSize: 26, lineHeight: 28 },
  error: {},
  staves: { marginBottom: 16, gap: 6 },
  stave: { width: '100%', aspectRatio: 12 },
});
