import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import DayOfMonthGrid, { ordinal } from '../components/DayOfMonthGrid';
import {
  getCycleDayOverride,
  getPayday,
  listRecurringIncome,
  setCycleDayOverride,
  upsertRecurringIncome,
  type RecurringIncomeRow,
} from '../db';
import { fmtMoney, incomeCategoryMeta } from '../spending';
import { useTheme } from '../ThemeContext';
import { radius, shadow, type Theme } from '../theme';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'RecurringIncome'>;

/**
 * Where money comes in, and what the cycle turns on.
 *
 * This replaced "pay rhythm", which held a salary and a payday and did
 * nothing with them: it drew a countdown while the app went on believing no
 * money had ever arrived. A rule here posts the income for real, and the
 * largest one is what the pay cycle is measured from — one fact, entered
 * once, instead of a setting and a reality that never met.
 */
export default function RecurringIncomeScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [rows, setRows] = useState<RecurringIncomeRow[]>([]);
  const [payday, setPaydayState] = useState<{ amount: number | null; day: number | null }>({
    amount: null,
    day: null,
  });
  const [cycleDay, setCycleDay] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setRows(await listRecurringIncome());
    setPaydayState(await getPayday());
    setCycleDay(await getCycleDayOverride());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('RecurringIncomeEditor', {})} hitSlop={10}>
          <AppText variant="bodySemi" color={colors.iris}>
            Add
          </AppText>
        </Pressable>
      ),
    });
  }, [navigation, colors.iris]);

  const toggleActive = async (row: RecurringIncomeRow) => {
    const next = { ...row, active: row.active ? 0 : 1 };
    setRows((rs) => rs.map((r) => (r.id === row.id ? next : r)));
    await upsertRecurringIncome(next);
    setPaydayState(await getPayday());
  };

  /** Written as it is chosen: it is one value, and there is nothing to undo. */
  const chooseCycleDay = async (d: number | null) => {
    setCycleDay(d);
    await setCycleDayOverride(d);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppText variant="body" muted style={styles.intro}>
        Pay, and anything else that arrives on the same day each month. Each one posts itself when
        its day comes round, so your income is recorded without you logging it.
      </AppText>

      {rows.length === 0 && (
        <AppText variant="body" muted style={styles.empty}>
          Nothing yet. Add your pay to get started.
        </AppText>
      )}

      {rows.map((item) => {
        const meta = incomeCategoryMeta(item.category);
        return (
          <View key={item.id} style={[styles.card, !item.active && styles.cardDim]}>
            <Pressable
              style={styles.cardBody}
              onPress={() => navigation.navigate('RecurringIncomeEditor', { id: item.id })}
            >
              <View style={[styles.dot, { backgroundColor: meta.color }]} />
              <View style={styles.cardText}>
                <AppText variant="bodySemi">{item.source || meta.label}</AppText>
                <AppText variant="mono" muted style={styles.meta}>
                  {fmtMoney(item.amount)}/mo · {ordinal(item.dayOfMonth)}
                </AppText>
              </View>
            </Pressable>
            <Switch
              value={!!item.active}
              onValueChange={() => toggleActive(item)}
              trackColor={{ true: colors.iris, false: colors.line }}
              thumbColor="#fff"
            />
          </View>
        );
      })}

      <Pressable
        style={styles.addBtn}
        onPress={() => navigation.navigate('RecurringIncomeEditor', {})}
      >
        <AppText variant="bodySemi" color={colors.onAction}>
          Add income
        </AppText>
      </Pressable>

      {/* Kept apart from payday on purpose: plenty of people are paid on the
          25th but still think in calendar months, and anyone paid weekly needs
          a reset day that has nothing to do with when money lands. */}
      <View style={styles.editCard}>
        <AppText variant="label" muted style={styles.sectionLabel}>
          Spending cycle resets
        </AppText>
        <View style={styles.modes}>
          <Pressable
            style={[styles.mode, cycleDay == null && styles.modeOn]}
            onPress={() => chooseCycleDay(null)}
          >
            <AppText variant={cycleDay == null ? 'bodySemi' : 'body'}>On payday</AppText>
          </Pressable>
          <Pressable
            style={[styles.mode, cycleDay != null && styles.modeOn]}
            onPress={() => chooseCycleDay(cycleDay ?? payday.day ?? 1)}
          >
            <AppText variant={cycleDay != null ? 'bodySemi' : 'body'}>On a set day</AppText>
          </Pressable>
        </View>

        {cycleDay != null && (
          <View style={styles.gridWrap}>
            <DayOfMonthGrid day={cycleDay} onChange={chooseCycleDay} activeColor={colors.iris} />
          </View>
        )}

        <AppText variant="mono" muted style={styles.footnote}>
          {cycleDay == null
            ? payday.day != null
              ? `Everything cycle-based starts again on the ${ordinal(payday.day)}, with your pay.`
              : 'Without any income set, cycles follow the calendar month.'
            : `This cycle counts from the ${ordinal(cycleDay)} — Home, budgets and the category breakdown all measure from it.`}
        </AppText>
      </View>
    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 60 },
    intro: { marginBottom: 18, lineHeight: 20 },
    empty: { textAlign: 'center', paddingVertical: 16 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      paddingVertical: 6,
      paddingRight: 14,
      marginBottom: 10,
      ...shadow.card,
    },
    cardDim: { opacity: 0.55 },
    cardBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
    cardText: { flex: 1 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    meta: { marginTop: 2 },
    addBtn: {
      height: 50,
      borderRadius: radius.md,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    editCard: {
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      padding: 16,
      marginTop: 22,
    },
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
    modeOn: { borderColor: c.action },
    gridWrap: { marginTop: 16 },
    footnote: { marginTop: 12, fontSize: 11, lineHeight: 16 },
  });
}
