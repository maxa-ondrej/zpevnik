/**
 * Simply-Sing-style pitch-bar karaoke timeline.
 *
 * Horizontal strip of colored rectangles — each note is a bar whose
 * height ENCODES pitch and width encodes duration. A fixed vertical
 * playhead sits at ~30% from the left; the whole strip translates
 * leftward as Play advances so the active note sits under the
 * playhead. Lyric syllables render below each bar.
 *
 * Driven by:
 *   - `notes`: flat per-note array from melody.json (pitch in MIDI,
 *     durationBeats in quarter-notes, lyric, syllabic, chord).
 *   - `noteIndex`: which note is currently under the playhead.
 *   - `isFollowing` + `tempo`: enables continuous rAF-driven scroll.
 *     Without them, the strip snaps to whichever beat noteIndex maps
 *     to (useful for paused / static preview).
 *
 * The continuous scroll re-anchors its time-clock to each `noteIndex`
 * change. Inside one note we advance `elapsedSec * (tempo / 60)` beats
 * from the note's start, clamped to the note's `durationBeats`. The
 * clamp matters: if abcjs is late firing the next `onNoteEvent` the
 * strip just parks at the note's end (which is exactly where the next
 * note starts) — so when the event finally arrives the strip continues
 * smoothly with no visible jump.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { transposeChord } from '../chordpro/transpose';
import { render as renderNotation } from '../chordpro/notation';
import type { MelodyNote, Syllabic } from '../melody/assemble';
import { useSettings } from '../store/settings';
import { useTheme } from '../store/theme';

// pxPerBeat is derived per-render from tempo + container width so the
// strip shows a roughly constant TARGET_VISIBLE_SECONDS of music at any
// tempo. Clamped to keep bars readable on very slow songs and from
// becoming too cramped on very fast ones. PX_PER_BEAT_FALLBACK is the
// pre-tempo-aware default — used before onLayout and when no tempo is
// available.
const PX_PER_BEAT_FALLBACK = 80;
const PX_PER_BEAT_MIN = 40;
const PX_PER_BEAT_MAX = 120;
const TARGET_VISIBLE_SECONDS = 3;
const BAR_HEIGHT = 14;         // pill bar thickness for pitched notes
const REST_HEIGHT = 4;         // thinner line for rests — visually quiet
// Vertical zone the bars occupy. Smaller in landscape so the strip
// doesn't crowd out the top bar + bottom controls on a short screen.
const BAR_AREA_HEIGHT_PORTRAIT = 200;
const BAR_AREA_HEIGHT_LANDSCAPE = 140;
const CHORD_ROW_HEIGHT = 22;   // top strip reserved for chord labels
const LYRIC_GAP = 12;          // px between bar bottom and lyric text
const PLAYHEAD_OFFSET_RATIO = 0.3; // x-fraction from left where the playhead sits

interface PitchTimelineViewProps {
  notes: MelodyNote[];
  /** Index of the active note (< 0 → before the first note). The
   *  playhead is centred on this note's start time. */
  noteIndex: number;
  /** When true, drive the strip continuously via rAF interpolated
   *  inside the current note. When false (or tempo missing), the
   *  strip snaps to the noteIndex-implied beat. */
  isFollowing?: boolean;
  /** Quarter-notes per minute. Required for smooth scroll; without it
   *  the component falls back to snap-to-note even if isFollowing. */
  tempo?: number;
  /** Optional override for the container width — used to size the
   *  playhead's absolute x position. When omitted, the component
   *  measures itself via onLayout. */
  viewportWidth?: number;
}

