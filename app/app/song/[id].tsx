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
import { BottomBar } from '../../src/shared/components/BottomBar';
import { KaraokeView } from '../../src/shared/components/KaraokeView';
import { SongView } from '../../src/shared/components/SongView';
import { parseChordPro, type ParsedSong } from '../../src/shared/chordpro/parser';
import { songFetch } from '../../src/shared/assets/songFetch';
import { assembleAbc, type Melody } from '../../src/shared/melody/assemble';
import { totalBeatsFromMelody } from '../../src/shared/melody/totalBeats';
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
      /** Total beat count derived from melody.json's bar count + meter. */
      totalBeats: number | null;
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
    const r = await songFetch(`${dir}/melody.json`);
    if (!r.ok) return null;
    return (await r.json()) as Melody;
  } catch {
    return null;
  }
}

export default function SongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const viewMode = useSettings((s) => s.viewMode);
  const showStaves = viewMode === 'staves';
  const transpose = useSettings((s) => s.transpose);
  const fontSize = useSettings((s) => s.fontSize);
  const autoScrollSpeed = useSettings((s) => s.autoScrollSpeed);
  const markRecent = useRecents((s) => s.mark);
  const favorites = useFavorites((s) => s.favorites);
  const toggleFavorite = useFavorites((s) => s.toggle);
  const isFavorite = typeof id === 'string' && favorites.includes(id);
  const [setlistSheetOpen, setSetlistSheetOpen] = useState(false);
  // BottomBar expand state lifted here so we can render a tap-
  // outside-to-close backdrop over the page content.
  const [controlsExpanded, setControlsExpanded] = useState(false);
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
  /** Y-coordinate of each rendered line *relative to SongView*, populated
   *  via onLineLayout from below. Combined with `songViewYRef` (which holds
   *  SongView's own y inside the outer ScrollView) to compute an absolute
   *  scroll target. */
  const lineYsRef = useRef<Map<number, number>>(new Map());
  const songViewYRef = useRef(0);
  /** AbcView's y inside the outer ScrollView, captured via onLayout on the
   *  wrapping View. Combined with abcjs's reported staff-line y. */
  const abcViewYRef = useRef(0);
  /** Last staff-line y we already scrolled to — abcjs fires eventCallback
   *  per note, but the y only meaningfully changes when the cursor crosses
   *  to a new music line. We compare against this to skip same-line notes. */
  const lastFollowYRef = useRef<number | null>(null);
  const followIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopFollow = useCallback(() => {
    if (followIntervalRef.current !== null) {
      clearInterval(followIntervalRef.current);
      followIntervalRef.current = null;
    }
  }, []);

  const toggleFollow = useCallback(() => {
    setIsFollowing((f) => {
      if (!f) {
        // Restart from the top on play press.
        setFollowLine(0);
        lastFollowYRef.current = null;
      }
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
  // True whenever an AbcView is mounted somewhere on screen — that
  // includes the staves view AND karaoke view (which renders an
  // inline AbcView above its lyric strip).
  const useAbcjsTiming =
    state.kind === 'ready' &&
    state.abc !== null &&
    (viewMode === 'staves' || viewMode === 'karaoke');

  useEffect(() => {
    if (!isFollowing || useAbcjsTiming) {
      stopFollow();
      return;
    }
    const meta = state.kind === 'ready' ? state.meta : null;
    const bpm = meta?.tempo ?? 100;
    // Prefer the song-length-proportional cadence (totalBeats / lineCount)
    // when melody.json gave us a real measure count. Falls back to the
    // assume-4/4 default when no melody is available.
    const totalBeats = state.kind === 'ready' ? state.totalBeats : null;
    const totalLines = state.kind === 'ready' ? state.song.lines.length : 0;
    const beatsPerLine =
      totalBeats !== null && totalLines > 0 ? totalBeats / totalLines : 4;
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

  // Scroll the outer ScrollView when the staff line under the cursor
  // changes. AbcView fires eventCallback per note; the y stays put while
  // notes are on the same line, so we only act when the new y differs
  // from `lastFollowYRef.current` by more than a small threshold (10 px
  // is plenty since music lines are at least ~40 px tall).
  const onAbcStaffLineChange = useCallback((yInsideAbcView: number) => {
    const last = lastFollowYRef.current;
    if (last !== null && Math.abs(yInsideAbcView - last) < 10) return;
    lastFollowYRef.current = yInsideAbcView;

    const absoluteY = abcViewYRef.current + yInsideAbcView;
    const headOffset = Math.max(80, layoutHeightRef.current * 0.25);
    const targetY = Math.max(0, absoluteY - headOffset);
    scrollRef.current?.scrollTo({ y: targetY, animated: true });
    currentYRef.current = targetY;
    expectedYRef.current = targetY;
  }, []);

  // When the followed line advances, scroll so it sits ~30% from the top
  // — ONLY if the line is currently outside the viewport. This avoids
  // overriding manual scroll on every beat while still bringing the
  // highlight back into view when it drifts off-screen.
  useEffect(() => {
    if (!isFollowing) return;
    const localY = lineYsRef.current.get(followLine);
    if (localY === undefined) return;
    const absoluteY = songViewYRef.current + localY;

    const viewportTop = currentYRef.current;
    const viewportBottom = viewportTop + layoutHeightRef.current;
    const inView = absoluteY >= viewportTop + 20 && absoluteY <= viewportBottom - 60;
    if (inView) return;

    const headOffset = Math.max(60, layoutHeightRef.current * 0.3);
    const targetY = Math.max(0, absoluteY - headOffset);
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
      // Manual scroll override while autoscroll is running.
      setIsPlaying(false);
      currentYRef.current = y;
    } else if (
      isFollowing &&
      Math.abs(y - expectedYRef.current) > 32
    ) {
      // Manual scroll while follow mode is running — adopt the new
      // position but DON'T pause follow; the user might just be looking
      // ahead. The next followLine advance will only re-scroll if the
      // highlight leaves the viewport.
      currentYRef.current = y;
      expectedYRef.current = y;
    } else {
      currentYRef.current = y;
    }
  }, [isFollowing]);

  // --- Song loading -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setIsPlaying(false);
    setIsFollowing(false);
    setFollowLine(0);
    lineYsRef.current.clear();
    songViewYRef.current = 0;
    abcViewYRef.current = 0;
    lastFollowYRef.current = null;
    currentYRef.current = 0;
    expectedYRef.current = 0;
    contentHeightRef.current = 0;
    layoutHeightRef.current = 0;
    (async () => {
      try {
        const indexRes = await songFetch('/songs/index.json');
        if (!indexRes.ok) throw new Error(`index HTTP ${indexRes.status}`);
        const index = (await indexRes.json()) as SongIndex;
        const meta = index.songs.find((s) => s.id === id);
        if (!meta) throw new Error(`song ${id} not in index`);

        const dir = `/songs/${meta.id}-${meta.slug}`;
        const [choRes, melody] = await Promise.all([
          songFetch(`${dir}/song.cho`),
          fetchOptionalMelody(dir),
        ]);
        if (!choRes.ok) throw new Error(`song.cho HTTP ${choRes.status}`);
        const cho = await choRes.text();
        const song = parseChordPro(cho);
        const staveUris = staveUrisFor(dir, meta.staveCount);
        const abc = melody ? assembleAbc(melody) : null;
        const totalBeats = totalBeatsFromMelody(melody);

        if (!cancelled) {
          setState({ kind: 'ready', meta, song, staveUris, abc, totalBeats });
        }
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
    <View style={[styles.page, { backgroundColor: theme.bg }]}>
      <Stack.Screen options={{ title: headerTitle }} />

      {/* Fixed top bar — title row + controls. Doesn't scroll with content. */}
      <View style={[styles.topBar, { borderBottomColor: theme.borderSoft, backgroundColor: theme.bg }]}>
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
      </View>

      {typeof id === 'string' && (
        <AddToSetlistSheet
          songId={id}
          visible={setlistSheetOpen}
          onClose={() => setSetlistSheetOpen(false)}
        />
      )}

      {/* Only the content scrolls. */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {showStaves && state.abc !== null && (
          <View
            onLayout={(ev) => {
              abcViewYRef.current = ev.nativeEvent.layout.y;
            }}
          >
            <AbcView
              abc={state.abc}
              transpose={transpose}
              fontSize={fontSize}
              isFollowing={isFollowing}
              tempo={state.meta.tempo ?? undefined}
              onBeat={onAbcBeat}
              onFollowEnd={onAbcFollowEnd}
              onStaffLineChange={onAbcStaffLineChange}
            />
          </View>
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
        {/* SongView (lyrics+chords) renders ONLY when staves are off — the
             text doubles up with the staff's `w:` syllables, and during play
             we already get the per-note highlight on the staff itself.
             The wrapping View captures SongView's y inside the outer
             ScrollView so the line-fallback scroll target is absolute. */}
        {viewMode === 'lyrics' && (
          <View
            onLayout={(ev) => {
              songViewYRef.current = ev.nativeEvent.layout.y;
            }}
          >
            <SongView
              song={state.song}
              highlightedLineIndex={isFollowing ? followLine : undefined}
              onLineLayout={onLineLayout}
            />
          </View>
        )}
        {viewMode === 'karaoke' && (
          <KaraokeView
            song={state.song}
            currentLineIndex={isFollowing ? followLine : undefined}
            abc={state.abc}
            isFollowing={isFollowing}
            tempo={state.meta.tempo ?? undefined}
            onBeat={onAbcBeat}
            onFollowEnd={onAbcFollowEnd}
          />
        )}
      </ScrollView>

      {/* Tap-outside-to-close backdrop, only when the bar is expanded.
           Sits above the ScrollView but BELOW the bar's z-stack so
           the bar's own controls are still tappable. */}
      {controlsExpanded && (
        <Pressable
          onPress={() => setControlsExpanded(false)}
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel="Close controls"
        />
      )}

      <BottomBar
        isFollowing={isFollowing}
        onToggleFollow={toggleFollow}
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        expanded={controlsExpanded}
        onExpandedChange={setControlsExpanded}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
  },
  scrollArea: { flex: 1 },
  // Horizontal padding tightened so the staff can use almost the
  // full viewport width on phone — abcjs's own paddingleft is 0 too.
  scrollContent: { paddingHorizontal: 4, paddingVertical: 12 },
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
