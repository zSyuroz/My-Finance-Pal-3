import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppText from '../components/AppText';
import ConfirmDialog from '../components/ConfirmDialog';
import CalendarDay, { type DayMarking } from '../components/CalendarDay';
import MonthPager, { monthKey, RANGE } from '../components/MonthPager';
import {
  eventsFrom,
  getPayday,
  listEvents,
  listRecurring,
  type EventRow,
  type RecurringRow,
} from '../db';
import { fmtTime, todayKey } from '../dateUtils';
import { fmtMoney } from '../spending';
import { paydayKeyFor } from '../payCycle';
import { useTheme } from '../ThemeContext';
import { font, radius, shadow, type Theme } from '../theme';
import type { CalendarStackParams } from '../navigation';

type Props = NativeStackScreenProps<CalendarStackParams, 'CalendarHome'>;

/** "Fri, 11 Sept" — enough to place an event without repeating the year. */
function shortDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function CalendarScreen({ navigation }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [selected, setSelected] = useState(todayKey());
  // The month the strip opens on. Fixed for the life of the screen: the pager
  // draws a year either side of it and simply scrolls between them.
  const [visible] = useState(() => {
    const [y, m] = todayKey().split('-').map(Number);
    return { y, m };
  });
  const [marked, setMarked] = useState<Record<string, DayMarking>>({});
  const [upcoming, setUpcoming] = useState<EventRow[]>([]);
  const [payday, setPaydayState] = useState<{ amount: number | null; day: number | null }>(
    { amount: null, day: null }
  );
  const [recurring, setRecurring] = useState<RecurringRow[]>([]);
  // The day awaiting an "event or bill?" answer.
  const [addFor, setAddFor] = useState<string | null>(null);

  const refresh = useCallback(
    async (vis: { y: number; m: number }) => {
      const [all, pay, rules] = await Promise.all([
        listEvents(),
        getPayday(),
        listRecurring(),
      ]);
      setPaydayState(pay);
      const active = rules.filter((r) => r.active);
      setRecurring(active);

      const map: Record<string, DayMarking> = {};
      for (const e of all) {
        if (!map[e.date]) map[e.date] = { dots: [] };
        if ((map[e.date].dots?.length ?? 0) < 3) {
          map[e.date].dots!.push({ key: e.id, color: e.color });
        }
      }
      // The whole strip is drawn at once, so every month it can reach needs
      // its marks now — there is no "on arrival" to add them at.
      for (let o = -RANGE; o <= RANGE; o++) {
        const d = new Date(vis.y, vis.m - 1 + o, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        // Bills first, so a payday landing on the same square still wins the
        // disc — one is money arriving, and that is the better news.
        for (const rule of active) {
          const key = paydayKeyFor(y, m, rule.dayOfMonth);
          map[key] = { ...(map[key] ?? {}), bill: true };
        }
        if (pay.day != null) {
          const key = paydayKeyFor(y, m, pay.day);
          map[key] = { ...(map[key] ?? {}), payday: true };
        }
      }
      setMarked(map);
    },
    []
  );

  // Always from today, never from the selected square. Anchoring it to the
  // selection meant tapping a date past your next event made the list read
  // "nothing coming up" while something was in fact coming up.
  const refreshUpcoming = useCallback(async () => {
    setUpcoming(await eventsFrom(todayKey()));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh(visible);
      refreshUpcoming();
    }, [refresh, refreshUpcoming, visible])
  );

  // Tapping a square is the add control: there is no floating button any
  // more, and a calendar you cannot add to by touching a date is a calendar
  // that makes you hunt.
  const onDayPress = useCallback((dateString: string) => {
    setSelected(dateString);
    setAddFor(dateString);
  }, []);

  const selPaydayKey =
    payday.day != null
      ? paydayKeyFor(
          Number(selected.slice(0, 4)),
          Number(selected.slice(5, 7)),
          payday.day
        )
      : null;
  const selectedIsPayday = selPaydayKey === selected;

  /**
   * The next time each bill falls due, soonest first.
   *
   * A monthly rule has no single date, so this walks forward from today to
   * the first occurrence — this month if the day has not passed, next month
   * if it has — clamping the day the way every other date here does.
   */
  const upcomingBills = recurring
    .map((r) => {
      const [y, m] = todayKey().split('-').map(Number);
      const thisMonth = paydayKeyFor(y, m, r.dayOfMonth);
      const next = new Date(y, m, 1);
      const date =
        thisMonth >= todayKey()
          ? thisMonth
          : paydayKeyFor(next.getFullYear(), next.getMonth() + 1, r.dayOfMonth);
      return { rule: r, date };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerCard}>
        {/* Months on a paged strip, so a swipe carries the next one in rather
            than redrawing the grid in place. */}
        <MonthPager
          anchor={visible}
          renderMonth={(month, width) => (
            <Calendar
              key={`${scheme}-${monthKey(month)}`}
              current={monthKey(month)}
              firstDay={1}
              onDayPress={(d: DateData) => onDayPress(d.dateString)}
              // The pager owns which month is shown; the grid must not also
              // try to change it, or the two fight over the same swipe.
              disableMonthChange
              hideArrows
              markedDates={marked as any}
              // Leading and trailing days stay, so a week is never cut in
              // half — but a sixth row is not forced. September ends on a
              // Wednesday, and padding it to six weeks showed a full week of
              // October that belongs to no part of the month being read.
              hideExtraDays={false}
              dayComponent={({ date, state, marking }: any) => (
                <CalendarDay
                  date={date}
                  state={state}
                  marking={marking}
                  selected={date?.dateString === selected}
                  colors={colors}
                  onPress={onDayPress}
                />
              )}
              style={[styles.calendar, { width }]}
              theme={{
                calendarBackground: colors.ink,
                monthTextColor: colors.onInk,
                textMonthFontFamily: font.display,
                textMonthFontSize: 20,
                textSectionTitleColor: colors.onInkMuted,
                textDayHeaderFontFamily: font.bodySemi,
                textDayHeaderFontSize: 12,
                // Rows spaced to fill the card rather than huddling at the top
                // of it. This is the library's own knob for row height.
                weekVerticalMargin: 9,
              }}
            />
          )}
        />
      </View>

      <FlatList
        data={upcoming}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {upcomingBills.length > 0 && (
              <>
                <AppText variant="label" muted style={styles.upcomingLabel}>
                  Upcoming bills
                </AppText>
                {upcomingBills.map(({ rule, date }) => (
                  <Pressable
                    key={rule.id}
                    style={styles.billCard}
                    onPress={() =>
                      navigation
                        .getParent()
                        ?.navigate('Settings', { screen: 'RecurringExpenses' })
                    }
                  >
                    <View style={styles.billHead}>
                      <AppText variant="title">{rule.label}</AppText>
                      <AppText variant="monoBold" color={colors.danger}>
                        {fmtMoney(rule.amount)}
                      </AppText>
                    </View>
                    <AppText variant="mono" muted style={styles.billSub}>
                      {shortDate(date)} · every month
                    </AppText>
                  </Pressable>
                ))}
              </>
            )}

            {selectedIsPayday ? (
            <View style={styles.paydayCard}>
              <View style={styles.coin}>
                <AppText variant="monoBold" color={colors.onGold}>
                  $
                </AppText>
              </View>
              <View style={{ flex: 1 }}>
                {/* On a coloured surface the page's text tokens are a lottery:
                    the muted grey vanished against it entirely. Anything drawn
                    here takes the onGold pair, the same rule ink already has. */}
                <AppText variant="title" color={colors.onGold}>
                  Payday
                </AppText>
                {payday.amount != null && (
                  <AppText variant="mono" color={colors.onGoldMuted}>
                    ${payday.amount.toLocaleString()} expected
                  </AppText>
                )}
              </View>
            </View>
            ) : null}

            <AppText variant="label" muted style={styles.upcomingLabelSpaced}>
              Upcoming events
            </AppText>
          </>
        }
        ListEmptyComponent={
          !selectedIsPayday ? (
            <AppText variant="body" muted style={styles.empty}>
              Nothing coming up. Tap a date to add an event.
            </AppText>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.eventCard}
            onPress={() =>
              navigation.navigate('EventEditor', { id: item.id, date: item.date })
            }
          >
            <View style={[styles.rule, { backgroundColor: item.color }]} />
            <View style={{ flex: 1 }}>
              <AppText variant="title">{item.title || 'Untitled'}</AppText>
              <AppText variant="mono" muted style={styles.eventTime}>
                {/* The day has to travel with the row now that the list spans
                    more than one of them. */}
                {shortDate(item.date)}
                {item.allDay
                  ? ' · All day'
                  : ` · ${fmtTime(item.startTime)}${
                      item.endTime ? '  –  ' + fmtTime(item.endTime) : ''
                    }`}
              </AppText>
              {!!item.notes && (
                <AppText variant="body" muted numberOfLines={1} style={styles.eventNotes}>
                  {item.notes}
                </AppText>
              )}
            </View>
          </Pressable>
        )}
      />

      <ConfirmDialog
        visible={!!addFor}
        title={addFor ? `Add to ${shortDate(addFor)}` : ''}
        message="A one-off event, or a bill that repeats on this day every month?"
        confirmLabel="Event"
        cancelLabel="Monthly bill"
        onConfirm={() => {
          const date = addFor;
          setAddFor(null);
          if (date) navigation.navigate('EventEditor', { date });
        }}
        onCancel={() => {
          const date = addFor;
          setAddFor(null);
          if (date) {
            navigation.getParent()?.navigate('Settings', {
              screen: 'RecurringExpenseEditor',
              params: { dayOfMonth: Number(date.slice(8, 10)) },
            });
          }
        }}
        onDismiss={() => setAddFor(null)}
      />
    </SafeAreaView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.haze },
    headerCard: {
      backgroundColor: c.ink,
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
      paddingTop: 4,
      paddingBottom: 12,
      ...shadow.card,
    },
    calendar: { backgroundColor: 'transparent', paddingBottom: 4 },
    list: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 120 },
    empty: { paddingVertical: 28, textAlign: 'center' },
    upcomingLabel: { marginBottom: 10, marginLeft: 2 },
    upcomingLabelSpaced: { marginTop: 22, marginBottom: 10, marginLeft: 2 },
    billCard: {
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.danger,
      padding: 14,
      marginBottom: 12,
    },
    billHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    billSub: { marginTop: 6, fontSize: 11, lineHeight: 16 },
    paydayCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      // Payday stays gold: it is the one thing on this screen that is money
      // arriving, and it should not look like another button.
      backgroundColor: c.gold,
      borderRadius: radius.lg,
      padding: 14,
      marginBottom: 12,
    },
    coin: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 2,
      borderColor: c.onGoldMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventCard: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      padding: 14,
      marginBottom: 10,
    },
    rule: { width: 4, borderRadius: 2 },
    eventTime: { marginTop: 3 },
    eventNotes: { marginTop: 4 },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 24,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: c.action + '26',
      borderWidth: 1,
      borderColor: c.action + '5C',
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.card,
    },
    fabPlus: { fontSize: 30, lineHeight: 34, marginTop: -2 },
  });
}
