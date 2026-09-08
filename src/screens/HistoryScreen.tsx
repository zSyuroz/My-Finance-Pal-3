import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import TransactionRow from '../components/TransactionRow';
import { listAllExpenses, listAllIncome } from '../db';
import { mergeTransactions, type TransactionItem } from '../transactions';
import { useTheme } from '../ThemeContext';
import { type Theme } from '../theme';
import type { HomeStackParams } from '../navigation';

type Props = NativeStackScreenProps<HomeStackParams, 'History'>;

export default function HistoryScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [items, setItems] = useState<TransactionItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([listAllExpenses(), listAllIncome()]).then(([expenses, income]) => {
        setItems(mergeTransactions(expenses, income));
      });
    }, [])
  );

  return (
    <FlatList
      style={styles.container}
      data={items}
      keyExtractor={(e) => `${e.kind}-${e.id}`}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <AppText variant="body" muted style={styles.empty}>
          No transactions yet.
        </AppText>
      }
      renderItem={({ item }) => (
        <TransactionRow
          item={item}
          onPress={() =>
            item.kind === 'income'
              ? navigation.navigate('IncomeEditor', { id: item.id })
              : navigation.navigate('AddExpense', { id: item.id })
          }
        />
      )}
    />
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    list: { padding: 20, paddingBottom: 40 },
    empty: { textAlign: 'center', paddingVertical: 24 },
  });
}
