import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import RowIcon from '../components/RowIcon';
import { listGoals, type GoalRow } from '../db';
import { todayKey } from '../dateUtils';
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

  const refresh = useCallback(async () => {
    setGoals(await listGoals());
  }, []);

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
