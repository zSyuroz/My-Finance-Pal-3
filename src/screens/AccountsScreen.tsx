import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import {
  expensesSince,
  incomeSince,
  listAccounts,
  type AccountRow,
} from '../db';
import {
  accountKind,
  liveBalanceSince,
  netWorth,
  withLiveBalances,
} from '../networth';
import { prettyDate, todayKey } from '../dateUtils';
import { debtHeadline, debtSummary } from '../debt';
import { fmtMoney } from '../spending';
import { useTheme } from '../ThemeContext';
import { radius, shadow, type Theme } from '../theme';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'Accounts'>;

export default function AccountsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [live, setLive] = useState<{ adjustment: number; since: string | null }>({ adjustment: 0, since: null });

  const refresh = useCallback(async () => {
    const rows = await listAccounts();
    // Balances are shown brought up to date, so the screen agrees with Home
    // rather than quietly disagreeing by whatever has been spent since. Only
    // transactions since that date are read, not the whole ledger.
    const since = liveBalanceSince(rows);
    const [spent, earned] = since
      ? await Promise.all([expensesSince(since), incomeSince(since)])
      : [[], []];
    const applied = withLiveBalances(rows, spent, earned);
    setAccounts(applied.accounts);
    setLive({ adjustment: applied.adjustment, since: applied.since });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const worth = netWorth(accounts);
  const debts = debtSummary(accounts);
  const debtLine = debtHeadline(debts, fmtMoney);

  const assets = accounts.filter((a) => !accountKind(a.kind).liability);
  const openEditor = (id?: string) => navigation.navigate('AccountEditor', id ? { id } : {});

  const row = (a: AccountRow) => {
    const meta = accountKind(a.kind);
    return (
      <Pressable key={a.id} style={styles.row} onPress={() => openEditor(a.id)}>
        <View style={[styles.dot, { backgroundColor: meta.color }]} />
        <View style={styles.rowBody}>
          <AppText variant="bodySemi">{a.name}</AppText>
          <AppText variant="mono" muted style={styles.rowSub}>
            {meta.label}
          </AppText>
        </View>
        <AppText variant="monoBold" color={meta.liability ? colors.danger : undefined}>
          {meta.liability ? '−' : ''}
          {fmtMoney(a.balance)}
        </AppText>
      </Pressable>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.summary}>
        <AppText variant="mono" color={colors.onInkMuted}>
          net worth
        </AppText>
        <AppText
          variant="monoBold"
          color={worth.net < 0 ? colors.danger : colors.sage}
          style={styles.netValue}
        >
          {fmtMoney(worth.net)}
        </AppText>
        <AppText variant="mono" color={colors.onInkMuted} style={styles.summarySub}>
          {fmtMoney(worth.assets)} owned · {fmtMoney(worth.liabilities)} owed
        </AppText>
      </View>

      {live.since && live.adjustment !== 0 && (
        <AppText variant="mono" muted style={styles.driftNote}>
          Includes {fmtMoney(Math.abs(live.adjustment))} {live.adjustment < 0 ? 'spent' : 'received'}{' '}
          {live.since === todayKey()
            ? 'since you set this earlier today'
            : `since ${prettyDate(live.since)}`}
          . Update the balance to re-base it.
        </AppText>
      )}

      {!worth.any && (
        <AppText variant="body" muted style={styles.empty}>
          Add what you have and what you owe — bank balances, cash, CPF, cards, loans. This is the
          one figure that says whether you're getting anywhere, and nothing else in the app can
          work it out for you.
        </AppText>
      )}

      {assets.length > 0 && (
        <>
          <AppText variant="label" muted style={styles.sectionLabel}>
            What you own
          </AppText>
          <View style={styles.card}>{assets.map(row)}</View>
        </>
      )}

      {debts.any && (
        <>
          <AppText variant="label" muted style={styles.sectionLabel}>
            What you owe — clear these first
          </AppText>
          {!!debtLine && (
            <View style={styles.debtBanner}>
              <AppText variant="bodySemi" color={colors.onAction}>
                {debtLine}
              </AppText>
              <AppText variant="mono" color={colors.onAction} style={styles.debtBannerSub}>
                {fmtMoney(debts.monthlyCost)} a month in interest across everything you owe.
              </AppText>
            </View>
          )}
          <View style={styles.card}>
            {debts.order.map((d, i) => (
              <Pressable
                key={d.account.id}
                style={styles.row}
                onPress={() => openEditor(d.account.id)}
              >
                <AppText variant="monoBold" muted style={styles.rank}>
                  {i + 1}
                </AppText>
                <View style={styles.rowBody}>
                  <AppText variant="bodySemi">{d.account.name}</AppText>
                  <AppText variant="mono" muted style={styles.rowSub}>
                    {d.apr > 0 ? `${d.apr}% APR` : 'no rate set'}
                    {d.monthlyInterest > 0 ? ` · ${fmtMoney(d.monthlyInterest)}/mo` : ''}
                  </AppText>
                </View>
                <AppText variant="monoBold" color={colors.danger}>
                  {fmtMoney(Math.abs(d.account.balance))}
                </AppText>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Pressable style={styles.addBtn} onPress={() => openEditor()}>
        <AppText variant="bodySemi" color={colors.onAction}>
          Add an account
        </AppText>
      </Pressable>

    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 80 },
    summary: {
      backgroundColor: c.ink,
      borderRadius: radius.xl,
      paddingVertical: 24,
      alignItems: 'center',
      marginBottom: 8,
      ...shadow.card,
    },
    netValue: { fontSize: 32, marginTop: 4 },
    summarySub: { marginTop: 8 },
    empty: { marginTop: 16, marginBottom: 8, lineHeight: 21 },
    sectionLabel: { marginTop: 24, marginBottom: 10, marginLeft: 2 },
    card: { backgroundColor: c.mist, borderRadius: radius.lg, paddingHorizontal: 16 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
    rowBody: { flex: 1 },
    rowSub: { marginTop: 3, fontSize: 11 },
    addBtn: {
      height: 50,
      borderRadius: radius.md,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 22,
    },
    debtBanner: {
      // A warning, not an action — it keeps the money colour.
      backgroundColor: c.gold,
      borderRadius: radius.lg,
      padding: 14,
      marginBottom: 12,
    },
    debtBannerSub: { marginTop: 6, opacity: 0.85, fontSize: 11, lineHeight: 16 },
    rank: { width: 20, fontSize: 12 },
    driftNote: { marginTop: 10, lineHeight: 16, fontSize: 11 },
  });
}
