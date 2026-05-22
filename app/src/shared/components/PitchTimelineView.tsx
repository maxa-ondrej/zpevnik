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

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import type { MelodyNote } from '../melody/assemble';
import { useTheme } from '../store/theme';

const PX_PER_BEAT = 80;        // horizontal pixels per quarter-note
const BAR_HEIGHT = 14;         // pill bar thickness
const BAR_AREA_HEIGHT = 200;   // vertical zone the bars can occupy
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
  // (top of the bar area). Rests are pinned to the bottom-middle.
  const pitchToY = (pitch: number | null): number => {
    if (pitch === null) return BAR_AREA_HEIGHT - BAR_HEIGHT - 4;
    const span = layout.maxPitch - layout.minPitch;
    const norm = (pitch - layout.minPitch) / span; // 0..1
    const usable = BAR_AREA_HEIGHT - BAR_HEIGHT;
    // Invert so high pitch = small y.
    return Math.round(usable * (1 - norm));
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
  const snapTargetX = playheadX - currentBeat * PX_PER_BEAT;

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
        translateX.setValue(playheadX - beats * PX_PER_BEAT);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isFollowing, tempo, notes, layout, playheadX, translateX]);

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
      style={[styles.container, { backgroundColor: theme.bgAlt }]}
      onLayout={handleLayout}
    >
      {ready ? (
        <>
      <View style={styles.barArea}>
        <Animated.View
          style={{ transform: [{ translateX }] }}
        >
          <View style={styles.strip}>
            {notes.map((note, i) => {
              const start = layout.starts[i] ?? 0;
              const x = start * PX_PER_BEAT;
              const w = note.durationBeats * PX_PER_BEAT - 2; // small gap
              const y = pitchToY(note.pitch);
              const past = i < noteIndex;
              const active = i === noteIndex;
              const isRest = note.pitch === null;
              const barColor = isRest
                ? theme.borderSoft
                : active
                  ? theme.accent
                  : past
                    ? theme.accent
                    : theme.borderSoft;
              return (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    {
                      left: x,
                      top: y,
                      width: Math.max(2, w),
                      backgroundColor: barColor,
                      opacity: past && !active ? 0.55 : 1,
                    },
                  ]}
                />
              );
            })}
            {notes.map((note, i) => {
              if (!note.lyric) return null;
              const start = layout.starts[i] ?? 0;
              const x = start * PX_PER_BEAT;
              const w = note.durationBeats * PX_PER_BEAT;
              const filled = i <= noteIndex;
              return (
                <View
                  key={`l-${i}`}
                  style={[styles.lyricCell, { left: x, width: w }]}
                >
                  <Text
                    style={[
                      styles.lyric,
                      {
                        color: filled ? theme.accent : theme.text,
                        fontWeight: i === noteIndex ? '700' : '500',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {note.syllabic === 'begin' || note.syllabic === 'middle'
                      ? note.lyric + '-'
                      : note.lyric}
                  </Text>
                </View>
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

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: BAR_AREA_HEIGHT + LYRIC_GAP + 32,
    overflow: 'hidden',
    borderRadius: 12,
    marginBottom: 16,
  },
  barArea: {
    height: BAR_AREA_HEIGHT,
    overflow: 'visible',
  },
  strip: {
    position: 'relative',
    height: BAR_AREA_HEIGHT + LYRIC_GAP + 32,
  },
  bar: {
    position: 'absolute',
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
  },
  lyricCell: {
    position: 'absolute',
    top: BAR_AREA_HEIGHT + LYRIC_GAP - 8,
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
