import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import type { NavigationAction } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import { useOnce } from '../components/useOnce';
import ConfirmDialog from '../components/ConfirmDialog';
import DayOfMonthGrid from '../components/DayOfMonthGrid';
import {
  deleteRecurring,
  getRecurring,
  uid,
  upsertRecurring,
  type RecurringRow,
} from '../db';
import { CATEGORIES, type CategoryKey } from '../spending';
import { useTheme } from '../ThemeContext';
import { font, radius, type Theme } from '../theme';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'RecurringExpenseEditor'>;

type Fields = {
  amount: string;
  category: CategoryKey;
  label: string;
  day: number | null;
  active: boolean;
};

export default function RecurringExpenseEditorScreen({ route, navigation }: Props) {
  const { id, dayOfMonth } = route.params;
  const isNew = !id;

  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<CategoryKey>('bills');
  const [label, setLabel] = useState('');
  const [day, setDay] = useState<number | null>(dayOfMonth ?? 1);
  const [active, setActive] = useState(true);
  const [loaded, setLoaded] = useState(isNew);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [discardVisible, setDiscardVisible] = useState(false);

  // A day arriving from a calendar tap is the starting state, not a change
  // the user made — otherwise the discard prompt fires on an untouched form.
  const baseline = useRef<Fields>({
    amount: '',
    category: 'bills',
    label: '',
    day: dayOfMonth ?? 1,
    active: true,
  });
  const hasChangesRef = useRef(false);
  const leavingRef = useRef(false); // set once we've decided to actually leave
  const pendingLeaveAction = useRef<NavigationAction | null>(null);

  useEffect(() => {
    if (isNew) return;
    getRecurring(id!).then((row) => {
      if (row) {
        setAmount(String(row.amount));
        setCategory(row.category as CategoryKey);
        setLabel(row.label);
        setDay(row.dayOfMonth);
        setActive(!!row.active);
        baseline.current = {
          amount: String(row.amount),
          category: row.category as CategoryKey,
          label: row.label,
          day: row.dayOfMonth,
          active: !!row.active,
        };
      }
      setLoaded(true);
    });
  }, [id, isNew]);

  const canSave = amount.trim() !== '' && !Number.isNaN(Number(amount)) && day != null;

  const hasChanges =
    amount !== baseline.current.amount ||
    category !== baseline.current.category ||
    label !== baseline.current.label ||
    day !== baseline.current.day ||
    active !== baseline.current.active;

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
    if (!canSave || day == null) return;
    const row: RecurringRow = {
      id: id ?? uid(),
      amount: Number(amount),
      category,
      label: label.trim(),
      dayOfMonth: day,
      active: active ? 1 : 0,
      createdAt: Date.now(),
    };
    await upsertRecurring(row);
    leavingRef.current = true;
    navigation.goBack();
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isNew ? 'New recurring expense' : 'Edit recurring expense',
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
    if (id) await deleteRecurring(id);
    navigation.goBack();
  };

  if (!loaded) return <View style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppText variant="label" muted style={styles.sectionLabel}>
        Label
      </AppText>
      <TextInput
        style={styles.labelInput}
        placeholder="e.g. Rent, Netflix, Gym"
        placeholderTextColor={colors.textMuted}
        value={label}
        onChangeText={setLabel}
        autoFocus={isNew}
      />

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
        />
        <AppText variant="mono" muted>
          / month
        </AppText>
      </View>

      <AppText variant="label" muted style={styles.sectionLabel}>
        Category
      </AppText>
      <View style={styles.catRow}>
        {CATEGORIES.map((c) => {
          const isActive = category === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setCategory(c.key)}
              style={[
                styles.chip,
                { borderColor: isActive ? c.color : colors.line },
                isActive && { backgroundColor: c.color },
              ]}
            >
              <View style={[styles.chipDot, { backgroundColor: isActive ? '#fff' : c.color }]} />
              <AppText variant="bodyMed" color={isActive ? '#fff' : colors.text}>
                {c.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <AppText variant="label" muted style={styles.sectionLabel}>
        Posts on
      </AppText>
      <DayOfMonthGrid day={day} onChange={setDay} />

      <View style={styles.activeRow}>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyMed">Active</AppText>
          <AppText variant="body" muted style={styles.activeHint}>
            Off pauses it — it won't post until turned back on
          </AppText>
        </View>
        <Switch
          value={active}
          onValueChange={setActive}
          trackColor={{ true: colors.iris, false: colors.line }}
          thumbColor="#fff"
        />
      </View>

      {!isNew && (
        <Pressable style={styles.deleteBtn} onPress={() => setDeleteVisible(true)}>
          <AppText variant="bodySemi" color={colors.danger}>
            Delete recurring expense
          </AppText>
        </Pressable>
      )}

      <ConfirmDialog
        visible={discardVisible}
        title={isNew ? 'Discard this recurring expense?' : 'Discard your changes?'}
        message={isNew ? "You haven't saved it yet." : "Your edits haven't been saved."}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={confirmDiscard}
        onCancel={() => setDiscardVisible(false)}
      />
      <ConfirmDialog
        visible={deleteVisible}
        title="Delete recurring expense"
        message="Past charges it already posted stay in your history — this only stops future ones."
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
    sectionLabel: { marginTop: 22, marginBottom: 10, marginLeft: 2 },
    labelInput: {
      fontFamily: font.displaySemi,
      fontSize: 20,
      color: c.text,
      backgroundColor: c.mist,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      padding: 14,
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.mist,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      marginTop: 12,
    },
    currency: { fontSize: 18 },
    amountInput: {
      flex: 1,
      fontFamily: font.monoBold,
      fontSize: 22,
      color: c.text,
      paddingVertical: 14,
    },
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
    activeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 24,
      backgroundColor: c.mist,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      padding: 14,
    },
    activeHint: { marginTop: 2 },
    deleteBtn: { marginTop: 28, alignItems: 'center', padding: 12 },
  });
}
