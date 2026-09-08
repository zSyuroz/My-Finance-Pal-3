import { Pressable, StyleSheet, View } from 'react-native';

import AppText from './AppText';
import { categoryMeta, fmtMoney, incomeCategoryMeta } from '../spending';
import { shortDate } from '../dateUtils';
import { useTheme } from '../ThemeContext';
import { radius, type Theme } from '../theme';
import type { TransactionItem } from '../transactions';

/** One row for either an expense or an income entry — used on Home's Recent list and the full History list. */
export default function TransactionRow({ item, onPress }: { item: TransactionItem; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  if (item.kind === 'income') {
    const incomeMeta = incomeCategoryMeta(item.category);
    return (
      <Pressable style={styles.row} onPress={onPress}>
        {/* Coloured by where the money came from, matching how expense rows are
            coloured by where it went — so a mixed list is scannable both ways. */}
        <View style={[styles.catDot, { backgroundColor: incomeMeta.color }]} />
        <View style={{ flex: 1 }}>
          <AppText variant="bodySemi">{item.source || 'Income'}</AppText>
          <AppText variant="body" muted numberOfLines={1}>
            {item.note ? `${incomeMeta.label} · ${item.note}` : incomeMeta.label}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="monoBold" color={colors.sage}>
            +{fmtMoney(item.amount)}
          </AppText>
          <AppText variant="mono" muted style={styles.rowDate}>
            {shortDate(item.date)}
          </AppText>
        </View>
      </Pressable>
    );
  }

  const meta = categoryMeta(item.category);
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.catDot, { backgroundColor: meta.color }]} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodySemi">{meta.label}</AppText>
        {!!item.note && (
          <AppText variant="body" muted numberOfLines={1}>
            {item.note}
          </AppText>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <AppText variant="monoBold">{fmtMoney(item.amount)}</AppText>
        <AppText variant="mono" muted style={styles.rowDate}>
          {shortDate(item.date)}
        </AppText>
      </View>
    </Pressable>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      padding: 14,
      marginBottom: 10,
    },
    catDot: { width: 10, height: 10, borderRadius: 5 },
    rowDate: { marginTop: 2 },
  });
}
