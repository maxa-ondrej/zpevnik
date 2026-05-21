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

import { useMemo } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '../store/settings';
import { useTheme, type Theme } from '../store/theme';
import { SongControls } from './SongControls';

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
  // Local alias for ergonomics inside the gesture handler.
  const setExpanded = onExpandedChange;
  const showStaves = useSettings((s) => s.showStaves);
  const setShowStaves = useSettings((s) => s.setShowStaves);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // Pan responder for swipe-up to expand / swipe-down to collapse.
  // Threshold is small (24px) so a casual flick works, but we
  // require some movement so a normal button tap on a child still
  // routes to the Pressable's press handler.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
        onPanResponderRelease: (_, g) => {
          if (g.dy < -24) setExpanded(true);
          else if (g.dy > 24) setExpanded(false);
        },
      }),
    [],
  );

  return (
    <View
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
      {/* Drag handle. The PanResponder lives on the outer View (so it
          can claim the gesture from any touch on the bar) and a
          Pressable inside provides the tap-to-toggle fallback +
          accessibility role. */}
      <View {...panResponder.panHandlers} style={styles.handleHit}>
        <Pressable
          onPress={() => setExpanded(!expanded)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Hide more controls' : 'Show more controls'}
          accessibilityHint="Swipe up to expand, down to collapse"
          accessibilityState={{ expanded }}
        >
          <View style={[styles.handle, { backgroundColor: theme.borderSoft }]} />
        </Pressable>
      </View>

      {expanded && (
        <View
          style={[
            styles.expandedPanel,
            { borderBottomColor: theme.borderSoft, backgroundColor: theme.bgAlt },
          ]}
        >
          <SongControls
            isPlaying={isPlaying}
            onTogglePlay={onTogglePlay}
            isFollowing={isFollowing}
            onToggleFollow={onToggleFollow}
          />
        </View>
      )}
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
  flex = 1,
}: {
  theme: Theme;
  active: boolean;
  onPress: () => void;
  label: string;
  accessibilityLabel: string;
  accessibilityRole?: 'button' | 'link';
  flex?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { flex, borderColor: theme.border, backgroundColor: theme.inputBg },
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
    borderBottomWidth: 1,
    maxHeight: 320,
  },
  alwaysRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'stretch',
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
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
