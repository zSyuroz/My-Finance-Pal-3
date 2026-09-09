import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppText from '../components/AppText';
import Avatar from '../components/Avatar';
import RowIcon from '../components/RowIcon';
import Pager from '../components/Pager';
import Sparkline from '../components/Sparkline';
import SpendRing from '../components/SpendRing';
import TransactionRow from '../components/TransactionRow';
import {
  applyDueIncome,
  applyDueRecurring,
  applyDueSavings,
  applyDueSharedRecurring,
  countTransactions,
  expensesBetween,
  getNotificationsEnabled,
  getPayday,
  getProfile,
  incomeBetween,
  lifetimeTotals,
  captureNetWorth,
  migratePaydayToRule,
  getCycleDay,
  getSavingsPerCycle,
  getSetting,
  KEYS,
  expensesSince,
  incomeSince,
  listAccounts,
  listBudgets,
  listGoals,
  listNetWorthSnapshots,
  listPayments,
  listRecurring,
  listSharedExpenses,
  listSplits,
  recentExpenses,
  recentIncome,
  type ExpenseRow,
  type AccountRow,
  type GoalRow,
  type IncomeRow,
  type NetWorthSnapshot,
  type PaymentRow,
  type Profile,
  type RecurringRow,
  type SharedExpenseRow,
  type SharedSplitRow,
} from '../db';
import { shiftDays, shortDate, startOfMonthKey, todayKey } from '../dateUtils';
import { notifyRecurringPosted } from '../notifications';
import { cycleRange, cycleWindow, payCycle, paydayLabel } from '../payCycle';
import { budgetSummary, type BudgetSummary } from '../budget';
import {
  DEFAULT_HOME_CARD_ORDER,
  parseHomeCardOrder,
  type HomeCardKey,
} from '../homeCards';
import { allocateSavings } from '../autoSave';
import { billsAhead, safeToSpend } from '../cycleCash';
import { cycleOutlook } from '../outlook';
import { debtHeadline, debtProgress, debtSummary } from '../debt';
import { goalStatus } from '../goals';
import { balances, myNet } from '../sharing';
import { emergencyFund, liveBalanceSince, netWorth, withLiveBalances } from '../networth';
import { monthKey, netWorthTrend, trendLine, type Trend } from '../netWorthTrend';
import {
  categoryMeta,
  fmtMoney,
  fmtMoneyRough,
  sumAmount,
  topCategory,
} from '../spending';
import {
  mergeTransactions,
  RECENT_MIN_ITEMS,
  RECENT_WINDOW_DAYS,
  type TransactionItem,
} from '../transactions';
import { useTheme } from '../ThemeContext';
import { radius, shadow, type Theme } from '../theme';
import type { HomeStackParams } from '../navigation';

type Props = NativeStackScreenProps<HomeStackParams, 'HomeMain'>;

/**
 * The card that was showing when Home was last left.
 *
 * Module scope rather than state, because the point is to survive the screen
 * being torn down and rebuilt — which is exactly what happens when you tap a
 * card and come back. It resets when the app does, so a fresh launch still
 * opens on whichever card the user put first.
 */
let lastCardShown = 0;

// "Recent" only shows the last 2 weeks — anything older is still saved
// forever, just tucked away in History instead of cluttering the dashboard.
// The window itself lives in ../transactions so the importer can reference it.

