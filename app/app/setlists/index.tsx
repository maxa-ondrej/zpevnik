/**
 * Setlists index — list of the user's setlists with an inline
 * "Create new" affordance at top. Songs are added to setlists from
 * the song detail page; here we just manage the collection.
 */

import { Link } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useSetlists } from '../../src/shared/store/setlists';
import { useTheme } from '../../src/shared/store/theme';

export default function SetlistsListScreen() {
  const theme = useTheme();
  const setlists = useSetlists((s) => s.setlists);
  const create = useSetlists((s) => s.create);
  const [draftName, setDraftName] = useState('');

  // Newest first — recently-updated setlists are the ones a user typically
  // wants to find again.
  const sorted = [...setlists].sort((a, b) => b.updatedAt - a.updatedAt);

  const onCreate = () => {
    const name = draftName.trim();
    if (name.length === 0) return;
    create(name);
    setDraftName('');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.createRow, { borderColor: theme.borderSoft }]}>
        <TextInput
          value={draftName}
          onChangeText={setDraftName}
          placeholder="New setlist name…"
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
          accessibilityLabel="Create setlist"
        >
          <Text
            style={[
              styles.createBtnText,
              { color: draftName.trim() ? theme.accentText : theme.textDim },
            ]}
          >
            Create
          </Text>
        </Pressable>
      </View>

      {sorted.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No setlists yet</Text>
          <Text style={[styles.emptyHint, { color: theme.textMuted }]}>
            Create one above, then open a song and tap "+ Setlist" to add it.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <Link
              href={{ pathname: '/setlists/[id]', params: { id: item.id } }}
              asChild
            >
              <Pressable style={[styles.row, { borderColor: theme.borderSoft }]}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{item.name}</Text>
                <Text style={[styles.rowMeta, { color: theme.textMuted }]}>
                  {item.songIds.length} song{item.songIds.length === 1 ? '' : 's'}
                </Text>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  createRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 16,
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
  },
  createBtnText: { fontSize: 14, fontWeight: '600' },
  empty: { padding: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyHint: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
  },
  rowTitle: { flex: 1, fontSize: 16 },
  rowMeta: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
