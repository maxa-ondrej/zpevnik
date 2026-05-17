/**
 * Modal sheet for adding/removing a song from the user's setlists.
 *
 * Opens from the song detail page. Each setlist row has a tap-to-toggle
 * membership for the current song; checkmark = currently in. An inline
 * "New setlist…" input at the top lets the user create one without
 * leaving the picker.
 */

import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useSetlists } from '../store/setlists';
import { useTheme } from '../store/theme';

interface Props {
  songId: string;
  visible: boolean;
  onClose: () => void;
}

export function AddToSetlistSheet({ songId, visible, onClose }: Props) {
  const theme = useTheme();
  const setlists = useSetlists((s) => s.setlists);
  const create = useSetlists((s) => s.create);
  const addSong = useSetlists((s) => s.addSong);
  const removeSong = useSetlists((s) => s.removeSong);
  const [draftName, setDraftName] = useState('');

  const onCreate = () => {
    const name = draftName.trim();
    if (name.length === 0) return;
    const newId = create(name);
    addSong(newId, songId);
    setDraftName('');
  };

  const onToggle = (setlistId: string, isMember: boolean) => {
    if (isMember) removeSong(setlistId, songId);
    else addSong(setlistId, songId);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner Pressable absorbs taps so they don't dismiss the sheet. */}
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.bg, borderColor: theme.border }]}
          onPress={() => {}}
        >
          <Text style={[styles.title, { color: theme.text }]}>Add to setlist</Text>

          <View style={styles.createRow}>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="New setlist…"
              placeholderTextColor={theme.textDim}
              style={[
                styles.input,
                { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text },
              ]}
              autoCapitalize="sentences"
              onSubmitEditing={onCreate}
              returnKeyType="done"
            />
            <Pressable
              onPress={onCreate}
              disabled={draftName.trim().length === 0}
              style={[
                styles.createBtn,
                {
                  backgroundColor: draftName.trim() ? theme.accent : theme.bgAlt,
                  borderColor: draftName.trim() ? theme.accent : theme.border,
                },
              ]}
              accessibilityRole="button"
            >
              <Text
                style={{
                  fontWeight: '600',
                  color: draftName.trim() ? theme.accentText : theme.textDim,
                }}
              >
                Create
              </Text>
            </Pressable>
          </View>

          {setlists.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No setlists yet — create one above to start.
              </Text>
            </View>
          ) : (
            <FlatList
              data={[...setlists].sort((a, b) => b.updatedAt - a.updatedAt)}
              keyExtractor={(s) => s.id}
              style={styles.list}
              renderItem={({ item }) => {
                const isMember = item.songIds.includes(songId);
                return (
                  <Pressable
                    onPress={() => onToggle(item.id, isMember)}
                    style={[styles.setlistRow, { borderColor: theme.borderSoft }]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isMember }}
                  >
                    <Text style={[styles.checkmark, { color: isMember ? theme.accent : theme.textDim }]}>
                      {isMember ? '✓' : '○'}
                    </Text>
                    <Text style={[styles.setlistName, { color: theme.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.setlistMeta, { color: theme.textMuted }]}>
                      {item.songIds.length}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}

          <Pressable
            onPress={onClose}
            style={[styles.doneBtn, { borderColor: theme.border }]}
            accessibilityRole="button"
          >
            <Text style={[styles.doneBtnText, { color: theme.text }]}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: '600' },
  createRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 6,
  },
  createBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { padding: 16, alignItems: 'center' },
  emptyText: { textAlign: 'center', fontSize: 14 },
  list: { maxHeight: 320 },
  setlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  checkmark: { fontSize: 18, width: 20, textAlign: 'center' },
  setlistName: { flex: 1, fontSize: 15 },
  setlistMeta: { fontSize: 12, fontVariant: ['tabular-nums'] },
  doneBtn: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
  },
  doneBtnText: { fontWeight: '600' },
});
