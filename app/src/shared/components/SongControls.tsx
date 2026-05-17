import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSettings } from '../store/settings';
import { useTheme, type Theme } from '../store/theme';

const FONT_MIN = 10;
const FONT_MAX = 32;
const FONT_STEP = 2;
const TRANSPOSE_MIN = -11;
const TRANSPOSE_MAX = 11;
const SCROLL_MIN = 0;
const SCROLL_MAX = 200;
const SCROLL_STEP = 10;

interface SongControlsProps {
  /** When provided, renders the autoscroll play/pause + speed stepper group. */
  isPlaying?: boolean;
  onTogglePlay?: () => void;
}

export function SongControls({ isPlaying, onTogglePlay }: SongControlsProps = {}) {
  const theme = useTheme();
  const {
    notation,
    transpose,
    fontSize,
    showStaves,
    darkMode,
    autoScrollSpeed,
    setNotation,
    setTranspose,
    setFontSize,
    setShowStaves,
    setDarkMode,
    setAutoScrollSpeed,
  } = useSettings();

  const showAutoScroll = onTogglePlay !== undefined;

  return (
    <View style={[styles.bar, { borderColor: theme.borderSoft }]}>
      <Group label="Notation" theme={theme}>
        <Toggle theme={theme} active={notation === 'cs'} onPress={() => setNotation('cs')} label="Cs" />
        <Toggle theme={theme} active={notation === 'en'} onPress={() => setNotation('en')} label="En" />
      </Group>
      <Group label="Transpose" theme={theme}>
        <Step
          theme={theme}
          onPress={() => setTranspose(Math.max(TRANSPOSE_MIN, transpose - 1))}
          disabled={transpose <= TRANSPOSE_MIN}
          label="−"
        />
        <Text style={[styles.value, { color: theme.text }]}>
          {transpose > 0 ? `+${transpose}` : transpose}
        </Text>
        <Step
          theme={theme}
          onPress={() => setTranspose(Math.min(TRANSPOSE_MAX, transpose + 1))}
          disabled={transpose >= TRANSPOSE_MAX}
          label="+"
        />
      </Group>
      <Group label="Size" theme={theme}>
        <Step
          theme={theme}
          onPress={() => setFontSize(Math.max(FONT_MIN, fontSize - FONT_STEP))}
          disabled={fontSize <= FONT_MIN}
          label="A−"
        />
        <Step
          theme={theme}
          onPress={() => setFontSize(Math.min(FONT_MAX, fontSize + FONT_STEP))}
          disabled={fontSize >= FONT_MAX}
          label="A+"
        />
      </Group>
      <Group label="Staves" theme={theme}>
        <Toggle
          theme={theme}
          active={showStaves}
          onPress={() => setShowStaves(!showStaves)}
          label={showStaves ? 'On' : 'Off'}
        />
      </Group>
      <Group label="Theme" theme={theme}>
        <Toggle theme={theme} active={darkMode === 'light'} onPress={() => setDarkMode('light')} label="☀" />
        <Toggle theme={theme} active={darkMode === 'dark'} onPress={() => setDarkMode('dark')} label="☾" />
        <Toggle theme={theme} active={darkMode === 'system'} onPress={() => setDarkMode('system')} label="Auto" />
      </Group>
      {showAutoScroll && (
        <Group label="Autoscroll" theme={theme}>
          <Toggle
            theme={theme}
            active={isPlaying ?? false}
            onPress={onTogglePlay!}
            label={isPlaying ? '⏸' : '▶'}
          />
          <Step
            theme={theme}
            onPress={() => setAutoScrollSpeed(Math.max(SCROLL_MIN, autoScrollSpeed - SCROLL_STEP))}
            disabled={autoScrollSpeed <= SCROLL_MIN}
            label="−"
          />
          <Text style={[styles.value, { color: theme.text }]}>{autoScrollSpeed}</Text>
          <Step
            theme={theme}
            onPress={() => setAutoScrollSpeed(Math.min(SCROLL_MAX, autoScrollSpeed + SCROLL_STEP))}
            disabled={autoScrollSpeed >= SCROLL_MAX}
            label="+"
          />
        </Group>
      )}
    </View>
  );
}

function Group({ label, children, theme }: { label: string; children: React.ReactNode; theme: Theme }) {
  return (
    <View style={styles.group}>
      <Text style={[styles.groupLabel, { color: theme.textMuted }]}>{label}</Text>
      <View style={styles.groupRow}>{children}</View>
    </View>
  );
}

function Toggle({
  active,
  onPress,
  label,
  theme,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
  theme: Theme;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.btn,
        { borderColor: theme.border, backgroundColor: theme.inputBg },
        active && { backgroundColor: theme.accent, borderColor: theme.accent },
      ]}
      accessibilityRole="button"
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

function Step({
  onPress,
  label,
  disabled,
  theme,
}: {
  onPress: () => void;
  label: string;
  disabled?: boolean;
  theme: Theme;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.btn,
        { borderColor: theme.border, backgroundColor: theme.inputBg },
        disabled && { backgroundColor: theme.bgAlt, borderColor: theme.borderSoft },
      ]}
      accessibilityRole="button"
    >
      <Text
        style={[
          styles.btnText,
          { color: theme.text },
          disabled && { color: theme.textDim },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingVertical: 8,
    marginBottom: 12,
    borderBottomWidth: 1,
  },
  group: { gap: 2 },
  groupLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  groupRow: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    minWidth: 30,
    alignItems: 'center',
  },
  btnText: { fontSize: 13 },
  value: { fontSize: 13, minWidth: 26, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
