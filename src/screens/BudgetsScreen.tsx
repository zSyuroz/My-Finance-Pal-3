import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import UnsavedChangesGuard from '../components/UnsavedChangesGuard';
import { budgetSummary, type BudgetSummary } from '../budget';
import {
  expensesBetween,
  getCycleDay,
  listBudgets,
  setBudget,
  type BudgetRow,
} from '../db';
import { startOfMonthKey, todayKey } from '../dateUtils';
import { cycleWindow } from '../payCycle';
import { CATEGORIES, fmtMoney } from '../spending';
import { useTheme } from '../ThemeContext';
import { radius, type Theme } from '../theme';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'Budgets'>;

export default function BudgetsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Held as text so a half-typed "12." isn't rewritten under the cursor.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Mirrored into a ref so the focus-effect cleanup — which runs with the
  // closure from the render that registered it — can still see the latest
  // values.
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const savedRef = useRef<Record<string, string>>({});
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const leaving = useRef(false);

  /**
   * `seedDrafts` is off after a save on purpose. Re-seeding every field from
   * the database would wipe whatever the user had typed into a *different*
   * field but not yet committed — so entering two limits in a row silently
   * lost the first one.
   */
  const refresh = useCallback(async (seedDrafts: boolean) => {
    const today = todayKey();
    const { start, elapsed, total } = cycleWindow(await getCycleDay(), today);
    const [budgets, spent] = await Promise.all([
      listBudgets(),
      expensesBetween(start ?? startOfMonthKey(today), today),
    ]);
    if (seedDrafts) {
      const seeded = Object.fromEntries(
        budgets.filter((b: BudgetRow) => b.amount > 0).map((b) => [b.category, String(b.amount)])
      );
      savedRef.current = seeded;
      setDrafts(seeded);
    }
    setSummary(budgetSummary(budgets, spent, elapsed, total));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh(true);
    }, [refresh])
  );

  /** Fields whose text no longer matches what is stored. */
  const changed = () =>
    Object.entries(draftsRef.current).filter(
      ([category, text]) => (savedRef.current[category] ?? '') !== text
    );
  const dirty = changed().length > 0;

  /** Writes without leaving, so the guard can save and then go itself. */
  const persist = useCallback(async () => {
    for (const [category, text] of changed()) {
      const value = Number(text.replace(/[^0-9.]/g, '')) || 0;
      await setBudget(category, value);
      savedRef.current = { ...savedRef.current, [category]: value > 0 ? String(value) : '' };
    }
    await refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const save = async () => {
    await persist();
    leaving.current = true;
    navigation.goBack();
  };



  const statusFor = (key: string) => summary?.categories.find((c) => c.key === key);
  const totalDraft = Object.values(drafts).reduce(
    (s, v) => s + (Number(v.replace(/[^0-9.]/g, '')) || 0),
    0
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppText variant="body" muted style={styles.intro}>
        Set what you mean to spend in each category over a pay cycle. Leave one blank to leave it
        untracked — what you spend there still counts, it just isn't measured against a limit.
      </AppText>

      {CATEGORIES.map((c) => {
        const status = statusFor(c.key);
        const ratio = status ? Math.min(1, status.ratio) : 0;
        return (
          <View key={c.key} style={styles.card}>
            <View style={styles.head}>
              <View style={styles.name}>
                <View style={[styles.dot, { backgroundColor: c.color }]} />
                <AppText variant="bodySemi">{c.label}</AppText>
              </View>
              <View style={styles.amountBox}>
                <TextInput
                  style={styles.input}
                  value={drafts[c.key] ?? ''}
                  onChangeText={(v) => setDrafts((d) => ({ ...d, [c.key]: v }))}
                  onSubmitEditing={save}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="done"
                />
              </View>
            </View>

            {status && (
              <>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${ratio * 100}%`,
                        backgroundColor: status.over ? colors.danger : c.color,
                      },
                    ]}
                  />
                </View>
                <AppText
                  variant="mono"
                  muted={!status.over}
                  color={status.over ? colors.danger : undefined}
                  style={styles.detail}
                >
                  {fmtMoney(status.spent)} spent ·{' '}
                  {status.over
                    ? `${fmtMoney(Math.abs(status.remaining))} over`
                    : `${fmtMoney(status.remaining)} left`}
                </AppText>
              </>
            )}
          </View>
        );
      })}

      <Pressable
        style={[styles.saveBtn, !dirty && styles.saveBtnIdle]}
        onPress={save}
        disabled={!dirty}
      >
        <AppText variant="bodySemi" color={dirty ? colors.onGold : colors.textMuted}>
          {dirty ? 'Save changes' : 'Saved'}
        </AppText>
      </Pressable>

      <View style={styles.totalRow}>
        <AppText variant="bodySemi">Total per cycle</AppText>
        <AppText variant="monoBold">{fmtMoney(totalDraft)}</AppText>
      </View>

      <UnsavedChangesGuard
        dirty={dirty}
        onSave={persist}
        leavingRef={leaving}
        title="Save your budget?"
        message="You've changed a limit without saving it."
      />

      {summary && summary.unbudgetedSpend > 0 && (
        // Money spent outside every limit would otherwise be invisible here,
        // and a budget you can walk around isn't a budget.
        <AppText variant="body" muted style={styles.note}>
          {fmtMoney(summary.unbudgetedSpend)} of this cycle's spending sits in categories with no
          limit, so it isn't counted above.
        </AppText>
      )}
    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 60 },
    intro: { marginBottom: 20, lineHeight: 20 },
    card: {
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      padding: 16,
      marginBottom: 12,
    },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    name: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    amountBox: { flexDirection: 'row', alignItems: 'center' },
    input: {
      minWidth: 92,
      textAlign: 'right',
      backgroundColor: c.haze,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: c.text,
      fontFamily: 'SpaceMono_700Bold',
      fontSize: 15,
    },
    track: {
      height: 6,
      borderRadius: 6,
      backgroundColor: c.line,
      overflow: 'hidden',
      marginTop: 14,
    },
    fill: { height: 6, borderRadius: 6 },
    detail: { marginTop: 8, fontSize: 12 },
    saveBtn: {
      height: 50,
      borderRadius: radius.md,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    saveBtnIdle: { backgroundColor: c.mist },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 16,
    },
    note: { marginTop: 4, lineHeight: 19 },
  });
}
