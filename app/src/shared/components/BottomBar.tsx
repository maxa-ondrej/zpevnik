/**
 * Phone-first bottom bar. Three always-visible primary actions:
 *   ▶ Play / ⏸ Pause     — tempo-paced follow
 *   ♪ Staves / ✎ Lyrics  — toggle the main view
 *   ⌃ / ⌄                 — expand the full SongControls panel above
 *
 * When expanded, the bar grows upward to show the full SongControls
 * (Notation, Transpose, Capo, Size, Spacing, Staves, Theme, Play,
 * Autoscroll groups). Collapsing reclaims the screen space.
 *
 * Lives at the bottom of the song detail page; the rest of the page
 * is laid out above it via flex column, so content never overlaps.
 */

import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '../store/settings';
import { useTheme, type Theme } from '../store/theme';
import { SongControls } from './SongControls';

// Snap target for the fully-expanded panel. Roughly fits 3 rows of
// SongControls groups on a phone-width viewport.
const OPEN_HEIGHT = 240;

interface BottomBarProps {
  /** True while abcjs / setInterval follow is running. */
  isFollowing: boolean;
  onToggleFollow: () => void;
  /** True while constant-px-per-second auto-scroll is running. */
  isPlaying: boolean;
  onTogglePlay: () => void;
  /** Controlled expand state — lifted so the parent can render a
   *  tap-outside-to-close backdrop. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export function BottomBar({
  isFollowing,
  onToggleFollow,
  isPlaying,
  onTogglePlay,
  expanded,
  onExpandedChange,
}: BottomBarProps) {
  const showStaves = useSettings((s) => s.showStaves);
  const setShowStaves = useSettings((s) => s.setShowStaves);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // Animated height for the expandable panel — tracks the user's
  // finger during pan, snaps to OPEN_HEIGHT or 0 on release.
  const panelHeight = useRef(
    new Animated.Value(expanded ? OPEN_HEIGHT : 0),
  ).current;
  const baseHeightRef = useRef(0);

  // Keep the animated height in sync with the prop (e.g. tap-outside
  // backdrop sets expanded=false from the parent — animate down).
  useEffect(() => {
    Animated.timing(panelHeight, {
      toValue: expanded ? OPEN_HEIGHT : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [expanded, panelHeight]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        // Only claim the gesture once the finger actually moves — keeps
        // taps routing to the underlying Pressable children.
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          baseHeightRef.current =
            (panelHeight as unknown as { _value: number })._value;
        },
        onPanResponderMove: (_, g) => {
          const next = Math.max(
            0,
            Math.min(OPEN_HEIGHT, baseHeightRef.current - g.dy),
          );
          panelHeight.setValue(next);
        },
        onPanResponderRelease: () => {
          const finalH =
            (panelHeight as unknown as { _value: number })._value;
          const open = finalH > OPEN_HEIGHT / 2;
          Animated.timing(panelHeight, {
            toValue: open ? OPEN_HEIGHT : 0,
            duration: 160,
            useNativeDriver: false,
          }).start();
          onExpandedChange(open);
        },
      }),
    [panelHeight, onExpandedChange],
  );

  return (
    <View
      // Pan lives on the WHOLE bar so the user can drag from any
      // touch — including a Pressable child. PanResponder's
      // `onMoveShouldSetPanResponder` only claims the gesture once
      // the finger moves >8px on the Y axis, so a normal tap still
      // routes to the Pressable's onPress.
      {...panResponder.panHandlers}
      style={[
        styles.container,
        {
          backgroundColor: theme.bg,
          borderTopColor: theme.borderSoft,
          // Stay clear of the home indicator on iPhone but don't
          // burn the full inset — the bar already has its own
          // vertical padding inside the always-row.
          paddingBottom: Math.max(6, insets.bottom * 0.4),
        },
      ]}
    >
      {/* Drag handle — pill graphic + tap fallback. */}
      <Pressable
        onPress={() => onExpandedChange(!expanded)}
        style={styles.handleHit}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide more controls' : 'Show more controls'}
        accessibilityHint="Swipe up to expand, down to collapse"
        accessibilityState={{ expanded }}
      >
        <View style={[styles.handle, { backgroundColor: theme.borderSoft }]} />
      </Pressable>

      {/* Always-visible row sits ABOVE the expanding panel, so the
          row's position relative to the bar's top is fixed. The
          whole bar (handle + row + panel) translates together as
          panelHeight changes — gives a "sheet sliding up" feel
          rather than "panel revealing above a static row." */}
      <View style={styles.alwaysRow}>
        <BarBtn
          theme={theme}
          active={isFollowing}
          onPress={onToggleFollow}
          label={isFollowing ? '⏸  Pause' : '▶  Play'}
          accessibilityLabel={isFollowing ? 'Pause follow' : 'Start follow'}
        />
        <BarBtn
          theme={theme}
          active={showStaves}
          onPress={() => setShowStaves(!showStaves)}
          label={showStaves ? '♪  Staves' : '✎  Lyrics'}
          accessibilityLabel={showStaves ? 'Hide staves' : 'Show staves'}
        />
      </View>
      {/* Animated panel — height tracks the pan in real time, snaps
          to OPEN_HEIGHT or 0 on release. Always rendered so the
          height transition can interpolate smoothly. */}
      <Animated.View
        style={[
          styles.expandedPanel,
          {
            height: panelHeight,
            borderTopColor: theme.borderSoft,
            backgroundColor: theme.bgAlt,
          },
        ]}
      >
        <SongControls
          isPlaying={isPlaying}
          onTogglePlay={onTogglePlay}
          isFollowing={isFollowing}
          onToggleFollow={onToggleFollow}
        />
      </Animated.View>
    </View>
  );
}

function BarBtn({
  theme,
  active,
  onPress,
  label,
  accessibilityLabel,
  accessibilityRole = 'button',
}: {
  theme: Theme;
  active: boolean;
  onPress: () => void;
  label: string;
  accessibilityLabel: string;
  accessibilityRole?: 'button' | 'link';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { borderColor: theme.border, backgroundColor: theme.inputBg },
        active && { backgroundColor: theme.accent, borderColor: theme.accent },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[
          styles.btnText,
          { color: theme.text },
          active && { color: theme.accentText, fontWeight: '600' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
  },
  // Generous touch target so the user doesn't need to land on the
  // 4-pixel-tall pill exactly. PanResponder lives here.
  handleHit: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
  },
  expandedPanel: {
    paddingHorizontal: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  alwaysRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btn: {
    width: 120,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
