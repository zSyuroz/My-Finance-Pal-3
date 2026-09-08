import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import AppText from './AppText';
import type { Theme } from '../theme';

export type DayMarking = {
  dots?: { key: string; color: string }[];
  payday?: boolean;
  /** A recurring expense falls on this day. */
  bill?: boolean;
};

type Props = {
  date?: { dateString: string; day: number };
  state?: '' | 'today' | 'disabled' | 'inactive';
  marking?: DayMarking;
  selected: boolean;
  colors: Theme;
  onPress: (dateString: string) => void;
};

function CalendarDay({ date, state, marking, selected, colors, onPress }: Props) {
  if (!date) return <View style={styles.cell} />;

  const disabled = state === 'disabled' || state === 'inactive';
  const isToday = state === 'today';
  const payday = !!marking?.payday;
  const bill = !!marking?.bill;
  const dots = marking?.dots?.slice(0, 3) ?? [];

  const numColor = payday
    ? colors.onGold
    : disabled
    ? colors.onInkFaint
    : selected
    ? colors.onInk
    : colors.onInk;

  return (
    <Pressable
      style={styles.cell}
      onPress={() => onPress(date.dateString)}
      hitSlop={4}
    >
      <View
        style={[
          styles.disc,
          payday && { backgroundColor: colors.gold },
          selected && !payday && {
            borderColor: colors.iris,
            borderWidth: 2,
            backgroundColor: colors.iris + '2E',
          },
          isToday && !payday && !selected && { backgroundColor: 'rgba(255,255,255,0.10)' },
          bill && !payday && !selected && { borderColor: colors.danger, borderWidth: 1.5 },
        ]}
      >
        <AppText variant="mono" color={numColor} style={payday && styles.paydayNum}>
          {date.day}
        </AppText>
      </View>

      <View style={styles.dotRow}>
        {payday
          ? isToday && <View style={[styles.dot, { backgroundColor: colors.gold }]} />
          : dots.map((d) => (
              <View key={d.key} style={[styles.dot, { backgroundColor: d.color }]} />
            ))}
        {bill && !payday && <View style={[styles.dot, { backgroundColor: colors.danger }]} />}
        {isToday && !payday && !bill && dots.length === 0 && (
          <View style={[styles.dot, { backgroundColor: colors.sage }]} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: { width: 40, alignItems: 'center', paddingVertical: 2 },
  disc: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paydayNum: { fontFamily: 'SpaceMono_700Bold' },
  dotRow: { flexDirection: 'row', gap: 3, height: 8, marginTop: 3 },
  dot: { width: 5, height: 5, borderRadius: 3 },
});

export default memo(CalendarDay);
