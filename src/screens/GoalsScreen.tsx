import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import RowIcon from '../components/RowIcon';
import {
  applyDueSavings,
  getCycleDay,
  getSavingsPerCycle,
  listGoals,
  setSavingsPerCycle,
  type GoalRow,
} from '../db';
import { todayKey } from '../dateUtils';
import { cycleWindow } from '../payCycle';
import { goalStatus } from '../goals';
import { fmtMoney } from '../spending';
import { useTheme } from '../ThemeContext';
import { radius, type Theme } from '../theme';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'Goals'>;

/**
 * The list only lists. Editing a goal is its own screen, so a long form never
 * pushes the goal you tapped off the top of this one.
 */
export default function GoalsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [perCycle, setPerCycle] = useState('');

  const refresh = useCallback(async () => {
    // Credited before the list is read, so the figures on screen are the ones
    // this cycle's saving has already gone into.
    const cycleDay = await getCycleDay();
    await applyDueSavings(cycleWindow(cycleDay, todayKey()).start);
    const saved = await getSavingsPerCycle();
    setPerCycle(saved != null ? String(saved) : '');
    setGoals(await listGoals());
  }, []);

  /**
   * Written on blur rather than on every keystroke: saving per character
   * would credit the goals off a half-typed "5" on the way to "500".
   */
  const commitPerCycle = async () => {
    const value = Number(perCycle.replace(/[^0-9.]/g, ''));
    await setSavingsPerCycle(Number.isFinite(value) && value > 0 ? value : null);
    refresh();
  };

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const openEditor = (id?: string) => navigation.navigate('GoalEditor', id ? { id } : {});

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppText variant="body" muted style={styles.intro}>
        A target with a date is what turns saving into a plan. Give each one a deadline and the app
        works out what it takes each month to get there.
      </AppText>

      {goals.map((g) => {
        const status = goalStatus(g, todayKey());
        return (
          <Pressable
            key={g.id}
            style={styles.card}
            onPress={() => openEditor(g.id)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${g.name}`}
          >
            <View style={styles.head}>
              <AppText variant="bodySemi" style={styles.goalName}>
                {g.name}
              </AppText>
              <AppText variant="monoBold">
                {fmtMoney(g.saved)} / {fmtMoney(g.target)}
              </AppText>
              {/* The affordance that says this card leads somewhere. */}
              <View style={styles.chevron}>
                <RowIcon name="chevron" color={colors.textMuted} size={16} />
              </View>
            </View>

            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.min(1, status.ratio) * 100}%`,
                    backgroundColor: status.done ? colors.sage : colors.gold,
                  },
                ]}
              />
            </View>

            <AppText
              variant="mono"
              muted={!status.overdue}
              color={status.overdue ? colors.danger : undefined}
              style={styles.detail}
            >
              {status.summary(fmtMoney)}
            </AppText>
          </Pressable>
        );
      })}

      {/* Above the goals, because it is the thing that moves them. */}
      <View style={styles.autoCard}>
        <AppText variant="label" muted style={styles.autoLabel}>
          Saving each cycle
        </AppText>
        <TextInput
          style={styles.autoInput}
          value={perCycle}
          onChangeText={setPerCycle}
          onBlur={commitPerCycle}
          onSubmitEditing={commitPerCycle}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
        />
        <AppText variant="mono" muted style={styles.autoHint}>
          {perCycle.trim() === ''
            ? 'Set an amount and it is added across your goals at the end of each cycle, so you do not have to keep topping them up by hand.'
            : `Added when each cycle ends, not when you set it — the money follows the saving. A goal never takes more than it still needs; the rest goes to the others.`}
        </AppText>
      </View>

      {goals.length === 0 && (
        <AppText variant="body" muted style={styles.empty}>
          No goals yet — an emergency fund, a trip, a deposit.
        </AppText>
      )}

      <Pressable style={styles.addBtn} onPress={() => openEditor()}>
        <AppText variant="bodySemi" color={colors.onAction}>
          Add a goal
        </AppText>
      </Pressable>

    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 80 },
    intro: { marginBottom: 20, lineHeight: 20 },
    card: { backgroundColor: c.mist, borderRadius: radius.lg, padding: 16, marginBottom: 12 },
    autoCard: {
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      padding: 16,
      marginBottom: 18,
    },
    autoLabel: { marginBottom: 8, marginLeft: 2 },
    autoInput: {
      backgroundColor: c.haze,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      height: 48,
      color: c.text,
      fontFamily: 'Archivo_400Regular',
      fontSize: 16,
    },
    autoHint: { marginTop: 10, fontSize: 11, lineHeight: 16 },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    goalName: { flex: 1, paddingRight: 12 },
    chevron: { marginLeft: 8, marginRight: -4 },
    track: { height: 6, borderRadius: 6, backgroundColor: c.line, overflow: 'hidden', marginTop: 14 },
    fill: { height: 6, borderRadius: 6 },
    detail: { marginTop: 8, fontSize: 12, lineHeight: 17 },
    empty: { textAlign: 'center', paddingVertical: 20 },
    addBtn: {
      height: 50,
      borderRadius: radius.md,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
    },
  });
}
