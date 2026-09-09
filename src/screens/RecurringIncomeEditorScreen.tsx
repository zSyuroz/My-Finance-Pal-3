import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import ConfirmDialog from '../components/ConfirmDialog';
import DayOfMonthGrid from '../components/DayOfMonthGrid';
import UnsavedChangesGuard from '../components/UnsavedChangesGuard';
import { useSaveAndClose } from '../components/useSaveAndClose';
import {
  applyDueIncome,
  deleteRecurringIncome,
  getNotificationsEnabled,
  getPayday,
  getRecurringIncome,
  uid,
  upsertRecurringIncome,
  type RecurringIncomeRow,
} from '../db';
import { syncScheduledNotifications } from '../reminders';
import { INCOME_CATEGORIES } from '../spending';
import { useTheme } from '../ThemeContext';
import { radius, type Theme } from '../theme';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'RecurringIncomeEditor'>;

/** One standing income: what arrives, from where, and on which day. */
export default function RecurringIncomeEditorScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const id = route.params?.id;
  const isNew = !id;

  const [existing, setExisting] = useState<RecurringIncomeRow | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [category, setCategory] = useState('salary');
  const [day, setDay] = useState<number | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const leaving = useRef(false);

  useEffect(() => {
    navigation.setOptions({ title: isNew ? 'Add income' : 'Edit income' });
  }, [navigation, isNew]);

  useEffect(() => {
    if (!id) return;
    getRecurringIncome(id).then((row) => {
      if (row) {
        setExisting(row);
        setAmount(String(row.amount));
        setSource(row.source);
        setCategory(row.category);
        setDay(row.dayOfMonth);
      }
      setLoaded(true);
    });
  }, [id]);

  const num = Math.abs(Number(amount.replace(/[^0-9.]/g, '')) || 0);
  const canSave = num > 0 && day != null;

  const dirty =
    loaded &&
    canSave &&
    (isNew ||
      num !== (existing?.amount ?? 0) ||
      source !== (existing?.source ?? '') ||
      category !== (existing?.category ?? 'salary') ||
      day !== (existing?.dayOfMonth ?? null));

  const persist = async () => {
    if (!canSave || day == null) return;
    await upsertRecurringIncome({
      id: id || uid(),
      amount: num,
      source: source.trim(),
      category,
      dayOfMonth: day,
      active: existing?.active ?? 1,
      createdAt: existing?.createdAt || Date.now(),
    });
    // Posts this month's pay straight away if its day has already passed, so
    // the cycle you are looking at is right before you have left the screen.
    await applyDueIncome();
    if (await getNotificationsEnabled()) {
      await syncScheduledNotifications(true, (await getPayday()).day);
    }
  };

  const { save, saveFailedDialog } = useSaveAndClose({
    persist,
    leaving,
    goBack: () => navigation.goBack(),
    what: 'this income',
  });

  if (!loaded) return <View style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <UnsavedChangesGuard
        dirty={dirty}
        onSave={persist}
        leavingRef={leaving}
        title="Save this income?"
        message="You've filled in an income without saving it."
      />
      {saveFailedDialog}

      <AppText variant="label" muted style={styles.fieldLabel}>
        Amount
      </AppText>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.textMuted}
        autoFocus={isNew}
      />

      <AppText variant="label" muted style={[styles.fieldLabel, styles.spaced]}>
        Where from
      </AppText>
      <TextInput
        style={styles.input}
        value={source}
        onChangeText={setSource}
        placeholder="Acme Ltd"
        placeholderTextColor={colors.textMuted}
      />

      <AppText variant="label" muted style={[styles.fieldLabel, styles.spaced]}>
        Kind
      </AppText>
      <View style={styles.kinds}>
        {INCOME_CATEGORIES.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setCategory(c.key)}
            style={[styles.kindChip, category === c.key && { borderColor: c.color }]}
          >
            <View style={[styles.kindDot, { backgroundColor: c.color }]} />
            <AppText variant={category === c.key ? 'bodySemi' : 'body'}>{c.label}</AppText>
          </Pressable>
        ))}
      </View>

      <AppText variant="label" muted style={[styles.fieldLabel, styles.spaced]}>
        Arrives on
      </AppText>
      <DayOfMonthGrid day={day} onChange={setDay} activeColor={colors.sage} />
      <AppText variant="mono" muted style={styles.hint}>
        The largest income is what your pay cycle turns on — Home, budgets and the category
        breakdown all measure from it.
      </AppText>

      <Pressable style={styles.saveBtn} onPress={save} disabled={!canSave}>
        <AppText variant="bodySemi" color={canSave ? colors.onAction : colors.textMuted}>
          {isNew ? 'Add income' : 'Save'}
        </AppText>
      </Pressable>

      {!isNew && (
        <Pressable style={styles.deleteBtn} onPress={() => setDeleteVisible(true)}>
          <AppText variant="bodySemi" color={colors.danger}>
            Remove this income
          </AppText>
        </Pressable>
      )}

      <ConfirmDialog
        visible={deleteVisible}
        title={`Remove ${existing?.source || 'this income'}?`}
        message="It stops posting from now on. Income it has already recorded stays as history."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        onConfirm={async () => {
          setDeleteVisible(false);
          leaving.current = true;
          if (id) await deleteRecurringIncome(id);
          navigation.goBack();
        }}
        onCancel={() => setDeleteVisible(false)}
      />
    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 60 },
    fieldLabel: { marginBottom: 8, marginLeft: 2 },
    spaced: { marginTop: 18 },
    input: {
      backgroundColor: c.mist,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      height: 48,
      color: c.text,
      fontFamily: 'Archivo_400Regular',
      fontSize: 16,
    },
    hint: { marginTop: 12, fontSize: 11, lineHeight: 16 },
    kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    kindChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.mist,
      borderRadius: radius.pill,
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    kindDot: { width: 8, height: 8, borderRadius: 4 },
    saveBtn: {
      height: 50,
      borderRadius: radius.md,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 26,
    },
    deleteBtn: { alignItems: 'center', paddingTop: 20, paddingBottom: 4 },
  });
}
