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
import ConfirmDialog from '../components/ConfirmDialog';
import PlatformDateTimePicker from '../components/PlatformDateTimePicker';
import { deleteIncome, getIncome, uid, upsertIncome, type IncomeRow } from '../db';
import { prettyDate, todayKey } from '../dateUtils';
import { useTheme } from '../ThemeContext';
import { INCOME_CATEGORIES } from '../spending';
import { font, radius, type Theme } from '../theme';
import type { HomeStackParams } from '../navigation';

type Props = NativeStackScreenProps<HomeStackParams, 'IncomeEditor'>;

type Fields = {
  amount: string;
  source: string;
  note: string;
  date: string;
};

export default function IncomeEditorScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const isNew = !id;

  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [category, setCategory] = useState<string>('other');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayKey());
  const [showDate, setShowDate] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [discardVisible, setDiscardVisible] = useState(false);

  const baseline = useRef<Fields>({ amount: '', source: '', note: '', date: todayKey() });
  const hasChangesRef = useRef(false);
  const leavingRef = useRef(false);
  const pendingLeaveAction = useRef<NavigationAction | null>(null);

  useEffect(() => {
    if (isNew) return;
    getIncome(id!).then((row) => {
      if (row) {
        setAmount(String(row.amount));
        setSource(row.source);
        setCategory(row.category || 'other');
        setNote(row.note);
        setDate(row.date);
        baseline.current = {
          amount: String(row.amount),
          source: row.source,
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
    source !== baseline.current.source ||
    note !== baseline.current.note ||
    date !== baseline.current.date;

  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);

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

  const save = async () => {
    if (!canSave) return;
    const row: IncomeRow = {
      id: id ?? uid(),
      amount: Number(amount),
      source: source.trim() || 'Income',
      category,
      note: note.trim(),
      date,
      createdAt: Date.now(),
    };
    await upsertIncome(row);
    leavingRef.current = true;
    navigation.goBack();
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isNew ? 'Add income' : 'Edit income',
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
    if (id) await deleteIncome(id);
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

      <AppText variant="label" muted style={styles.sectionLabel}>
        Source
      </AppText>
      <TextInput
        style={styles.noteInput}
        placeholder="Paycheck, refund, gift…"
        placeholderTextColor={colors.textMuted}
        value={source}
        onChangeText={setSource}
      />

      <AppText variant="label" muted style={styles.sectionLabel}>
        Category
      </AppText>
      <View style={styles.catRow}>
        {INCOME_CATEGORIES.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setCategory(c.key)}
            style={[styles.catChip, category === c.key && { borderColor: c.color }]}
          >
            <View style={[styles.catDot, { backgroundColor: c.color }]} />
            <AppText variant={category === c.key ? 'bodySemi' : 'body'}>{c.label}</AppText>
          </Pressable>
        ))}
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
            Delete income
          </AppText>
        </Pressable>
      )}

      <ConfirmDialog
        visible={discardVisible}
        title={isNew ? 'Discard this income?' : 'Discard your changes?'}
        message={isNew ? "You haven't saved it yet." : "Your edits haven't been saved."}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={confirmDiscard}
        onCancel={() => setDiscardVisible(false)}
      />
      <ConfirmDialog
        visible={deleteVisible}
        title="Delete income"
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
    amountInput: {
      fontFamily: font.monoBold,
      fontSize: 34,
      color: c.text,
      minWidth: 100,
      textAlign: 'center',
    },
    catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    catChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.mist,
      borderRadius: radius.pill,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    catDot: { width: 8, height: 8, borderRadius: 4 },
    sectionLabel: { marginTop: 22, marginBottom: 10, marginLeft: 2 },
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