export default function HomeScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [payday, setPaydayState] = useState<{ amount: number | null; day: number | null }>(
    { amount: null, day: null }
  );
  const [cycleExpenses, setCycleExpenses] = useState<ExpenseRow[]>([]);
  // What had been spent by this same day of the previous cycle. Comparing
  // today against yesterday looked like a trend and was noise: most days have
  // nothing on one side or the other, so the tile spent its life saying it had
  // nothing to compare. The same point one cycle back is the comparison that
  // answers the question people actually have — am I spending more than usual.
  const [priorCycles, setPriorCycles] = useState<ExpenseRow[][]>([]);
  const [recent, setRecent] = useState<TransactionItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [lifetime, setLifetime] = useState({ income: 0, expenses: 0 });
  const [profile, setProfileState] = useState<Profile>({ name: '', avatar: null });
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [cardOrder, setCardOrder] = useState<HomeCardKey[]>(DEFAULT_HOME_CARD_ORDER);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [recurring, setRecurring] = useState<RecurringRow[]>([]);
  const [savingsPerCycle, setSavingsPerCycle] = useState<number | null>(null);
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);
  const [cycleDay, setCycleDay] = useState<number | null>(null);
  // Enough of the shared ledger to state a single balance. The Split tab owns
  // the detail; this is only the one number.
  const [shared, setShared] = useState<{
    expenses: SharedExpenseRow[];
    splits: SharedSplitRow[];
    payments: PaymentRow[];
  }>({ expenses: [], splits: [], payments: [] });
  // Bumped on every focus so the ring strip can put itself back where the
  // user left it — coming back to Home is not a rebuild, but the browser
  // still drops the scroll offset of a screen it had hidden.
  const [focusTick, setFocusTick] = useState(0);
  const [worthTrend, setWorthTrend] = useState<Trend>({
    change: null,
    points: 0,
    series: [],
    sinceStart: null,
  });

  const refresh = useCallback(async () => {
    await migratePaydayToRule();
    await applyDueIncome();
    const posted = await applyDueRecurring();
    if (posted.length > 0 && (await getNotificationsEnabled())) {
      for (const { rule, expense } of posted) {
        await notifyRecurringPosted(rule.label, expense.amount);
      }
    }
    const today = todayKey();
    const pay = await getPayday();
    setPaydayState(pay);
    setProfileState(await getProfile());

    const cycleDay = await getCycleDay();
    setCycleDay(cycleDay);
    const cycleStart = cycleDay != null ? cycleStartKey(cycleDay, today) : startOfMonthKey(today);
    await applyDueSavings(cycleStart);
    const recentStart = shiftDays(today, -(RECENT_WINDOW_DAYS - 1));
    const [inCycle, recentExp, recentInc, latestExp, latestInc, total, totals] =
      await Promise.all([
        expensesBetween(cycleStart, today),
        expensesBetween(recentStart, today),
        incomeBetween(recentStart, today),
        recentExpenses(RECENT_MIN_ITEMS),
        recentIncome(RECENT_MIN_ITEMS),
        countTransactions(),
        lifetimeTotals(),
      ]);
    setLifetime(totals);
    const window = cycleWindow(cycleDay, today);
    setBudget(budgetSummary(await listBudgets(), inCycle, window.elapsed, window.total));
    const rawAccounts = await listAccounts();
    // Home must show the same balances the Accounts screen does, so the same
    // adjustment is applied here rather than only in one place. Only the rows
    // that can possibly move the balance are read — none at all when no
    // everyday account is set, which is most people.
    const since = liveBalanceSince(rawAccounts);
    const [sinceSpent, sinceEarned] = since
      ? await Promise.all([expensesSince(since), incomeSince(since)])
      : [[], []];
    const accountRows = withLiveBalances(rawAccounts, sinceSpent, sinceEarned).accounts;
    setAccounts(accountRows);
    // Recorded on open rather than asked for: a history the user has to
    // remember to update is a history that stops after two months. Only the
    // current month is rewritten, so past months stay as they actually were.
    if (accountRows.length > 0) {
      const worthNow = netWorth(accountRows);
      await captureNetWorth(monthKey(today), worthNow.assets, worthNow.liabilities);
    }
    const history = await listNetWorthSnapshots();
    setSnapshots(history);
    setWorthTrend(netWorthTrend(history));
    setRecurring(await listRecurring());
    setSavingsPerCycle(await getSavingsPerCycle());

    // The shared ledger is caught up before it is read for the same reason the
    // personal one is: a balance that is a month stale is just wrong.
    await applyDueSharedRecurring();
    const [sharedExpenses, sharedSplits, sharedPayments] = await Promise.all([
      listSharedExpenses(),
      listSplits(),
      listPayments(),
    ]);
    setShared({ expenses: sharedExpenses, splits: sharedSplits, payments: sharedPayments });
    setCardOrder(parseHomeCardOrder(await getSetting(KEYS.homeCardOrder)));
    setGoals(await listGoals());
    setCycleExpenses(inCycle);
    // Three complete cycles back. Enough to be a habit, few enough to still
    // describe how this person lives now.
    setPriorCycles(
      await Promise.all(
        [1, 2, 3].map((back) => {
          const r = cycleRange(cycleDay, today, back);
          return expensesBetween(r.start, r.end);
        })
      )
    );

    // Prefer the 14-day window, but never leave Recent looking empty when
    // there is data to show: below the floor, fall back to the latest
    // transactions whenever they happened. The fallback is a superset of the
    // window (both are "newest first"), so this can't duplicate anything.
    const windowed = mergeTransactions(recentExp, recentInc);
    const latest = mergeTransactions(latestExp, latestInc).slice(0, RECENT_MIN_ITEMS);
    setRecent(windowed.length >= RECENT_MIN_ITEMS ? windowed : latest);
    setTotalCount(total);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      setFocusTick((n) => n + 1);
    }, [refresh])
  );

  const today = todayKey();
  const spentToday = sumAmount(cycleExpenses.filter((e) => e.date === today));
  const spentCycle = sumAmount(cycleExpenses);
  // "Saved so far" is everything earned minus everything spent, over all time
  // — so an imported statement moves it. It only falls back to prompting for a
  // salary while there's genuinely nothing recorded to add up.
  const saved = totalCount > 0 ? lifetime.income - lifetime.expenses : null;
  const fraction = payday.amount != null && payday.amount > 0 ? spentCycle / payday.amount : null;
  const top = topCategory(cycleExpenses);
  const cycle = payday.day != null ? payCycle(payday.day) : null;
  const notShown = Math.max(0, totalCount - recent.length);
  const overspent = payday.amount != null && spentCycle > payday.amount;
  const worth = netWorth(accounts);
  // Measured against this cycle's spending, annualised to a month, so the
  // runway reflects how this person actually lives rather than a guess.
  const fund = emergencyFund(accounts, spentCycle);
  // Only meaningful once income has actually been recorded for the cycle —
  // dividing by nothing would report a wild negative percentage on day one.
  const trendText = worth.any ? trendLine(worthTrend, fmtMoney) : null;
  // The window the cycle actually runs over, which is the payday cycle unless
  // an explicit reset day overrides it.
  const bounds = cycleBounds(cycleDay, today);
  const bills = billsAhead(recurring, cycleExpenses, bounds.start, bounds.end);
  // What the saving will actually take, not what was named: a goal never takes
  // more than it still needs, so with every goal met nothing is withheld.
  const savingPlanned = allocateSavings(savingsPerCycle ?? 0, goals).reduce(
    (total, a) => total + a.add,
    0
  );
  const safe = safeToSpend(
    payday.amount,
    spentCycle,
    bills.unpaidTotal,
    savingPlanned,
    cycle?.daysUntil ?? 0
  );

  // Bills are held apart from day-to-day spending on both sides: they are
  // known exactly, so projecting them would turn a fact into an estimate.
  const isBill = (e: ExpenseRow) => e.recurringId != null;
  const window = cycleWindow(cycleDay, today);
  const outlook = cycleOutlook({
    income: payday.amount,
    discretionary: cycleExpenses.filter((e) => !isBill(e)),
    postedBills: bills.paidTotal,
    billsToCome: bills.unpaidTotal,
    saving: savingPlanned,
    elapsed: window.elapsed,
    total: window.total,
    priorCycles: priorCycles.map((rows) => rows.filter((e) => !isBill(e))),
  });
  const debts = debtSummary(accounts);
  const payoff = debtProgress(snapshots, debts.totalOwed);
  const debtLine = debtHeadline(debts, fmtMoney);
  const splitNet = myNet(balances(shared.expenses, shared.splits, shared.payments));
  const openBills = shared.expenses.filter((e) => e.settledAt == null).length;

  /** The goal closest to being met, since that is the one worth a nudge. */
  const topGoal = goals
    .map((g) => ({ goal: g, status: goalStatus(g, today) }))
    .filter((g) => !g.status.done)
    .sort((a, b) => b.status.ratio - a.status.ratio)[0];

  // Every panel leads to the screen that owns its subject — the same screen
  // the matching Settings row opens — so a number is never a dead end. It is
  // pushed onto Home's own stack rather than switching tabs, so Back comes
  // back here instead of stranding the user in Settings.
  const openSettings = (
    screen: 'Profile' | 'RecurringIncome' | 'Accounts' | 'Budgets' | 'Goals' | 'RecurringExpenses'
  ) => navigation.navigate(screen);

  // The split ledger lives in its own tab, so this is the one card that has to
  // leave Home's stack. Back returns to the tab bar, not into a stack the user
  // never chose to enter.
  const openSplit = () =>
    navigation.getParent()?.navigate('Shared', { screen: 'SharedHome' });

  const arrow = (
    <AppText variant="mono" color={colors.iris} style={styles.tileMore}>
      →
    </AppText>
  );

  // Long-press either card for the same screen the Settings row opens: the
  // preference is about these cards, so it should be reachable from them.
  const openCardOrder = () => navigation.navigate('HomeCards');

  // Built here rather than inline so the pager can render them in whatever
  // order the user picked; the first one is what Home opens on.
  const ringCards: Record<HomeCardKey, ReactNode> = {
    spending: (
      <Pressable
        key="spending"
        style={styles.ringPage}
        onLongPress={openCardOrder}
      >
        <SpendRing
          fraction={fraction}
          amountLabel={fmtMoney(spentToday)}
          caption="spent today"
          trackColor={colors.onInkTrack}
        />
        {payday.amount != null && (
          <AppText variant="mono" color={colors.onInkMuted} style={styles.ringSub}>
            {fmtMoney(overspent ? -spentCycle : spentCycle)} of {fmtMoney(payday.amount)} this
            cycle
          </AppText>
        )}
        {cycle && (
          <AppText variant="mono" muted style={styles.paydayLine}>
            {paydayLabel(cycle.daysUntil)}
          </AppText>
        )}
      </Pressable>
    ),
    networth: (
      <Pressable
        key="networth"
        style={styles.ringPage}
        onLongPress={openCardOrder}
        onPress={() => openSettings('Accounts')}
      >
        {/* Net worth where "total saved" used to be. Cumulative
            cashflow was never savings — it counted only what had
            been recorded, so importing one month of statements made
            it read deeply negative. What you own minus what you owe
            is the figure that actually answers "am I getting
            anywhere". The ring fills with how much of what you own
            is still owed. */}
        <SpendRing
          fraction={worth.assets > 0 ? worth.liabilities / worth.assets : null}
          amountLabel={fmtMoney(worth.any ? worth.net : (saved ?? 0))}
          caption={worth.any ? 'net worth' : 'total saved'}
          trackColor={colors.onInkTrack}
        />
        <AppText variant="mono" color={colors.onInkMuted} style={styles.ringSub}>
          {worth.any
            ? `${fmtMoney(worth.assets)} owned · ${fmtMoney(worth.liabilities)} owed`
            : `${fmtMoney(lifetime.income)} in · ${fmtMoney(lifetime.expenses)} out`}
        </AppText>
        <AppText variant="mono" muted style={styles.paydayLine}>
          {fund.months != null
            ? `${fund.months.toFixed(1)} months of expenses in cash`
            : worth.any
              ? `${fmtMoney(fund.liquid)} of it spendable now`
              : totalCount > 0
                ? `across ${totalCount} transaction${totalCount === 1 ? '' : 's'}`
                : 'nothing logged yet'}
        </AppText>

        {trendText && (
          <View style={styles.trendRow}>
            <Sparkline
              values={worthTrend.series}
              color={(worthTrend.change ?? 0) < 0 ? colors.danger : colors.sage}
            />
            <AppText
              variant="mono"
              color={(worthTrend.change ?? 0) < 0 ? colors.danger : colors.sage}
              style={styles.trendText}
            >
              {trendText}
            </AppText>
          </View>
        )}
      </Pressable>
    ),
    safe: (
      <Pressable
        key="safe"
        style={styles.ringPage}
        onLongPress={openCardOrder}
        onPress={() => openSettings('RecurringIncome')}
      >
        {/* The number people actually open the app for. Bills that have not
            posted yet are already subtracted, so this is what is free to
            spend rather than what merely happens to be left. */}
        <SpendRing
          fraction={safe.fraction}
          amountLabel={safe.amount == null ? '—' : fmtMoney(safe.amount)}
          caption={safe.over ? 'over for this cycle' : 'safe to spend'}
          trackColor={colors.onInkTrack}
        />
        <AppText variant="mono" color={colors.onInkMuted} style={styles.ringSub}>
          {safe.amount == null
            ? 'Add your income to see what is left'
            : `${fmtMoney(Math.max(0, safe.perDay ?? 0))} a day for ${safe.daysLeft} day${
                safe.daysLeft === 1 ? '' : 's'
              }`}
        </AppText>
        <AppText variant="mono" muted style={styles.paydayLine}>
          {safe.amount == null
            ? 'Tap to add your income'
            : [
                `${fmtMoney(safe.spent)} spent`,
                `${fmtMoney(safe.committed)} in bills`,
                ...(safe.saving > 0 ? [`${fmtMoney(safe.saving)} saving`] : []),
              ].join(' · ')}
        </AppText>
      </Pressable>
    ),
    bills: (
      <Pressable
        key="bills"
        style={styles.ringPage}
        onLongPress={openCardOrder}
        onPress={() => openSettings('RecurringExpenses')}
      >
        {/* What makes the card before it honest: money already promised to
            someone else. The ring fills as the cycle's bills get paid. */}
        <SpendRing
          fraction={bills.fraction}
          amountLabel={fmtMoney(bills.unpaidTotal)}
          caption={bills.unpaid.length === 0 && bills.any ? 'all bills paid' : 'still to pay'}
          trackColor={colors.onInkTrack}
        />
        <AppText variant="mono" color={colors.onInkMuted} style={styles.ringSub}>
          {!bills.any
            ? 'No recurring bills set up'
            : `${bills.bills.length - bills.unpaid.length} of ${bills.bills.length} paid this cycle`}
        </AppText>
        <AppText variant="mono" muted style={styles.paydayLine}>
          {bills.next
            ? `${bills.next.rule.label} · ${shortDate(bills.next.date)}`
            : bills.any
              ? 'Nothing left before payday'
              : 'Tap to add one'}
        </AppText>
      </Pressable>
    ),
    debt: (
      <Pressable
        key="debt"
        style={styles.ringPage}
        onLongPress={openCardOrder}
        onPress={() => openSettings('Accounts')}
      >
        {/* The ring is progress, not proportion: how much of what was owed in
            the first recorded month has since gone. One month of history
            leaves it empty rather than inventing a starting point. */}
        <SpendRing
          fraction={payoff.fraction}
          amountLabel={fmtMoney(debts.totalOwed)}
          caption={debts.any ? 'owed' : 'no debts'}
          trackColor={colors.onInkTrack}
        />
        <AppText variant="mono" color={colors.onInkMuted} style={styles.ringSub}>
          {!debts.any
            ? 'Nothing recorded as owed'
            : debts.monthlyCost > 0
              ? `${fmtMoney(debts.monthlyCost)} a month in interest`
              : `across ${debts.order.length} account${debts.order.length === 1 ? '' : 's'}`}
        </AppText>
        <AppText variant="mono" muted numberOfLines={2} style={styles.paydayLine}>
          {!debts.any
            ? 'Tap to add a card or loan'
            : payoff.fraction != null
              ? `${fmtMoney(payoff.paidOff)} cleared since ${fmtMoney(payoff.startOwed)}`
              : (debtLine ?? '')}
        </AppText>
      </Pressable>
    ),
    split: (
      <Pressable key="split" style={styles.ringPage} onLongPress={openCardOrder} onPress={openSplit}>
        {/* No ring: what you are owed has no denominator to fill, and a ring
            drawn against an invented one would be decoration. */}
        <SpendRing
          fraction={null}
          amountLabel={fmtMoney(Math.abs(splitNet))}
          caption={
            Math.round(splitNet * 100) === 0
              ? 'all square'
              : splitNet > 0
                ? "you're owed"
                : 'you owe'
          }
          trackColor={colors.onInkTrack}
        />
        <AppText variant="mono" color={colors.onInkMuted} style={styles.ringSub}>
          {openBills === 0
            ? 'Nothing outstanding'
            : `across ${openBills} unsettled bill${openBills === 1 ? '' : 's'}`}
        </AppText>
        <AppText variant="mono" muted style={styles.paydayLine}>
          {shared.expenses.length === 0 ? 'Tap to split a bill' : 'Tap for the Split Tracker'}
        </AppText>
      </Pressable>
    ),
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={recent}
        keyExtractor={(e) => `${e.kind}-${e.id}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <View style={styles.ringCard}>
              {/* Inside the card rather than above it: the greeting, the face
                  and the figure are one thing you look at on opening, and
                  three separated blocks made the top of the screen read as
                  three unrelated ones. */}
              <View style={styles.cardHeader}>
                <AppText
                  variant="display"
                  numberOfLines={1}
                  color={colors.onInk}
                  style={styles.greeting}
                >
                  {profile.name ? `Hi, ${profile.name.split(' ')[0]}` : 'Hi there'}
                </AppText>
                {/* Always shown, even before a name is set — it doubles as the
                    way into Settings, and an affordance that appears only once
                    you have a profile is one nobody discovers. */}
                <Pressable
                  onPress={() =>
                    navigation.getParent()?.navigate('Settings', { screen: 'SettingsHome' })
                  }
                  hitSlop={10}
                >
                  <Avatar name={profile.name} uri={profile.avatar} size={38} />
                </Pressable>
              </View>

              <Pager
                initialPage={lastCardShown}
                restoreKey={focusTick}
                onPageChange={(i) => {
                  lastCardShown = i;
                }}
              >
                {cardOrder.map((key) => ringCards[key])}
              </Pager>
            </View>

            <View style={styles.sectionRow}>
              <AppText variant="label" muted>
                Insights
              </AppText>
            </View>
            {/* Two rows of two rather than two independent columns. A column
                stack lets each card be exactly as tall as its own text, so a
                one-line "Set a budget" beside a two-line "Not enough data
                yet" left the cards below them starting at different heights.
                Rows stretch their pair to a shared height, so every card
                lines up with the one next to it. */}
            <View style={styles.insightGrid}>
              <View style={styles.insightRow}>
                <Pressable style={styles.insightTile} onPress={() => openSettings('Budgets')}>
                  <View style={styles.tileHead}>
                    <View style={styles.tileTitle}>
                      <RowIcon name="chart" color={colors.textMuted} size={16} />
                      <AppText variant="title">Budget</AppText>
                    </View>
                    {arrow}
                  </View>
                  {budget?.active ? (
                    <>
                      <AppText
                        variant="monoBold"
                        color={budget.pace?.behind ? colors.danger : colors.sage}
                        style={styles.statValue}
                      >
                        {Math.round(budget.ratio * 100)}%
                      </AppText>
                      <AppText variant="body" muted style={styles.trendBody}>
                        {fmtMoney(budget.totalSpent)} of {fmtMoney(budget.totalLimit)}
                      </AppText>
                    </>
                  ) : (
                    <AppText variant="bodySemi" color={colors.iris} style={styles.trendBody}>
                      Set a budget
                    </AppText>
                  )}
                </Pressable>

                {/* The breakdown, not History: this tile forecasts the cycle, and a
                    flat list of transactions cannot explain a forecast. The
                    breakdown gives each category its own run rate, its change
                    against last cycle, and what it is on track to reach. */}
                <Pressable
                  style={styles.insightTile}
                  onPress={() => navigation.navigate('CategoryBreakdown')}
                >
                  <View style={styles.tileHead}>
                    <View style={styles.tileTitle}>
                      <RowIcon name="wallet" color={colors.textMuted} size={16} />
                      <AppText variant="title">Left over</AppText>
                    </View>
                    {arrow}
                  </View>
                  {outlook.verdict === 'no-income' || outlook.verdict === 'too-early' ? (
                    <AppText variant="body" muted style={styles.trendBody}>
                      {outlook.verdict === 'no-income'
                        ? 'Add your income to see this'
                        : 'Too early in the cycle to call'}
                    </AppText>
                  ) : (
                    <>
                      <AppText
                        variant="monoBold"
                        numberOfLines={1}
                        color={outlook.verdict === 'over' ? colors.danger : colors.sage}
                        style={styles.statValue}
                      >
                        {fmtMoneyRough(Math.abs(outlook.leftAtPayday))}
                      </AppText>
                      <AppText variant="body" muted numberOfLines={3} style={styles.trendBody}>
                        {outlook.verdict === 'over' ? 'short' : 'left'} if you keep this pace
                        {/* Two different claims, so two different words: with a
                            history behind it the category is above what you
                            usually spend, and without one it is merely the
                            largest. Saying the stronger thing either way would
                            be a claim the app has not earned. */}
                        {outlook.driver
                          ? ` · ${categoryMeta(outlook.driver.category).label.toLowerCase()} ${
                              outlook.driverIsUnusual ? 'above usual' : 'is most of it'
                            }`
                          : ''}
                      </AppText>
                    </>
                  )}
                </Pressable>
              </View>

              <View style={styles.insightRow}>
                <Pressable style={styles.insightTile} onPress={() => openSettings('Goals')}>
                  <View style={styles.tileHead}>
                    <View style={styles.tileTitle}>
                      <RowIcon name="target" color={colors.textMuted} size={16} />
                      <AppText variant="title">Goals</AppText>
                    </View>
                    {arrow}
                  </View>
                  {topGoal ? (
                    <>
                      <AppText variant="monoBold" color={colors.sage} style={styles.statValue}>
                        {Math.round(topGoal.status.ratio * 100)}%
                      </AppText>
                      <AppText variant="body" muted numberOfLines={1} style={styles.trendBody}>
                        {topGoal.goal.name}
                      </AppText>
                    </>
                  ) : (
                    <AppText variant="bodySemi" color={colors.iris} style={styles.trendBody}>
                      Set a goal
                    </AppText>
                  )}
                </Pressable>

                <Pressable
                  style={styles.insightTile}
                  onPress={() => navigation.navigate('CategoryBreakdown')}
                >
                  <View style={styles.tileHead}>
                    <View style={styles.tileTitle}>
                      <RowIcon name="coin" color={colors.textMuted} size={16} />
                      <AppText variant="title">Top spend</AppText>
                    </View>
                    {arrow}
                  </View>
                  {top ? (
                    <>
                      <View style={styles.catRow}>
                        <View style={[styles.catDot, { backgroundColor: categoryMeta(top.key).color }]} />
                        <AppText variant="bodySemi">{categoryMeta(top.key).label}</AppText>
                      </View>
                      <AppText variant="mono" muted style={styles.trendBody}>
                        {fmtMoney(top.total)} this cycle
                      </AppText>
                    </>
                  ) : totalCount > 0 ? (
                    // "No expenses yet" is a lie the moment a statement has been
                    // imported for any month but this one.
                    <AppText variant="body" muted style={styles.trendBody}>
                      Nothing this cycle — see History
                    </AppText>
                  ) : (
                    <AppText variant="body" muted style={styles.trendBody}>
                      No expenses yet
                    </AppText>
                  )}
                </Pressable>
              </View>
            </View>

            <View style={[styles.sectionRow, styles.sectionRowBetween]}>
              <AppText variant="label" muted>
                Recent
              </AppText>
              <Pressable onPress={() => navigation.navigate('History')} hitSlop={8}>
                <AppText variant="bodySemi" color={colors.iris}>
                  History
                </AppText>
              </Pressable>
            </View>
          </>
        }
        ListEmptyComponent={
          <AppText variant="body" muted style={styles.empty}>
            Nothing logged yet. Tap + to add one.
          </AppText>
        }
        ListFooterComponent={
          // Recent is capped, so say what's left rather than ending the list
          // on a cliff — this is the only hint that History holds more.
          notShown > 0 ? (
            <Pressable onPress={() => navigation.navigate('History')}>
              <AppText variant="bodySemi" color={colors.iris} style={styles.moreLink}>
                {notShown} more in History
              </AppText>
            </Pressable>
          ) : null
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

      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate('AddExpense', {})}
      >
        <AppText variant="display" color={colors.action} style={styles.fabPlus}>
          +
        </AppText>
      </Pressable>
    </SafeAreaView>
  );
}

/**
 * The half-open window [start, end) of the cycle containing today.
 *
 * Falls back to the calendar month when no pay day is known, which is the same
 * fallback the rest of Home makes, so the bills a card counts always match the
 * spending beside it.
 */
function cycleBounds(day: number | null, today: string): { start: Date; end: Date } {
  const [y, m, d] = today.split('-').map(Number);
  if (day == null) {
    return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
  }
  const { prev, next } = payCycle(day, new Date(y, m - 1, d));
  return { start: prev, end: next };
}

function cycleStartKey(day: number, today: string): string {
  const { prev } = payCycle(day, new Date(today));
  const y = prev.getFullYear();
  const m = String(prev.getMonth() + 1).padStart(2, '0');
  const d = String(prev.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.haze },

    greeting: { flex: 1, fontSize: 24 },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 22,
      // Sits above the ring with the card's own top padding beneath it.
      marginBottom: 18,
    },
    // No top padding: the hero card runs to the top of the screen, and the
    // rest of the list keeps the gutter.
    list: { paddingHorizontal: 20, paddingBottom: 100 },
    ringCard: {
      backgroundColor: c.ink,
      // Pulled out past the list gutter so it meets both edges, and squared
      // off at the top where it meets the status bar — a rounded corner
      // against a screen edge reads as a card that failed to fit.
      marginHorizontal: -20,
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
      paddingTop: 18,
      paddingBottom: 26,
      // Deliberately not centring here: the pager has to fill the card's width
      // for paging to snap, so each page centres its own contents instead.
      marginBottom: 18,
      ...shadow.card,
    },
    ringPage: { alignItems: 'center', paddingHorizontal: 20 },
    ringSub: { marginTop: 14 },
    paydayLine: { marginTop: 6 },
    insightGrid: { gap: 12, marginBottom: 8 },
    // 'stretch' is what does the aligning: both cards in a row take the
    // height of the taller one instead of each shrinking to its own text.
    insightRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
    tileTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, marginTop: 1 },
    // Top-aligned so a two-line title ("Top spendings" in a narrow column)
    // pushes down rather than dragging the arrow with it.
    tileHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
    tileMore: { fontSize: 11 },
    trendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
    trendText: { fontSize: 11 },
    // The figure is the loudest thing on a card and the label beneath it the
    // quietest — the reference's "75 kg", "36/375" rhythm.
    statValue: { fontSize: 26, marginTop: 8 },
    sectionRow: { marginTop: 22, marginBottom: 10, marginLeft: 2 },
    sectionRowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginRight: 2,
    },
    insightTile: {
      flex: 1,
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      padding: 14,
      minHeight: 92,
      ...shadow.card,
    },
    trendBody: { marginTop: 4 },
    catRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    catDot: { width: 10, height: 10, borderRadius: 5 },
    empty: { textAlign: 'center', paddingVertical: 24 },
    moreLink: { textAlign: 'center', paddingVertical: 18 },
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
