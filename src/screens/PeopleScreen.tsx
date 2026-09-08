import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  deletePerson,
  listPeople,
  listSharedExpenses,
  listSplits,
  uid,
  upsertPerson,
  type PersonRow,
} from '../db';
import { balances } from '../sharing';
import { fmtMoney } from '../spending';
import { useTheme } from '../ThemeContext';
import { radius, shadow, type Theme } from '../theme';
import type { SharedStackParams } from '../navigation';

type Props = NativeStackScreenProps<SharedStackParams, 'People'>;

export default function PeopleScreen({}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [people, setPeople] = useState<PersonRow[]>([]);
  const [name, setName] = useState('');
  const [pending, setPending] = useState<PersonRow | null>(null);
  const [involvement, setInvolvement] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const [ledgerText, setLedgerText] = useState<Record<string, string>>({});

  // People and their standing balance load together — a name on its own is
  // not much use when the question is always "and what do they owe me?".
  const refresh = useCallback(async () => {
    const [list, expenses, splits] = await Promise.all([
      listPeople(),
      listSharedExpenses(),
      listSplits(),
    ]);
    const map: Record<string, string> = {};
    for (const b of balances(expenses, splits)) {
      if (Math.round(b.net * 100) === 0) continue;
      map[b.personId] =
        b.net > 0 ? `is owed ${fmtMoney(b.net)}` : `owes ${fmtMoney(Math.abs(b.net))}`;
    }
    setPeople(list);
    setLedgerText(map);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await upsertPerson({ id: uid(), name: trimmed, createdAt: Date.now() });
    setName('');
    refresh();
  };

  /**
   * Deleting someone also deletes the bills they paid, so the confirmation has
   * to say how much is at stake — not just "this cannot be undone".
   */
  const askDelete = async (person: PersonRow) => {
    const [expenses, splits] = await Promise.all([listSharedExpenses(), listSplits()]);
    const paidCount = expenses.filter((e) => e.paidBy === person.id).length;
    const inCount = new Set(
      splits.filter((s) => s.personId === person.id).map((s) => s.sharedId)
    ).size;
    setInvolvement(Math.max(paidCount, inCount));
    setPending(person);
  };

  const rename = async (person: PersonRow) => {
    const trimmed = draftName.trim();
    setEditingId(null);
    // An empty name would leave an unlabelled row that's impossible to pick
    // out in a split, so a blank simply cancels.
    if (!trimmed || trimmed === person.name) return;
    await upsertPerson({ ...person, name: trimmed });
    refresh();
  };

  const confirmDelete = async () => {
    if (pending) await deletePerson(pending.id);
    setPending(null);
    refresh();
  };

  return (
    <View style={styles.container}>
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Add someone"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          onSubmitEditing={add}
          returnKeyType="done"
        />
        <Pressable
          style={[styles.addBtn, !name.trim() && styles.addBtnDisabled]}
          onPress={add}
          disabled={!name.trim()}
        >
          <AppText variant="bodySemi" color={colors.onAction}>
            Add
          </AppText>
        </Pressable>
      </View>

      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <AppText variant="body" muted style={styles.empty}>
            Nobody yet. Add the people you split bills with.
          </AppText>
        }
        renderItem={({ item }) => {
          const editing = editingId === item.id;
          return (
            <View style={styles.row}>
              <View style={styles.rowBody}>
                {editing ? (
                  <TextInput
                    style={styles.renameInput}
                    value={draftName}
                    onChangeText={setDraftName}
                    onSubmitEditing={() => rename(item)}
                    onBlur={() => rename(item)}
                    autoFocus
                    selectTextOnFocus
                  />
                ) : (
                  // Tapping the name edits it — a typo in someone's name was
                  // otherwise only fixable by removing them, which would have
                  // taken their bills with it.
                  <Pressable
                    onPress={() => {
                      setEditingId(item.id);
                      setDraftName(item.name);
                    }}
                  >
                    <AppText variant="bodySemi">{item.name}</AppText>
                  </Pressable>
                )}
                <AppText variant="mono" muted style={styles.rowSub}>
                  {editing ? 'tap done to save' : (ledgerText[item.id] ?? 'all square')}
                </AppText>
              </View>
              {editing ? (
                <Pressable onPress={() => rename(item)} hitSlop={8}>
                  <AppText variant="bodySemi" color={colors.iris}>
                    Done
                  </AppText>
                </Pressable>
              ) : (
                <Pressable onPress={() => askDelete(item)} hitSlop={8}>
                  <AppText variant="bodySemi" color={colors.danger}>
                    Remove
                  </AppText>
                </Pressable>
              )}
            </View>
          );
        }}
      />

      <ConfirmDialog
        visible={!!pending}
        title={`Remove ${pending?.name ?? ''}?`}
        message={
          involvement > 0
            ? `They appear in ${involvement} shared expense${involvement === 1 ? '' : 's'}. ` +
              'Removing them deletes any bill they paid and takes them off the rest, ' +
              'which will change what everyone owes.'
            : 'They are not on any shared expense yet.'
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPending(null)}
      />
    </View>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    addRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
    input: {
      flex: 1,
      backgroundColor: c.mist,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: c.text,
      fontFamily: 'Archivo_400Regular',
      fontSize: 15,
    },
    addBtn: {
      backgroundColor: c.action,
      borderRadius: radius.md,
      paddingHorizontal: 20,
      justifyContent: 'center',
    },
    addBtnDisabled: { opacity: 0.4 },
    list: { padding: 20, paddingBottom: 60 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      padding: 16,
      marginBottom: 10,
      ...shadow.card,
    },
    rowBody: { flex: 1, paddingRight: 12 },
    rowSub: { marginTop: 3 },
    renameInput: {
      color: c.text,
      fontFamily: 'Archivo_600SemiBold',
      fontSize: 15,
      padding: 0,
    },
    empty: { textAlign: 'center', paddingVertical: 24 },
  });
}
