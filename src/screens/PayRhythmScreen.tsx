import { useCallback, useMemo, useRef, useState } from 'react';
import { currencyPrefix } from '../currency';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import CycleRing from '../components/CycleRing';
import UnsavedChangesGuard from '../components/UnsavedChangesGuard';
import DayOfMonthGrid from '../components/DayOfMonthGrid';
import PaydayFields from '../components/PaydayFields';
import {
  getCycleDayOverride,
  getNotificationsEnabled,
  getPayday,
  setCycleDayOverride,
  setPayday,
} from '../db';
import { syncScheduledNotifications } from '../reminders';
import { payCycle } from '../payCycle';
import { useTheme } from '../ThemeContext';
import { radius, shadow, type Theme } from '../theme';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'PayRhythm'>;

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function PayRhythmScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [amount, setAmount] = useState('');
  const [day, setDay] = useState<number | null>(null);
  const [savedAmount, setSavedAmount] = useState<number | null>(null);
  const [savedDay, setSavedDay] = useState<number | null>(null);
  // Set the instant Save is pressed, so the guard knows this exit is ours.
  const leaving = useRef(false);
  // Null means the cycle follows payday, which is what almost everyone wants.
  const [cycleDay, setCycleDay] = useState<number | null>(null);
  const [savedCycleDay, setSavedCycleDay] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      getPayday().then((p) => {
        setAmount(p.amount != null ? String(p.amount) : '');
        setDay(p.day);
        setSavedAmount(p.amount);
        setSavedDay(p.day);
      });
      getCycleDayOverride().then((d) => {
        setCycleDay(d);
        setSavedCycleDay(d);
      });
    }, [])
  );

  /** Writes without leaving, so the guard can save and then go itself. */
  const persist = async () => {
    const num = amount.trim() === '' ? null : Number(amount);
    await setPayday(num, day);
    await setCycleDayOverride(cycleDay);
    setSavedAmount(num);
    setSavedDay(day);
    setSavedCycleDay(cycleDay);
    if (await getNotificationsEnabled()) {
      await syncScheduledNotifications(true, day);
    }
  };

  const save = async () => {
    await persist();
    leaving.current = true;
    navigation.goBack();
  };

  // What is on screen against what is stored. The amount is compared as text
  // so "2222" and "2222.00" do not read as a change.
  const dirty =
    (amount.trim() === '' ? null : Number(amount)) !== savedAmount ||
    day !== savedDay ||
    cycleDay !== savedCycleDay;

  const cycle = savedDay != null ? payCycle(savedDay) : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <UnsavedChangesGuard
        dirty={dirty}
        onSave={persist}
        leavingRef={leaving}
        title="Save your pay rhythm?"
        message="You've changed your salary or payday without saving it."
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {savedAmount != null || savedDay != null ? (
          <View style={styles.summary}>
            {/* The ring counts down to payday, so it only appears once there
                is a day to count to. */}
            {cycle && (
              <CycleRing
                fraction={cycle.fraction}
                daysUntil={cycle.daysUntil}
                trackColor={colors.onInkTrack}
                textColor={colors.onInk}
              />
            )}
            <View style={{ flex: 1 }}>
              <AppText variant="monoBold" color={colors.onInk} style={styles.amount}>
                {savedAmount != null ? `${currencyPrefix()}${savedAmount.toLocaleString()}` : 'No amount'}
              </AppText>
              <AppText variant="mono" color={colors.onInkMuted}>
                {savedDay != null ? `paid on the ${ordinal(savedDay)}` : 'no payday set'}
              </AppText>
              {savedCycleDay != null && savedCycleDay !== savedDay && (
                <AppText variant="mono" color={colors.onInkMuted} style={styles.cycleNote}>
                  cycle resets the {ordinal(savedCycleDay)}
                </AppText>
              )}
            </View>
          </View>
        ) : (
          <AppText variant="body" muted style={styles.blurb}>
            Add your salary and the day of the month you're paid. The calendar
            will show a runway to your next payday.
          </AppText>
        )}

        <View style={styles.editCard}>
          <PaydayFields
            amount={amount}
            day={day}
            onChangeAmount={setAmount}
            onChangeDay={setDay}
          />
          <AppText variant="mono" muted style={styles.footnote}>
            clear both fields and save to remove it
          </AppText>
        </View>

        {/* Kept apart from payday on purpose: plenty of people are paid on the
            25th but still think in calendar months, and anyone paid weekly
            needs a reset day that has nothing to do with when money lands. */}
        <View style={styles.editCard}>
          <AppText variant="label" muted style={styles.sectionLabel}>
            Spending cycle resets
          </AppText>
          <View style={styles.modes}>
            <Pressable
              style={[styles.mode, cycleDay == null && styles.modeOn]}
              onPress={() => setCycleDay(null)}
            >
              <AppText variant={cycleDay == null ? 'bodySemi' : 'body'}>On payday</AppText>
            </Pressable>
            <Pressable
              style={[styles.mode, cycleDay != null && styles.modeOn]}
              onPress={() => setCycleDay((d) => d ?? day ?? 1)}
            >
              <AppText variant={cycleDay != null ? 'bodySemi' : 'body'}>On a set day</AppText>
            </Pressable>
          </View>

          {cycleDay != null && (
            <View style={styles.gridWrap}>
              <DayOfMonthGrid day={cycleDay} onChange={setCycleDay} activeColor={colors.iris} />
            </View>
          )}

          <AppText variant="mono" muted style={styles.footnote}>
            {cycleDay == null
              ? day != null
                ? `Everything cycle-based starts again on the ${ordinal(day)}, with your pay.`
                : 'Without a payday set, cycles follow the calendar month.'
              : `This cycle counts from the ${ordinal(cycleDay)} — Home, budgets and the category breakdown all measure from it.`}
          </AppText>
        </View>

        <Pressable style={styles.saveBtn} onPress={save}>
          <AppText variant="bodySemi" color={colors.onAction}>
            Save
          </AppText>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 40 },
    summary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      backgroundColor: c.ink,
      borderRadius: radius.lg,
      padding: 18,
      marginBottom: 16,
      ...shadow.card,
    },
    amount: { fontSize: 22, marginBottom: 2 },
    blurb: { marginBottom: 16, marginHorizontal: 2 },
    editCard: {
      marginBottom: 14,
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      padding: 16,
      ...shadow.card,
    },
    saveBtn: {
      marginTop: 8,
      height: 48,
      borderRadius: radius.md,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footnote: { marginTop: 12, marginLeft: 2, lineHeight: 16 },
    cycleNote: { marginTop: 2 },
    sectionLabel: { marginBottom: 10, marginLeft: 2 },
    modes: { flexDirection: 'row', gap: 10 },
    mode: {
      flex: 1,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: c.haze,
      borderWidth: 1,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeOn: { borderColor: c.iris },
    gridWrap: { marginTop: 18 },
  });
}
