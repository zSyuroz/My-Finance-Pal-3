import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { makeSettingsStyles, RowValue, SettingsRow } from '../components/SettingsRow';
import { currencyMeta, currencyPrefix } from '../currency';
import { useCurrency } from '../CurrencyContext';
import { getPayday, listAccounts, listBudgets, listGoals, listRecurring } from '../db';
import { useTheme } from '../ThemeContext';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'MoneySettings'>;

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function MoneySettingsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { code } = useCurrency();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);

  const [payday, setPaydayState] = useState<{ amount: number | null; day: number | null }>({
    amount: null,
    day: null,
  });
  const [accountCount, setAccountCount] = useState(0);
  const [budgetCount, setBudgetCount] = useState(0);
  const [goalCount, setGoalCount] = useState(0);
  const [activeRecurring, setActiveRecurring] = useState(0);

  useFocusEffect(
    useCallback(() => {
      getPayday().then(setPaydayState);
      listAccounts().then((rows) => setAccountCount(rows.length));
      listBudgets().then((rows) => setBudgetCount(rows.filter((b) => b.amount > 0).length));
      listGoals().then((rows) => setGoalCount(rows.length));
      listRecurring().then((rows) => setActiveRecurring(rows.filter((r) => r.active).length));
    }, [])
  );

  // Read off the recurring income rules: the amount is everything expected in
  // a cycle and the day is the one it turns on. Either half is worth reporting
  // on its own — keying this off the day alone meant a saved salary read as
  // "Not set", which looks exactly like the save having failed.
  const money = payday.amount != null ? `${currencyPrefix()}${payday.amount.toLocaleString()}` : null;
  const dayText = payday.day != null ? ordinal(payday.day) : null;
  const paydayValue =
    money && dayText ? `${money} · ${dayText}` : (money ?? dayText ?? 'Not set');

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <SettingsRow
          icon="coin"
          label="Currency"
          onPress={() => navigation.navigate('Currency')}
          right={<RowValue>{`${currencyMeta(code).symbol} ${code}`}</RowValue>}
        />
        <SettingsRow
          icon="wallet"
          label="Income"
          onPress={() => navigation.navigate('RecurringIncome')}
          right={<RowValue>{paydayValue}</RowValue>}
        />
        <SettingsRow
          icon="bank"
          label="Accounts & net worth"
          onPress={() => navigation.navigate('Accounts')}
          right={<RowValue>{accountCount > 0 ? `${accountCount}` : 'None'}</RowValue>}
        />
        <SettingsRow
          icon="chart"
          label="Budgets"
          onPress={() => navigation.navigate('Budgets')}
          right={<RowValue>{budgetCount > 0 ? `${budgetCount} set` : 'None set'}</RowValue>}
        />
        <SettingsRow
          icon="target"
          label="Goals"
          onPress={() => navigation.navigate('Goals')}
          right={<RowValue>{goalCount > 0 ? `${goalCount}` : 'None'}</RowValue>}
        />
        <SettingsRow
          icon="repeat"
          label="Recurring expenses"
          last
          onPress={() => navigation.navigate('RecurringExpenses')}
          right={
            <RowValue>{activeRecurring > 0 ? `${activeRecurring} active` : 'None set'}</RowValue>
          }
        />
      </View>
    </ScrollView>
  );
}