export function PitchTimelineView({
  notes,
  noteIndex,
  isFollowing,
  tempo,
  viewportWidth,
}: PitchTimelineViewProps) {
  const theme = useTheme();
  const notation = useSettings((s) => s.notation);
  const transpose = useSettings((s) => s.transpose);

  // Pick a bar-area height that fits the current orientation. Landscape
  // phones are short vertically, so a 200px strip pushes against the
  // top + bottom UI; 140px leaves a useful margin.
  const { width: winW, height: winH } = useWindowDimensions();
  const barAreaHeight =
    winW > winH ? BAR_AREA_HEIGHT_LANDSCAPE : BAR_AREA_HEIGHT_PORTRAIT;
  const stripHeight = barAreaHeight + LYRIC_GAP + 32;

  // Precompute: cumulative start time (in beats) of each note,
  // total song time, and pitch range for the y-mapping.
  const layout = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (const n of notes) {
      starts.push(acc);
      acc += n.durationBeats;
    }
    const totalBeats = acc;

    let minPitch = Infinity;
    let maxPitch = -Infinity;
    for (const n of notes) {
      if (n.pitch !== null) {
        if (n.pitch < minPitch) minPitch = n.pitch;
        if (n.pitch > maxPitch) maxPitch = n.pitch;
      }
    }
    if (!isFinite(minPitch)) {
      minPitch = 60;
      maxPitch = 72;
    }
    if (minPitch === maxPitch) {
      // Avoid divide-by-zero; pad by an octave so the lone pitch
      // sits in the middle of the bar area.
      minPitch -= 6;
      maxPitch += 6;
    }
    return { starts, totalBeats, minPitch, maxPitch };
  }, [notes]);

  // Y-coordinate for a given MIDI pitch — higher pitch = smaller y
  // (toward the top of the bar area). Reserves CHORD_ROW_HEIGHT at
  // the top so the highest-pitched bars don't collide with chord
  // labels. Rests are pinned to the bottom row as a thin line.
  const pitchToY = (pitch: number | null): number => {
    if (pitch === null) return barAreaHeight - REST_HEIGHT - 4;
    const span = layout.maxPitch - layout.minPitch;
    const norm = (pitch - layout.minPitch) / span; // 0..1
    const usable = barAreaHeight - BAR_HEIGHT - CHORD_ROW_HEIGHT;
    // Invert so high pitch = small y; offset by chord-row reservation.
    return CHORD_ROW_HEIGHT + Math.round(usable * (1 - norm));
  };

  // Current play time in beats — the start time of the active note.
  // When noteIndex is past the end, pin to the end so the strip
  // doesn't keep scrolling into empty space.
  const currentBeat = useMemo(() => {
    if (notes.length === 0) return 0;
    if (noteIndex < 0) return 0;
    if (noteIndex >= notes.length) return layout.totalBeats;
    return layout.starts[noteIndex] ?? 0;
  }, [noteIndex, notes, layout]);

  // Currently-sounding chord = the most recent chord-change note at or
  // before the playhead. `note.chord` is set only on the note where
  // the chord changes; downstream notes inherit it implicitly. We
  // need this index so the chord label currently above the playhead
  // can be styled "active" while past chord changes are dimmed.
  const activeChordIdx = useMemo(() => {
    if (noteIndex < 0) return -1;
    const start = Math.min(noteIndex, notes.length - 1);
    for (let i = start; i >= 0; i -= 1) {
      if (notes[i]?.chord) return i;
    }
    return -1;
  }, [noteIndex, notes]);

  // translateX = playhead position - currentBeat * pxPerBeat
  // (so currentBeat-th beat ends up at playhead x).
  // Container width is measured via onLayout; an explicit
  // `viewportWidth` prop overrides the measurement (useful for tests
  // or when the parent already knows the exact size). Before the
  // first layout pass we hold `measuredWidth === 0` and gate the
  // strip render below so the playhead never lands at the wrong x.
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const containerWidth =
    viewportWidth && viewportWidth > 0 ? viewportWidth : measuredWidth;
  const playheadX = containerWidth * PLAYHEAD_OFFSET_RATIO;

  // Tempo-aware pixel scale: target ~TARGET_VISIBLE_SECONDS of music
  // on screen. fast tempo → fewer pixels per beat (more beats fit);
  // slow tempo → more pixels per beat. Clamped so bars don't get
  // unreadably tight or absurdly stretched.
  const pxPerBeat = useMemo(() => {
    if (containerWidth <= 0 || !tempo || tempo <= 0) {
      return PX_PER_BEAT_FALLBACK;
    }
    const raw = (containerWidth / TARGET_VISIBLE_SECONDS) * (60 / tempo);
    return Math.max(PX_PER_BEAT_MIN, Math.min(PX_PER_BEAT_MAX, raw));
  }, [containerWidth, tempo]);

  const snapTargetX = playheadX - currentBeat * pxPerBeat;

  // useNativeDriver: false throughout — the smooth-scroll path needs
  // setValue() per frame from the JS thread, and a single Animated.Value
  // can't legally mix native and non-native drivers. The cost is one
  // bridge call per frame on a single transform, which RN handles fine.
  const translateX = useRef(new Animated.Value(snapTargetX)).current;

  // rAF anchor: when did the current note start playing? Reset on
  // every noteIndex change AND on every isFollowing flip (so resuming
  // Play doesn't think we're mid-note from before the pause).
  const noteIndexRef = useRef(noteIndex);
  const noteStartedAtRef = useRef<number>(Date.now());
  useEffect(() => {
    noteIndexRef.current = noteIndex;
    noteStartedAtRef.current = Date.now();
  }, [noteIndex, isFollowing]);

  // Continuous rAF-driven scroll. Active only while Play is running
  // AND we have a tempo to convert elapsed seconds → beats. Reads
  // noteIndex from a ref so per-event noteIndex changes don't
  // cancel + restart the loop.
  useEffect(() => {
    if (!isFollowing || !tempo || tempo <= 0) return;
    if (notes.length === 0) return;
    let raf = 0;
    const tick = () => {
      const idx = noteIndexRef.current;
      if (idx >= 0 && idx < notes.length) {
        const noteBeatStart = layout.starts[idx] ?? 0;
        const noteDuration = notes[idx]?.durationBeats ?? 0;
        const elapsedSec = (Date.now() - noteStartedAtRef.current) / 1000;
        const elapsedBeats = Math.min(
          elapsedSec * (tempo / 60),
          noteDuration,
        );
        const beats = noteBeatStart + elapsedBeats;
        translateX.setValue(playheadX - beats * pxPerBeat);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isFollowing, tempo, notes, layout, playheadX, pxPerBeat, translateX]);

  // Snap path — handles initial mount, paused-state parking, and the
  // case where no tempo was provided. Skipped while rAF is driving.
  // The cleanup stops the in-flight tween so it doesn't keep writing
  // setValue while the rAF loop is also driving translateX.
  useEffect(() => {
    if (isFollowing && tempo && tempo > 0) return;
    const anim = Animated.timing(translateX, {
      toValue: snapTargetX,
      duration: 160,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [isFollowing, tempo, snapTargetX, translateX]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== measuredWidth) setMeasuredWidth(w);
  };

  if (notes.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.bgAlt }]}>
        <Text style={{ color: theme.textMuted }}>No notes in this song.</Text>
      </View>
    );
  }

  // Gate the strip until we know the container width — without it
  // the playhead's absolute x would resolve to 0 and the strip would
  // mount in the wrong place for one frame before snapping back.
  const ready = containerWidth > 0;

  return (
    <View
      style={[styles.container, { height: stripHeight, backgroundColor: theme.bgAlt }]}
      onLayout={handleLayout}
    >
      {ready ? (
        <>
      <View style={[styles.barArea, { height: barAreaHeight }]}>
        <Animated.View
          style={{ transform: [{ translateX }] }}
        >
          <View style={[styles.strip, { height: stripHeight }]}>
            {/*
              Bars / chords / lyrics are rendered via memo'd
              subcomponents below, with a stable `state` prop
              (past/active/future). When noteIndex advances by 1, only
              the bar transitioning out of active and the bar entering
              active actually re-render — every other item's props are
              referentially unchanged, so React.memo bails out. This is
              what keeps the rAF loop from stalling at each event.
            */}
            {notes.map((note, i) => {
              const start = layout.starts[i] ?? 0;
              const x = start * pxPerBeat;
              const w = note.durationBeats * pxPerBeat - 2; // small gap
              const y = pitchToY(note.pitch);
              const isRest = note.pitch === null;
              const state: PastActiveFuture =
                i < noteIndex
                  ? 'past'
                  : i === noteIndex
                    ? 'active'
                    : 'future';
              return (
                <Bar
                  key={i}
                  x={x}
                  y={y}
                  w={w}
                  state={state}
                  isRest={isRest}
                  accent={theme.accent}
                  borderSoft={theme.borderSoft}
                />
              );
            })}
            {notes.map((note, i) => {
              if (!note.chord) return null;
              const start = layout.starts[i] ?? 0;
              const x = start * pxPerBeat;
              const state: PastActiveFuture =
                i < activeChordIdx
                  ? 'past'
                  : i === activeChordIdx
                    ? 'active'
                    : 'future';
              return (
                <ChordLabel
                  key={`c-${i}`}
                  x={x}
                  chord={note.chord}
                  transpose={transpose}
                  notation={notation}
                  state={state}
                  accent={theme.accent}
                  text={theme.text}
                  textMuted={theme.textMuted}
                />
              );
            })}
            {notes.map((note, i) => {
              if (!note.lyric) return null;
              const start = layout.starts[i] ?? 0;
              const x = start * pxPerBeat;
              const w = note.durationBeats * pxPerBeat;
              const filled = i <= noteIndex;
              const isActiveNote = i === noteIndex;
              return (
                <LyricCell
                  key={`l-${i}`}
                  x={x}
                  w={w}
                  top={barAreaHeight + LYRIC_GAP - 8}
                  lyric={note.lyric}
                  syllabic={note.syllabic}
                  filled={filled}
                  active={isActiveNote}
                  accent={theme.accent}
                  text={theme.text}
                />
              );
            })}
          </View>
        </Animated.View>
      </View>
      {/* Fixed playhead — vertical line at PLAYHEAD_OFFSET_RATIO of the
          container width. Stays put while the strip behind it slides. */}
      <View
        pointerEvents="none"
        style={[
          styles.playhead,
          { left: playheadX, backgroundColor: theme.accent },
        ]}
      />
        </>
      ) : null}
    </View>
  );
}

