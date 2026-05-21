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

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
}

export function BottomBar({
  isFollowing,
  onToggleFollow,
  isPlaying,
  onTogglePlay,
}: BottomBarProps) {
  const [expanded, setExpanded] = useState(false);
  const showStaves = useSettings((s) => s.showStaves);
  const setShowStaves = useSettings((s) => s.setShowStaves);
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.bg, borderTopColor: theme.borderSoft },
      ]}
    >
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
        <BarBtn
          theme={theme}
          active={expanded}
          onPress={() => setExpanded((v) => !v)}
          label={expanded ? '⌄' : '⌃'}
          accessibilityLabel={expanded ? 'Hide more controls' : 'Show more controls'}
          accessibilityRole="button"
          flex={0.5}
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
