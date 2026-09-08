import { useMemo } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import AppText from './AppText';
import DayOfMonthGrid from './DayOfMonthGrid';
import { useTheme } from '../ThemeContext';
import { font, radius, type Theme } from '../theme';

type Props = {
  amount: string;
  day: number | null;
  onChangeAmount: (v: string) => void;
  onChangeDay: (d: number | null) => void;
  compact?: boolean; // tighter spacing + smaller day grid (onboarding)
};

export default function PaydayFields({
  amount,
  day,
  onChangeAmount,
  onChangeDay,
  compact,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors, !!compact), [colors, compact]);

  return (
    <View>
      <AppText variant="label" muted style={styles.label}>
        Salary amount
      </AppText>
      <View style={styles.amountRow}>
        <AppText variant="monoBold" muted style={styles.currency}>
          $
        </AppText>
        <TextInput
          style={styles.amountInput}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={(v) => onChangeAmount(v.replace(/[^0-9.]/g, ''))}
        />
      </View>

      <AppText variant="label" muted style={[styles.label, styles.labelSpaced]}>
        Payday
      </AppText>
      <DayOfMonthGrid day={day} onChange={onChangeDay} compact={compact} />
    </View>
  );
}

function makeStyles(c: Theme, compact: boolean) {
  return StyleSheet.create({
    label: { marginBottom: compact ? 5 : 8, marginLeft: 2 },
    labelSpaced: { marginTop: compact ? 12 : 22 },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      backgroundColor: c.haze,
    },
    currency: { marginRight: 6 },
    amountInput: {
      flex: 1,
      fontFamily: font.monoBold,
      fontSize: compact ? 17 : 20,
      color: c.text,
      paddingVertical: compact ? 8 : 14,
    },
  });
}