type PastActiveFuture = 'past' | 'active' | 'future';

// Each per-note child is wrapped in React.memo and receives only
// primitive props. When noteIndex advances, the parent computes a new
// `state` for every child, but for all but two children that new value
// equals the previous one — the memo's shallow compare skips the render.

interface BarProps {
  x: number;
  y: number;
  w: number;
  state: PastActiveFuture;
  isRest: boolean;
  accent: string;
  borderSoft: string;
}

const Bar = memo(function Bar({
  x,
  y,
  w,
  state,
  isRest,
  accent,
  borderSoft,
}: BarProps) {
  const height = isRest ? REST_HEIGHT : BAR_HEIGHT;
  const barColor = isRest
    ? borderSoft
    : state === 'future'
      ? borderSoft
      : accent;
  const opacity = isRest
    ? state === 'active'
      ? 0.7
      : 0.35
    : state === 'past'
      ? 0.55
      : 1;
  return (
    <View
      style={[
        styles.bar,
        {
          left: x,
          top: y,
          width: Math.max(2, w),
          height,
          borderRadius: height / 2,
          backgroundColor: barColor,
          opacity,
        },
      ]}
    />
  );
});

interface ChordLabelProps {
  x: number;
  chord: string;
  transpose: number;
  notation: 'cs' | 'en';
  state: PastActiveFuture;
  accent: string;
  text: string;
  textMuted: string;
}

