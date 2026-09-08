import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import ConfirmDialog from '../components/ConfirmDialog';
import RowIcon from '../components/RowIcon';
import {
  applyDueSharedRecurring,
  listPeople,
  listSharedExpenses,
  deletePayment,
  getProfile,
  listPayments,
  listSplits,
  resetSharedLedger,
  upsertPayment,
  uid,
  type PaymentRow,
  type PersonRow,
  type Profile,
  type SharedExpenseRow,
  type SharedSplitRow,
} from '../db';
import { prettyDate, todayKey } from '../dateUtils';
import { categoryMeta, fmtMoney } from '../spending';
import {
  balances,
  isMe,
  isSettled,
  myNet,
  myShare,
  personName,
  settlements,
  billCurrency,
  homeAmount,
  isForeign,
  settlementText,
  sumMoney,
  type Balance,
  type Settlement,
} from '../sharing';
import { activeCurrency } from '../currency';
import { shareTextBlock } from '../shareText';
import { useTheme } from '../ThemeContext';
import { radius, shadow, type Theme } from '../theme';
import type { SharedStackParams } from '../navigation';

type Props = NativeStackScreenProps<SharedStackParams, 'SharedHome'>;

export default function SharedScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [people, setPeople] = useState<PersonRow[]>([]);
  const [expenses, setExpenses] = useState<SharedExpenseRow[]>([]);
  const [splits, setSplits] = useState<SharedSplitRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [pendingPayment, setPendingPayment] = useState<Settlement | null>(null);
  const [pendingUndo, setPendingUndo] = useState<PaymentRow | null>(null);
  const [resetVisible, setResetVisible] = useState(false);
  const [profile, setProfileState] = useState<Profile>({ name: '', avatar: null });

  const refresh = useCallback(async () => {
    // Catches up any monthly bills before reading, so the list is already
    // correct on the first paint rather than flashing and then filling in.
    await applyDueSharedRecurring();
    setProfileState(await getProfile());
    const [p, e, s, pay] = await Promise.all([
      listPeople(),
      listSharedExpenses(),
      listSplits(),
      listPayments(),
    ]);
    setPeople(p);
    setExpenses(e);
    setSplits(s);
    setPayments(pay);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const ledger: Balance[] = useMemo(
    () => balances(expenses, splits, payments),
    [expenses, splits, payments]
  );
  const owed = myNet(ledger);
  const toSettle: Settlement[] = useMemo(() => settlements(ledger), [ledger]);
  const mySpend = useMemo(
    () => sumMoney(splits.filter((s) => isMe(s.personId)).map((s) => s.shareAmount)),
    [splits]
  );
  const countedToMine = useMemo(
    () => expenses.filter((e) => e.countsAsMine).length,
    [expenses]
  );

  const name = (id: string) => personName(id, people, profile.name);

  /**
   * Logs a real transfer between two people. Kept separate from editing bills:
   * paying someone back doesn't change what was bought, only who is square.
   */
  const recordPayment = async () => {
    const p = pendingPayment;
    setPendingPayment(null);
    if (!p) return;
    await upsertPayment({
      id: uid(),
      fromPerson: p.from,
      toPerson: p.to,
      amount: p.amount,
      date: todayKey(),
      note: '',
      createdAt: Date.now(),
    });
    refresh();
  };

  // Anyone still up or down when the reset happens. Wiping the ledger with
  // debts open loses the record of who owed what, so the confirmation says so
  // rather than letting it happen quietly.
  const unsettled = ledger.filter((b) => Math.round(b.net * 100) !== 0);
  const home = activeCurrency();
  // Bills are converted once, when they are entered. Switching the app's
  // currency afterwards leaves those figures denominated in the old one, and
  // saying so is better than silently mixing two currencies in one total.
  const staleCurrency = expenses.find(
    (e) => !isSettled(e) && e.homeCurrency && e.homeCurrency !== home
  )?.homeCurrency;

  const doReset = async () => {
    setResetVisible(false);
    await resetSharedLedger();
    refresh();
  };

  const onShare = async () => {
    const text = settlementText(expenses, splits, people, payments, profile.name);
    const outcome = await shareTextBlock(text, 'Split Tracker');
    if (outcome === 'copied') {
      setNotice({
        title: 'Copied',
        message:
          'The summary is on your clipboard — paste it into your group chat.\n\n' + text,
      });
    } else if (outcome === 'unavailable') {
      // Never a dead end: if neither the share sheet nor the clipboard worked,
      // at least put the text on screen so it can be copied by hand.
      setNotice({ title: 'Copy this', message: text });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <AppText variant="display" style={styles.headerTitle}>
          Split Tracker
        </AppText>
        {/* Icons, not words: three labels crowded the title out of the header,
            and each of these actions has a shape people already read. The
            accessibility label keeps the word for anyone using a screen
            reader. */}
        <View style={styles.headerActions}>
          {expenses.length > 0 && (
            <Pressable
              onPress={onShare}
              style={styles.headerBtn}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Share the summary"
            >
              <RowIcon name="share" color={colors.iris} size={20} />
            </Pressable>
          )}
          <Pressable
            onPress={() => navigation.navigate('ScanReceipt')}
            style={styles.headerBtn}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Scan a receipt"
          >
            <RowIcon name="camera" color={colors.iris} size={20} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('People')}
            style={styles.headerBtn}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="People"
          >
            <RowIcon name="people" color={colors.iris} size={20} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={expenses}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <View style={styles.summaryCard}>
              {/* Nothing to label when nobody owes anything — the /usr/bin/bash.00 below
                  says it, and a caption saying it again is noise. */}
              {Math.round(owed * 100) !== 0 && (
                <AppText variant="mono" color={colors.onInkMuted}>
                  {owed > 0 ? "you're owed" : 'you owe'}
                </AppText>
              )}
              <AppText
                variant="monoBold"
                color={owed < 0 ? colors.danger : colors.sage}
                style={styles.summaryValue}
              >
                {fmtMoney(Math.abs(owed))}
              </AppText>
              <AppText variant="mono" muted style={styles.summarySub}>
                your share of everything: {fmtMoney(mySpend)}
              </AppText>
              {countedToMine > 0 && (
                <AppText variant="mono" muted style={styles.summarySub}>
                  {countedToMine} counted in your own spending
                </AppText>
              )}
            </View>

            {!!staleCurrency && (
              <AppText variant="mono" muted style={styles.fxNotice}>
                These bills were converted to {staleCurrency}, which was your currency when they
                were entered. The figures below are still in {staleCurrency}, not {home}.
              </AppText>
            )}

            {ledger.length > 0 && (
              <>
                <AppText variant="label" muted style={styles.sectionLabel}>
                  Balances
                </AppText>
                <View style={styles.card}>
                  {ledger.map((b) => (
                    <View key={b.personId} style={styles.balanceRow}>
                      <View style={styles.balanceWho}>
                        <AppText variant="bodySemi">{name(b.personId)}</AppText>
                        <AppText variant="mono" muted style={styles.balanceDetail}>
                          paid {fmtMoney(b.paid)} · owes {fmtMoney(b.share)}
                        </AppText>
                      </View>
                      <AppText
                        variant="monoBold"
                        color={
                          Math.round(b.net * 100) === 0
                            ? colors.textMuted
                            : b.net > 0
                              ? colors.sage
                              : colors.danger
                        }
                      >
                        {b.net > 0 ? '+' : ''}
                        {fmtMoney(b.net)}
                      </AppText>
                    </View>
                  ))}
                </View>
              </>
            )}

            {toSettle.length > 0 && (
              <>
                <AppText variant="label" muted style={styles.sectionLabel}>
                  Settle up
                </AppText>
                <View style={styles.card}>
                  {toSettle.map((s, i) => (
                    <Pressable
                      key={i}
                      style={styles.settleRow}
                      onPress={() => setPendingPayment(s)}
                    >
                      <View style={styles.settleWho}>
                        <AppText variant="body">
                          <AppText variant="bodySemi">{name(s.from)}</AppText>
                          {' → '}
                          <AppText variant="bodySemi">{name(s.to)}</AppText>
                        </AppText>
                        <AppText variant="mono" muted style={styles.settleHint}>
                          tap once paid
                        </AppText>
                      </View>
                      <AppText variant="monoBold">{fmtMoney(s.amount)}</AppText>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {payments.length > 0 && (
              <>
                <AppText variant="label" muted style={styles.sectionLabel}>
                  Payments
                </AppText>
                <View style={styles.card}>
                  {payments.map((p) => (
                    <View key={p.id} style={styles.settleRow}>
                      <View style={styles.settleWho}>
                        <AppText variant="body">
                          <AppText variant="bodySemi">{name(p.fromPerson)}</AppText>
                          {' paid '}
                          <AppText variant="bodySemi">{name(p.toPerson)}</AppText>
                        </AppText>
                        <AppText variant="mono" muted style={styles.settleHint}>
                          {prettyDate(p.date)}
                        </AppText>
                      </View>
                      <View style={styles.paymentRight}>
                        <AppText variant="monoBold" color={colors.sage}>
                          {fmtMoney(p.amount)}
                        </AppText>
                        {/* Recording a payment is one tap, so undoing it has to
                            be too — a mistyped settle would otherwise be stuck
                            in the ledger permanently. */}
                        <Pressable onPress={() => setPendingUndo(p)} hitSlop={8}>
                          <AppText variant="mono" color={colors.danger} style={styles.undo}>
                            undo
                          </AppText>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            <AppText variant="label" muted style={styles.sectionLabel}>
              Split bills
            </AppText>
          </>
        }
        ListFooterComponent={
          expenses.length > 0 ? (
            <Pressable style={styles.resetBtn} onPress={() => setResetVisible(true)}>
              <AppText variant="bodySemi" color={colors.danger}>
                Reset tracker
              </AppText>
              <AppText variant="mono" muted style={styles.resetHint}>
                Clear every bill and payment and start fresh
              </AppText>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          <AppText variant="body" muted style={styles.empty}>
            {people.length === 0
              ? 'Add the people you split bills with, then tap + to log a shared expense.'
              : 'No shared expenses yet. Tap + to add one.'}
          </AppText>
        }
        renderItem={({ item }) => {
          const mine = myShare(item.id, splits);
          const meta = categoryMeta(item.category);
          return (
            <Pressable
              style={[styles.row, isSettled(item) && styles.rowSettled]}
              onPress={() => navigation.navigate('SharedExpenseEditor', { id: item.id })}
            >
              <View style={[styles.dot, { backgroundColor: meta.color }]} />
              <View style={styles.rowBody}>
                <AppText variant="bodySemi" numberOfLines={1}>
                  {item.description || meta.label}
                </AppText>
                <AppText variant="mono" muted style={styles.rowSub}>
                  {name(item.paidBy)} paid · {prettyDate(item.date)}
                  {isSettled(item) ? ' · settled' : ''}
                </AppText>
              </View>
              <View style={styles.rowAmounts}>
                <AppText variant="monoBold">{fmtMoney(homeAmount(item))}</AppText>
                {isForeign(item, home) && (
                  <AppText variant="mono" muted style={styles.rowSub}>
                    {billCurrency(item, home)} {item.amount.toFixed(2)}
                  </AppText>
                )}
                <AppText variant="mono" muted style={styles.rowSub}>
                  you: {fmtMoney(mine)}
                  {item.countsAsMine ? ' ✓' : ''}
                </AppText>
              </View>
            </Pressable>
          );
        }}
      />

      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate('SharedExpenseEditor', {})}
      >
        <AppText variant="display" color={colors.action} style={styles.fabPlus}>
          +
        </AppText>
      </Pressable>

      <ConfirmDialog
        visible={resetVisible}
        title="Reset the tracker?"
        message={
          `This deletes ${
            expenses.length === 1 ? 'the 1 shared bill' : `all ${expenses.length} shared bills`
          }` +
          (payments.length > 0
            ? ` and ${payments.length} payment${payments.length === 1 ? '' : 's'}`
            : '') +
          '.\n\n' +
          (unsettled.length > 0
            ? `${unsettled.length} ${unsettled.length === 1 ? 'person is' : 'people are'} not square yet — that record goes with it.\n\n`
            : '') +
          "Your own spending stays in your expenses, and everyone under People is kept."
        }
        confirmLabel="Reset"
        cancelLabel="Cancel"
        destructive
        onConfirm={doReset}
        onCancel={() => setResetVisible(false)}
      />
      <ConfirmDialog
        visible={!!pendingUndo}
        title="Undo this payment?"
        message={
          pendingUndo
            ? `Removing the ${fmtMoney(pendingUndo.amount)} from ${name(pendingUndo.fromPerson)} to ${name(pendingUndo.toPerson)} puts that debt back on the balance.`
            : ''
        }
        confirmLabel="Undo"
        cancelLabel="Keep it"
        destructive
        onConfirm={async () => {
          const p = pendingUndo;
          setPendingUndo(null);
          if (p) await deletePayment(p.id);
          refresh();
        }}
        onCancel={() => setPendingUndo(null)}
      />
      <ConfirmDialog
        visible={!!pendingPayment}
        title="Record this payment?"
        message={
          pendingPayment
            ? `${name(pendingPayment.from)} paid ${name(pendingPayment.to)} ${fmtMoney(pendingPayment.amount)}.

This clears that much of the balance. It does not change any bill — the expenses stay exactly as they are.`
            : ''
        }
        confirmLabel="Record it"
        cancelLabel="Not yet"
        onConfirm={recordPayment}
        onCancel={() => setPendingPayment(null)}
      />
      <ConfirmDialog
        visible={!!notice}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        confirmLabel="OK"
        onConfirm={() => setNotice(null)}
      />
    </SafeAreaView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.haze },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 12,
    },
    headerTitle: { fontSize: 26 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.mist,
      borderWidth: 1,
      borderColor: c.line,
    },
    list: { paddingHorizontal: 20, paddingBottom: 100 },
    summaryCard: {
      backgroundColor: c.ink,
      borderRadius: radius.xl,
      paddingVertical: 24,
      paddingHorizontal: 20,
      alignItems: 'center',
      marginBottom: 6,
      ...shadow.card,
    },
    summaryValue: { fontSize: 34, marginTop: 4 },
    summarySub: { marginTop: 8 },
    card: {
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      paddingHorizontal: 16,
      ...shadow.card,
    },
    fxNotice: { marginTop: 14, marginHorizontal: 2, fontSize: 11, lineHeight: 16 },
    sectionLabel: { marginTop: 24, marginBottom: 10, marginLeft: 2 },
    balanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    balanceWho: { flex: 1, paddingRight: 12 },
    balanceDetail: { marginTop: 3 },
    settleWho: { flex: 1 },
    settleHint: { marginTop: 3, fontSize: 11 },
    paymentRight: { alignItems: 'flex-end' },
    undo: { marginTop: 3, fontSize: 11 },
    settleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      padding: 14,
      marginBottom: 10,
      ...shadow.card,
    },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
    rowSettled: { opacity: 0.55 },
    rowBody: { flex: 1, paddingRight: 12 },
    rowAmounts: { alignItems: 'flex-end' },
    rowSub: { marginTop: 3 },
    empty: { textAlign: 'center', paddingVertical: 24 },
    resetBtn: { alignItems: 'center', paddingTop: 28, paddingBottom: 12 },
    resetHint: { marginTop: 6, fontSize: 11 },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 24,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: c.action + '26',
      borderWidth: 1,
      borderColor: c.action + '5C',
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.card,
    },
    fabPlus: { fontSize: 30, lineHeight: 34 },
  });
}
