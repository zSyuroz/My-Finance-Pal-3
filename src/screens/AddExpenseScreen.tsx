import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import type { NavigationAction } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import { useOnce } from '../components/useOnce';
import ConfirmDialog from '../components/ConfirmDialog';
import PlatformDateTimePicker from '../components/PlatformDateTimePicker';
import { deleteExpense, getExpense, uid, upsertExpense, type ExpenseRow } from '../db';
import { prettyDate, todayKey } from '../dateUtils';
import { CATEGORIES, type CategoryKey } from '../spending';
import { useTheme } from '../ThemeContext';
import { font, radius, type Theme } from '../theme';
import type { HomeStackParams } from '../navigation';

type Props = NativeStackScreenProps<HomeStackParams, 'AddExpense'>;

type Fields = {
  amount: string;
  category: CategoryKey;
  note: string;
  date: string;
};

export default function AddExpenseScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const isNew = !id;

  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<CategoryKey>('food');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayKey());
  const [showDate, setShowDate] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const [recurringId, setRecurringId] = useState<string | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [discardVisible, setDiscardVisible] = useState(false);

  const baseline = useRef<Fields>({ amount: '', category: 'food', note: '', date: todayKey() });
  const hasChangesRef = useRef(false);
  const leavingRef = useRef(false); // set once we've decided to actually leave
  const pendingLeaveAction = useRef<NavigationAction | null>(null);

  useEffect(() => {
    if (isNew) return;
    getExpense(id!).then((row) => {
      if (row) {
        setAmount(String(row.amount));
        setCategory(row.category as CategoryKey);
        setNote(row.note);
        setDate(row.date);
        setRecurringId(row.recurringId);
        baseline.current = {
          amount: String(row.amount),
          category: row.category as CategoryKey,
          note: row.note,
          date: row.date,
        };
      }
      setLoaded(true);
    });
  }, [id, isNew]);

  const canSave = amount.trim() !== '' && !Number.isNaN(Number(amount));

  const hasChanges =
    amount !== baseline.current.amount ||
    category !== baseline.current.category ||
    note !== baseline.current.note ||
    date !== baseline.current.date;

  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);

  // Leaving with unsaved changes — header back arrow, hardware back, or an
  // edge swipe — asks first, same as Notes.
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (leavingRef.current || !hasChangesRef.current) return;
      e.preventDefault();
      pendingLeaveAction.current = e.data.action;
      setDiscardVisible(true);
    });
  }, [navigation]);

  const confirmDiscard = () => {
    setDiscardVisible(false);
    leavingRef.current = true;
    const action = pendingLeaveAction.current;
    if (action) navigation.dispatch(action);
  };

  // One press, one record: each save mints a fresh id, so a second tap
  // during the write would store the same thing twice.
  const save = useOnce(async () => {
    if (!canSave) return;
    const row: ExpenseRow = {
      id: id ?? uid(),
      amount: Number(amount),
      category,
      note: note.trim(),
      date,
      createdAt: Date.now(),
      recurringId,
    };
    await upsertExpense(row);
    leavingRef.current = true;
    navigation.goBack();
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isNew ? 'Add expense' : 'Edit expense',
      headerRight: () => (
        <Pressable onPress={save} hitSlop={10} disabled={!canSave}>
          <AppText variant="bodySemi" color={canSave ? colors.iris : colors.textMuted}>
            Save
          </AppText>
        </Pressable>
      ),
    });
  });

  const doDelete = async () => {
    setDeleteVisible(false);
    leavingRef.current = true;
    if (id) await deleteExpense(id);
    navigation.goBack();
  };

  if (!loaded) return <View style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.amountRow}>
        <AppText variant="monoBold" muted style={styles.currency}>
          $
        </AppText>
        <TextInput
          style={styles.amountInput}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
          autoFocus={isNew}
        />
      </View>
      {recurringId && (
        <AppText variant="mono" muted style={styles.autoNote}>
          ↻ posted automatically from a recurring expense
        </AppText>
      )}

      {isNew && (
        <View style={styles.importRow}>
          <Pressable
            style={styles.importBtn}
            onPress={() => navigation.navigate('BankImport')}
          >
            <AppText variant="bodySemi" color={colors.iris}>
              ⇩ Import bank statement
            </AppText>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('IncomeEditor', {})} hitSlop={8}>
            <AppText variant="body" muted style={styles.incomeLink}>
              or log income instead
            </AppText>
          </Pressable>
        </View>
      )}

      <AppText variant="label" muted style={styles.sectionLabel}>
        Category
      </AppText>
      <View style={styles.catRow}>
        {CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setCategory(c.key)}
              style={[
                styles.chip,
                { borderColor: active ? c.color : colors.line },
                active && { backgroundColor: c.color },
              ]}
            >
              <View style={[styles.chipDot, { backgroundColor: active ? '#fff' : c.color }]} />
              <AppText variant="bodyMed" color={active ? '#fff' : colors.text}>
                {c.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <AppText variant="label" muted style={styles.sectionLabel}>
        Date
      </AppText>
      <Pressable style={styles.dateRow} onPress={() => setShowDate((s) => !s)}>
        <AppText variant="mono" color={colors.iris}>
          {prettyDate(date)}
        </AppText>
      </Pressable>
      {showDate && (
        <PlatformDateTimePicker
          mode="date"
          value={date}
          onChange={setDate}
          onClose={() => setShowDate(false)}
        />
      )}

      <AppText variant="label" muted style={styles.sectionLabel}>
        Note
      </AppText>
      <TextInput
        style={styles.noteInput}
        placeholder="Optional"
        placeholderTextColor={colors.textMuted}
        value={note}
        onChangeText={setNote}
      />

      {!isNew && (
        <Pressable style={styles.deleteBtn} onPress={() => setDeleteVisible(true)}>
          <AppText variant="bodySemi" color={colors.danger}>
            Delete expense
          </AppText>
        </Pressable>
      )}

      <ConfirmDialog
        visible={discardVisible}
        title={isNew ? 'Discard this expense?' : 'Discard your changes?'}
        message={isNew ? "You haven't saved it yet." : "Your edits haven't been saved."}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={confirmDiscard}
        onCancel={() => setDiscardVisible(false)}
      />
      <ConfirmDialog
        visible={deleteVisible}
        title="Delete expense"
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={doDelete}
        onCancel={() => setDeleteVisible(false)}
      />
    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 48 },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.mist,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.lg,
      paddingVertical: 22,
      marginBottom: 8,
    },
    currency: { fontSize: 30, marginRight: 6 },
    autoNote: { textAlign: 'center', marginTop: -2, marginBottom: 4 },
    importRow: { alignItems: 'center', marginBottom: 4 },
    importBtn: {
      borderWidth: 1.5,
      borderColor: c.iris,
      borderRadius: radius.pill,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    incomeLink: { marginTop: 10, textDecorationLine: 'underline' },
    amountInput: {
      fontFamily: font.monoBold,
      fontSize: 34,
      color: c.text,
      minWidth: 100,
      textAlign: 'center',
    },
    sectionLabel: { marginTop: 22, marginBottom: 10, marginLeft: 2 },
    catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      backgroundColor: c.mist,
    },
    chipDot: { width: 8, height: 8, borderRadius: 4 },
    dateRow: {
      backgroundColor: c.mist,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      padding: 14,
    },
    noteInput: {
      fontFamily: font.body,
      fontSize: 15,
      color: c.text,
      backgroundColor: c.mist,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      padding: 14,
    },
    deleteBtn: { marginTop: 28, alignItems: 'center', padding: 12 },
  });
}
