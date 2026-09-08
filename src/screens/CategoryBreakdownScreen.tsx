import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import { breakdownHeadline, categoryBreakdown, type Breakdown } from '../categoryBreakdown';
import { prettyDate, todayKey } from '../dateUtils';
import { expensesBetween, getCycleDay } from '../db';
import { cycleRange } from '../payCycle';
import { fmtMoney } from '../spending';
import { useTheme } from '../ThemeContext';
import { radius, shadow, type Theme } from '../theme';
import type { HomeStackParams } from '../navigation';

type Props = NativeStackScreenProps<HomeStackParams, 'CategoryBreakdown'>;

const EMPTY: Breakdown = { slices: [], total: 0, count: 0, previousTotal: null };

export default function CategoryBreakdownScreen({}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // How many cycles back we are looking; 0 is the one in progress.
  const [back, setBack] = useState(0);
  const [range, setRange] = useState<ReturnType<typeof cycleRange> | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown>(EMPTY);
  const [oldest, setOldest] = useState(false);

  const load = useCallback(async (steps: number) => {
    const today = todayKey();
    const day = await getCycleDay();
    const window = cycleRange(day, today, steps);
    const before = cycleRange(day, today, steps + 1);
    const [rows, prevRows] = await Promise.all([
      expensesBetween(window.start, window.end),
      expensesBetween(before.start, before.end),
    ]);
    setRange(window);
    setBreakdown(
      categoryBreakdown(rows, prevRows, { elapsed: window.elapsed, total: window.days })
    );
    // Nothing at all in the cycle before this one means there is no earlier
    // history worth paging into, so the back arrow stops rather than walking
    // through empty months forever.
    setOldest(prevRows.length === 0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(back);
    }, [load, back])
  );

  const headline = breakdownHeadline(breakdown, fmtMoney);
  const spentLabel = range?.current ? 'spent so far this cycle' : 'spent that cycle';
  const change =
    breakdown.previousTotal != null && breakdown.previousTotal > 0
      ? breakdown.total - breakdown.previousTotal
      : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.summary}>
        <AppText variant="mono" color={colors.onInkMuted}>
          {spentLabel}
        </AppText>
        <AppText variant="monoBold" color={colors.onInk} style={styles.total}>
          {fmtMoney(breakdown.total)}
        </AppText>
        <AppText variant="mono" color={colors.onInkMuted} style={styles.range}>
          {range ? `${prettyDate(range.start)} — ${prettyDate(range.end)}` : ' '}
        </AppText>
        {change != null && (
          <AppText
            variant="mono"
            color={change > 0 ? colors.danger : colors.sage}
            style={styles.change}
          >
            {change > 0 ? '▲' : '▼'} {fmtMoney(Math.abs(change))} on the cycle before
          </AppText>
        )}
      </View>

      <View style={styles.nav}>
        <Pressable
          style={[styles.navBtn, oldest && styles.navBtnOff]}
          disabled={oldest}
          onPress={() => setBack((b) => b + 1)}
        >
          <AppText variant="bodySemi" color={oldest ? colors.textMuted : colors.text}>
            ← Earlier
          </AppText>
        </Pressable>
        <Pressable
          style={[styles.navBtn, back === 0 && styles.navBtnOff]}
          disabled={back === 0}
          onPress={() => setBack((b) => Math.max(0, b - 1))}
        >
          <AppText variant="bodySemi" color={back === 0 ? colors.textMuted : colors.text}>
            Later →
          </AppText>
        </Pressable>
      </View>

      {!!headline && (
        <AppText variant="bodySemi" style={styles.headline}>
          {headline}
        </AppText>
      )}

      {breakdown.slices.length === 0 ? (
        <AppText variant="body" muted style={styles.empty}>
          Nothing logged in this cycle. Step back to an earlier one, or add an expense from Home.
        </AppText>
      ) : (
        <>
          {/* One bar showing the whole cycle at a glance: proportions are far
              easier to judge side by side than as a column of percentages. */}
          <View style={styles.stack}>
            {breakdown.slices.map((s) => (
              <View
                key={s.key}
                style={{ flex: Math.max(s.share, 0.01), backgroundColor: s.color }}
              />
            ))}
          </View>

          <View style={styles.card}>
            {breakdown.slices.map((s, i) => (
              <View
                key={s.key}
                style={[styles.row, i === breakdown.slices.length - 1 && styles.rowLast]}
              >
                <View style={styles.rowHead}>
                  <View style={[styles.dot, { backgroundColor: s.color }]} />
                  <AppText variant="bodySemi" style={styles.rowLabel}>
                    {s.label}
                  </AppText>
                  <AppText variant="monoBold">{fmtMoney(s.total)}</AppText>
                </View>

                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${Math.max(2, s.share * 100)}%`, backgroundColor: s.color },
                    ]}
                  />
                </View>

                <View style={styles.rowFoot}>
                  <AppText variant="mono" muted style={styles.meta}>
                    {Math.round(s.share * 100)}% · {s.count} {s.count === 1 ? 'buy' : 'buys'} ·{' '}
                    {fmtMoney(s.perDay)}/day
                  </AppText>
                  {s.delta != null && s.delta !== 0 && (
                    <AppText
                      variant="mono"
                      color={s.delta > 0 ? colors.danger : colors.sage}
                      style={styles.meta}
                    >
                      {s.delta > 0 ? '▲' : '▼'} {fmtMoney(Math.abs(s.delta))}
                    </AppText>
                  )}
                </View>

                {range?.current && (
                  <AppText variant="mono" muted style={styles.projection}>
                    On track for {fmtMoney(s.projected)} by the cycle's end
                  </AppText>
                )}
              </View>
            ))}
          </View>

          <AppText variant="mono" muted style={styles.footnote}>
            {range?.current
              ? `Day ${range.elapsed} of ${range.days}. Projections assume you carry on at this pace.`
              : `${range?.days ?? 0} days, ${breakdown.count} transaction${
                  breakdown.count === 1 ? '' : 's'
                }.`}
          </AppText>
        </>
      )}
    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 70 },
    summary: {
      backgroundColor: c.ink,
      borderRadius: radius.xl,
      paddingVertical: 24,
      paddingHorizontal: 20,
      alignItems: 'center',
      ...shadow.card,
    },
    total: { fontSize: 32, marginTop: 4 },
    range: { marginTop: 8, fontSize: 11 },
    change: { marginTop: 10, fontSize: 11 },
    nav: { flexDirection: 'row', gap: 10, marginTop: 14 },
    navBtn: {
      flex: 1,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: c.mist,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navBtnOff: { opacity: 0.45 },
    headline: { marginTop: 22, marginBottom: 4, lineHeight: 21 },
    empty: { marginTop: 20, lineHeight: 21 },
    stack: {
      flexDirection: 'row',
      height: 10,
      borderRadius: 5,
      overflow: 'hidden',
      marginTop: 18,
      marginBottom: 16,
      gap: 2,
    },
    card: { backgroundColor: c.mist, borderRadius: radius.lg, paddingHorizontal: 16 },
    row: {
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    rowLast: { borderBottomWidth: 0 },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowLabel: { flex: 1 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    track: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.haze,
      marginTop: 12,
      overflow: 'hidden',
    },
    fill: { height: 6, borderRadius: 3 },
    rowFoot: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      marginTop: 10,
    },
    meta: { fontSize: 11 },
    projection: { marginTop: 6, fontSize: 11 },
    footnote: { marginTop: 16, fontSize: 11, lineHeight: 16 },
  });
}