const ChordLabel = memo(function ChordLabel({
  x,
  chord,
  transpose,
  notation,
  state,
  accent,
  text,
  textMuted,
}: ChordLabelProps) {
  const label = renderNotation(transposeChord(chord, transpose), notation);
  const color =
    state === 'active' ? accent : state === 'past' ? textMuted : text;
  return (
    <View style={[styles.chordCell, { left: x }]}>
      <Text
        style={[
          styles.chord,
          {
            color,
            opacity: state === 'past' ? 0.55 : 1,
            fontWeight: state === 'active' ? '700' : '600',
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
});

interface LyricCellProps {
  x: number;
  w: number;
  top: number;
  lyric: string;
  syllabic: Syllabic | null;
  filled: boolean;
  active: boolean;
  accent: string;
  text: string;
}

const LyricCell = memo(function LyricCell({
  x,
  w,
  top,
  lyric,
  syllabic,
  filled,
  active,
  accent,
  text,
}: LyricCellProps) {
  const display =
    syllabic === 'begin' || syllabic === 'middle' ? lyric + '-' : lyric;
  return (
    <View style={[styles.lyricCell, { left: x, width: w, top }]}>
      <Text
        style={[
          styles.lyric,
          {
            color: filled ? accent : text,
            fontWeight: active ? '700' : '500',
          },
        ]}
        numberOfLines={1}
      >
        {display}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    // height comes from inline style (orientation-dependent).
    overflow: 'hidden',
    borderRadius: 12,
    marginBottom: 16,
  },
  barArea: {
    // height from inline style.
    overflow: 'visible',
  },
  strip: {
    position: 'relative',
    // height from inline style.
  },
  bar: {
    position: 'absolute',
    // height + borderRadius come from inline style so rests can render
    // as a thinner line than pitched notes.
  },
  chordCell: {
    position: 'absolute',
    top: 0,
    height: CHORD_ROW_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chord: {
    fontSize: 13,
  },
  lyricCell: {
    position: 'absolute',
    // top from inline style (depends on dynamic barAreaHeight).
    alignItems: 'center',
  },
  lyric: {
    fontSize: 14,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    opacity: 0.7,
  },
  empty: {
    width: '100%',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginBottom: 16,
  },
});
