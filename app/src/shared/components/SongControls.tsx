import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSettings } from '../store/settings';

const FONT_MIN = 10;
const FONT_MAX = 32;
const FONT_STEP = 2;
const TRANSPOSE_MIN = -11;
const TRANSPOSE_MAX = 11;

export function SongControls() {
  const {
    notation,
    transpose,
    fontSize,
    showStaves,
    setNotation,
    setTranspose,
    setFontSize,
    setShowStaves,
  } = useSettings();

  return (
    <View style={styles.bar}>
      <Group label="Notation">
        <Toggle active={notation === 'cs'} onPress={() => setNotation('cs')} label="Cs" />
        <Toggle active={notation === 'en'} onPress={() => setNotation('en')} label="En" />
      </Group>
      <Group label="Transpose">
        <Step
          onPress={() => setTranspose(Math.max(TRANSPOSE_MIN, transpose - 1))}
          disabled={transpose <= TRANSPOSE_MIN}
          label="−"
        />
        <Text style={styles.value}>{transpose > 0 ? `+${transpose}` : transpose}</Text>
        <Step
          onPress={() => setTranspose(Math.min(TRANSPOSE_MAX, transpose + 1))}
          disabled={transpose >= TRANSPOSE_MAX}
          label="+"
        />
      </Group>
      <Group label="Size">
        <Step
          onPress={() => setFontSize(Math.max(FONT_MIN, fontSize - FONT_STEP))}
          disabled={fontSize <= FONT_MIN}
          label="A−"
        />
        <Step
          onPress={() => setFontSize(Math.min(FONT_MAX, fontSize + FONT_STEP))}
          disabled={fontSize >= FONT_MAX}
          label="A+"
        />
      </Group>
      <Group label="Staves">
        <Toggle active={showStaves} onPress={() => setShowStaves(!showStaves)} label={showStaves ? 'On' : 'Off'} />
      </Group>
    </View>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.groupRow}>{children}</View>
    </View>
  );
}

function Toggle({ active, onPress, label }: { active: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.btn, active && styles.btnActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.btnText, active && styles.btnTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Step({
  onPress,
  label,
  disabled,
}: {
  onPress: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, disabled && styles.btnDisabled]}
      accessibilityRole="button"
    >
      <Text style={[styles.btnText, disabled && styles.btnTextDisabled]}>{label}</Text>
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
    borderColor: '#eee',
  },
  group: { gap: 2 },
  groupLabel: { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  groupRow: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    minWidth: 30,
    alignItems: 'center',
  },
  btnActive: { backgroundColor: '#0a6', borderColor: '#0a6' },
  btnDisabled: { backgroundColor: '#f5f5f5', borderColor: '#eee' },
  btnText: { fontSize: 13, color: '#333' },
  btnTextActive: { color: '#fff', fontWeight: '600' },
  btnTextDisabled: { color: '#bbb' },
  value: { fontSize: 13, color: '#333', minWidth: 26, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
