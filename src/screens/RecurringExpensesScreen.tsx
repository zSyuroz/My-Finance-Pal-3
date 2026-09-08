import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import { listRecurring, upsertRecurring, type RecurringRow } from '../db';
import { categoryMeta, fmtMoney } from '../spending';
import { useTheme } from '../ThemeContext';
import { radius, shadow, type Theme } from '../theme';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'RecurringExpenses'>;

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function RecurringExpensesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [rows, setRows] = useState<RecurringRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      listRecurring().then(setRows);
    }, [])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('RecurringExpenseEditor', {})} hitSlop={10}>
          <AppText variant="bodySemi" color={colors.iris}>
            Add
          </AppText>
        </Pressable>
      ),
    });
  }, [navigation, colors.iris]);

  const toggleActive = async (row: RecurringRow) => {
    const next = { ...row, active: row.active ? 0 : 1 };
    setRows((rs) => rs.map((r) => (r.id === row.id ? next : r)));
    await upsertRecurring(next);
  };

  return (
    <View style={styles.container}>
      <AppText variant="body" muted style={styles.intro}>
        These post automatically to Spending once their day arrives each month
        — no need to log them by hand.
      </AppText>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={rows.length === 0 ? styles.emptyWrap : styles.list}
        ListEmptyComponent={
          <AppText variant="body" muted center>
            Nothing yet. Add rent, subscriptions, or bills.
          </AppText>
        }
        renderItem={({ item }) => {
          const meta = categoryMeta(item.category);
          return (
            <View style={[styles.card, !item.active && styles.cardDim]}>
              <Pressable
                style={styles.cardBody}
                onPress={() =>
                  navigation.navigate('RecurringExpenseEditor', { id: item.id })
                }
              >
                <View style={[styles.dot, { backgroundColor: meta.color }]} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySemi">{item.label || meta.label}</AppText>
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
        }}
      />
    </View>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    intro: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 },
    list: { paddingHorizontal: 20, paddingBottom: 40 },
    emptyWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
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
    dot: { width: 10, height: 10, borderRadius: 5 },
    meta: { marginTop: 2 },
  });
}
