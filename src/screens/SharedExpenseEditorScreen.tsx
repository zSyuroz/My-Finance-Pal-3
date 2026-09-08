import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import ConfirmDialog from '../components/ConfirmDialog';
import PlatformDateTimePicker from '../components/PlatformDateTimePicker';
import {
  deleteExpense,
  deleteSharedExpense,
  getProfile,
  getSharedExpense,
  setSharedSettled,
  listPeople,
  splitsFor,
  uid,
  upsertExpense,
  upsertSharedExpense,
  type ExpenseRow,
  type PersonRow,
  type SharedExpenseRow,
  type SharedSplitRow,
} from '../db';
import CurrencyPickerModal from '../components/CurrencyPickerModal';
import { activeCurrency, currencyMeta } from '../currency';
import { prettyDate, todayKey } from '../dateUtils';
import {
  convert,
  invertRate,
  loadRates,
  rateBetween,
  rateLine,
  type RateTable,
} from '../rates';
import { convertShares, ME, personName, splitEvenly, sumMoney } from '../sharing';
import { CATEGORIES, fmtMoney } from '../spending';
import { useTheme } from '../ThemeContext';
import { radius, type Theme } from '../theme';
import type { SharedStackParams } from '../navigation';

type Props = NativeStackScreenProps<SharedStackParams, 'SharedExpenseEditor'>;

const ordinal = (n: number) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
};

export default function SharedExpenseEditorScreen({ route, navigation }: Props) {
  const { id } = route.params ?? {};
  const isNew = !id;

  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [people, setPeople] = useState<PersonRow[]>([]);
  const [myName, setMyName] = useState('');
  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState('other');
  const [day, setDay] = useState(todayKey());
  const [paidBy, setPaidBy] = useState<string>(ME);
  const [participants, setParticipants] = useState<string[]>([ME]);
  const [countsAsMine, setCountsAsMine] = useState(true);
  const [splitMode, setSplitMode] = useState<'even' | 'exact'>('even');
  // Keyed by person id and held as text, so a half-typed "5." doesn't get
  // rewritten under the user's cursor.
  const [exactText, setExactText] = useState<Record<string, string>>({});
  const [settledAt, setSettledAt] = useState<number | null>(null);
  const [repeats, setRepeats] = useState(false);
  const [lastPostedMonth, setLastPostedMonth] = useState<string | null>(null);
  const [linkedExpenseId, setLinkedExpenseId] = useState<string | null>(null);
  const [showDate, setShowDate] = useState(false);
  // The bill's own currency, which starts as yours because most bills are.
  const [currency, setCurrency] = useState<string>(activeCurrency());
  const [rateText, setRateText] = useState('1');
  const [rates, setRates] = useState<RateTable | null>(null);
  // Which way round the rate is being typed. Both directions describe the same
  // rate; only one of them is the number the person actually knows.
  const [flipped, setFlipped] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const list = await listPeople();
      setPeople(list);
      setMyName((await getProfile()).name);
      if (id) {
        const row = await getSharedExpense(id);
        if (row) {
          setDescription(row.description);
          setAmountText(String(row.amount));
          setCategory(row.category);
          setDay(row.date);
          setPaidBy(row.paidBy);
          setCountsAsMine(!!row.countsAsMine);
          setLinkedExpenseId(row.linkedExpenseId);
          setSplitMode(row.splitMode === 'exact' ? 'exact' : 'even');
          // The rate this bill was saved with, not today's: reopening a bill
          // must not quietly re-price what everyone already agreed.
          setCurrency(row.currency || activeCurrency());
          setRateText(String(row.rate || 1));
          setSettledAt(row.settledAt);
          setRepeats(!!row.repeatsMonthly);
          setLastPostedMonth(row.lastPostedMonth);
          const rows = await splitsFor(id);
          setParticipants(rows.map((r) => r.personId));
          setExactText(
            Object.fromEntries(rows.map((r) => [r.personId, r.shareAmount.toFixed(2)]))
          );
        }
      } else {
        // A new bill starts with everyone on it — the common case is the whole
        // group, and unticking one person is quicker than ticking four.
        setParticipants([ME, ...list.map((p) => p.id)]);
      }
      setLoaded(true);
    })();
  }, [id]);

  // Rates are fetched once and cached for the day; a failure here is silent
  // because the rate can always be typed in instead.
  useEffect(() => {
    loadRates().then(setRates);
  }, []);

  const home = activeCurrency();
  const foreign = currency !== home;
  const liveRate = rateBetween(rates, currency, home);
  const typedRate = Number(rateText.replace(/[^0-9.]/g, '')) || 0;
  // Stored and calculated with always as "home currency per 1 bill unit",
  // whichever way it was typed — the display direction is presentation only.
  const rate = !foreign ? 1 : flipped ? (typedRate > 0 ? 1 / typedRate : 0) : typedRate;
  const from = flipped ? home : currency;
  const to = flipped ? currency : home;
  /** The live rate written the way it is currently being shown. */
  const shownLive = liveRate == null ? null : flipped ? invertRate(liveRate) : liveRate;
  const useLive = () => {
    if (shownLive != null) setRateText(String(Number(shownLive.toPrecision(6))));
  };

  const amount = Number(amountText.replace(/[^0-9.]/g, '')) || 0;
  const homeTotal = convert(amount, rate);
  const evenShares = splitEvenly(amount, participants.length);
  const shares =
    splitMode === 'exact'
      ? participants.map((pid) => Number((exactText[pid] ?? '').replace(/[^0-9.]/g, '')) || 0)
      : evenShares;
  const assigned = sumMoney(shares);
  // Compared in cents so a 0.1 + 0.2 style remainder can't fail a split that
  // is actually exact.
  const leftover = Math.round(amount * 100) - Math.round(assigned * 100);
  const myIndex = participants.indexOf(ME);
  const mine = myIndex >= 0 ? shares[myIndex] : 0;
  // Splits are always stored in the home currency, because that is the one
  // the balances and the settle-up are denominated in.
  const homeShares = foreign ? convertShares(shares, rate, homeTotal) : shares;
  /** Money in the bill's own currency; `fmtMoney` always speaks the home one. */
  const fmtBill = (value: number) =>
    foreign
      ? `${currencyMeta(currency).symbol}${value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : fmtMoney(value);
  const mineHome = myIndex >= 0 ? homeShares[myIndex] : 0;

  /**
   * Turns the rate round without changing it: the number in the box becomes
   * its own reciprocal, so a half-typed rate is never silently reinterpreted
   * as a rate a thousand times bigger.
   */
  const flip = () => {
    setFlipped((v) => !v);
    const next = invertRate(typedRate);
    if (next != null) setRateText(String(next));
  };

  const chooseCurrency = (code: string) => {
    setPickerOpen(false);
    setCurrency(code);
    if (code === home) {
      setRateText('1');
      return;
    }
    const live = rateBetween(rates, code, home);
    // Left as it was when there is no table to read: an offline user editing
    // the amount should not have their typed rate wiped.
    if (live == null) return;
    const shown = flipped ? invertRate(live) : live;
    if (shown != null) setRateText(String(Number(shown.toPrecision(6))));
  };

  /** Seeds the exact fields from the even split, so switching isn't a blank slate. */
  const useExact = () => {
    setExactText((current) => {
      const next = { ...current };
      participants.forEach((pid, i) => {
        if (next[pid] == null) next[pid] = evenShares[i].toFixed(2);
      });
      return next;
    });
    setSplitMode('exact');
  };
  const name = (pid: string) => personName(pid, people, myName);

  const toggleParticipant = (pid: string) => {
    setParticipants((current) =>
      current.includes(pid) ? current.filter((p) => p !== pid) : [...current, pid]
    );
  };

  const save = async () => {
    if (saving) return;
    if (foreign && rate <= 0) {
      setError(`Enter what 1 ${currency} is worth in ${home}, so this bill can be split.`);
      return;
    }
    if (amount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (participants.length === 0) {
      setError('Pick at least one person to split this between.');
      return;
    }
    if (splitMode === 'exact' && leftover !== 0) {
      // Letting the parts disagree with the total would quietly corrupt every
      // balance downstream, so this is a hard stop rather than a warning.
      setError(
        leftover > 0
          ? `The shares add up to ${fmtBill(assigned)}, which is ${fmtBill(leftover / 100)} short of ${fmtBill(amount)}.`
          : `The shares add up to ${fmtBill(assigned)}, which is ${fmtBill(-leftover / 100)} more than ${fmtBill(amount)}.`
      );
      return;
    }
    setSaving(true);

    const sharedId = id ?? uid();
    const splitRows: SharedSplitRow[] = participants.map((personId, i) => ({
      id: uid(),
      sharedId,
      personId,
      shareAmount: homeShares[i],
    }));

    // Your share is mirrored into your personal expenses so it lands in Home's
    // totals. It is your *share*, not the whole bill: if you paid $60 for three
    // people, $40 of that is money coming back to you, not money you spent.
    let linkId = linkedExpenseId;
    const wantsMirror = countsAsMine && myIndex >= 0 && mineHome > 0;
    try {
      if (wantsMirror) {
        linkId = linkId ?? uid();
        const mirror: ExpenseRow = {
          id: linkId,
          amount: mineHome,
          category,
          note: description.trim() || 'Shared expense',
          date: day,
          createdAt: Date.now(),
          recurringId: null,
        };
        await upsertExpense(mirror);
      } else if (linkId) {
        await deleteExpense(linkId);
        linkId = null;
      }

      const row: SharedExpenseRow = {
        id: sharedId,
        description: description.trim(),
        amount,
        category,
        date: day,
        paidBy,
        createdAt: Date.now(),
        countsAsMine: wantsMirror ? 1 : 0,
        linkedExpenseId: linkId,
        splitMode,
        settledAt,
        repeatsMonthly: repeats ? 1 : 0,
        lastPostedMonth,
        currency,
        rate,
        homeAmount: homeTotal,
        homeCurrency: home,
      };
      await upsertSharedExpense(row, splitRows);
    } catch (err) {
      setSaving(false);
      setError(
        (err instanceof Error ? err.message : 'Something went wrong while saving.') +
          '\n\nThis expense has not been saved.'
      );
      return;
    }

    setSaving(false);
    navigation.goBack();
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isNew ? 'New shared expense' : 'Edit shared expense',
      headerRight: () => (
        <Pressable onPress={save} hitSlop={10}>
          <AppText variant="bodySemi" color={colors.iris}>
            Save
          </AppText>
        </Pressable>
      ),
    });
  });

  const doDelete = async () => {
    setDeleteVisible(false);
    if (id) await deleteSharedExpense(id);
    navigation.goBack();
  };

  if (!loaded) return <View style={styles.container} />;

  const everyone = [
    { id: ME, name: name(ME) },
    ...people.map((p) => ({ id: p.id, name: p.name })),
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isNew && (
        <Pressable style={styles.scanBtn} onPress={() => navigation.navigate('ScanReceipt')}>
          <View style={styles.scanIcon}>
            <AppText variant="bodySemi" color={colors.onAction} style={styles.scanGlyph}>
              ⌸
            </AppText>
          </View>
          <View style={styles.scanText}>
            <AppText variant="bodySemi">Scan a receipt instead</AppText>
            <AppText variant="mono" muted style={styles.scanHint}>
              Reads the items and splits by who had what
            </AppText>
          </View>
        </Pressable>
      )}

      <TextInput
        style={styles.titleInput}
        placeholder="What was it for?"
        placeholderTextColor={colors.textMuted}
        value={description}
        onChangeText={setDescription}
        autoFocus={isNew}
      />

      <View style={styles.amountRow}>
        <Pressable style={styles.currencyBtn} onPress={() => setPickerOpen(true)}>
          <AppText variant="display" color={colors.textMuted} style={styles.currency}>
            {currencyMeta(currency).symbol}
          </AppText>
          <AppText variant="mono" color={colors.iris} style={styles.currencyCode}>
            {currency}
          </AppText>
        </Pressable>
        <TextInput
          style={styles.amountInput}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="decimal-pad"
        />
      </View>

      {/* The converted total, right under the figure being typed. Read-only
          on purpose: it is the result of the amount and the rate, and letting
          it be edited would mean silently rewriting one of those two behind
          the user's back. The rate above is the editable half. */}
      {foreign && (
        <View style={styles.convertedRow}>
          <AppText variant="mono" muted style={styles.convertedLabel}>
            ≈
          </AppText>
          <AppText
            variant="monoBold"
            color={rate > 0 && amount > 0 ? colors.sage : colors.textMuted}
            style={styles.convertedValue}
          >
            {rate > 0 && amount > 0 ? fmtMoney(homeTotal) : `— ${home}`}
          </AppText>
        </View>
      )}

      {/* Only ever shown for a bill in someone else's money. The rate is
          editable because the phone may have been offline when the bill was
          entered, and because the rate a group agreed on at the counter beats
          the mid-market one. */}
      {foreign && (
        <View style={styles.fxCard}>
          <View style={styles.fxRow}>
            <Pressable style={styles.fxSwap} onPress={flip} hitSlop={8}>
              <AppText variant="bodyMed">Rate</AppText>
              <AppText variant="mono" color={colors.iris} style={styles.fxSwapIcon}>
                ⇄
              </AppText>
            </Pressable>
            <View style={styles.fxInputWrap}>
              <AppText variant="mono" muted style={styles.fxPrefix}>
                1 {from} =
              </AppText>
              <TextInput
                style={styles.fxInput}
                value={rateText}
                onChangeText={setRateText}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
              />
              <AppText variant="mono" muted>
                {to}
              </AppText>
            </View>
          </View>
          <AppText variant="mono" muted style={styles.fxNote}>
            {rate > 0 && amount > 0
              ? `Split and settled in ${home}.`
              : shownLive != null
                ? `Today's rate is ${rateLine(from, to, shownLive)}.`
                : `No rate available offline — type what 1 ${from} is worth in ${to}.`}
          </AppText>
          {liveRate != null &&
            shownLive != null &&
            rate > 0 &&
            Math.abs(liveRate - rate) > liveRate * 0.001 && (
              <Pressable onPress={useLive}>
                <AppText variant="mono" color={colors.iris} style={styles.fxNote}>
                  Use today's rate ({rateLine(from, to, shownLive)})
                </AppText>
              </Pressable>
            )}
        </View>
      )}

      {/* Mounted only while it is open: react-native-web leaves a closed
          Modal in the tree, inert but still painted over the editor. */}
      {pickerOpen && (
        <CurrencyPickerModal
          visible
          selected={currency}
          onSelect={chooseCurrency}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <View style={styles.card}>
        <View style={styles.row}>
          <AppText variant="bodyMed">Date</AppText>
          <Pressable onPress={() => setShowDate((v) => !v)}>
            <AppText variant="mono" color={colors.iris}>
              {prettyDate(day)}
            </AppText>
          </Pressable>
        </View>
        {showDate && (
          <PlatformDateTimePicker
            mode="date"
            value={day}
            onChange={setDay}
            onClose={() => setShowDate(false)}
          />
        )}
      </View>

      <AppText variant="label" muted style={styles.sectionLabel}>
        Paid by
      </AppText>
      <View style={styles.chips}>
        {everyone.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setPaidBy(p.id)}
            style={[styles.chip, paidBy === p.id && styles.chipActive]}
          >
            <AppText variant={paidBy === p.id ? 'bodySemi' : 'body'}>{p.name}</AppText>
          </Pressable>
        ))}
      </View>

      <View style={styles.splitHeader}>
        <AppText variant="label" muted>
          Split between
        </AppText>
        <View style={styles.modeToggle}>
          <Pressable
            onPress={() => setSplitMode('even')}
            style={[styles.mode, splitMode === 'even' && styles.modeActive]}
          >
            <AppText variant={splitMode === 'even' ? 'bodySemi' : 'body'}>Evenly</AppText>
          </Pressable>
          <Pressable
            onPress={useExact}
            style={[styles.mode, splitMode === 'exact' && styles.modeActive]}
          >
            <AppText variant={splitMode === 'exact' ? 'bodySemi' : 'body'}>Exact</AppText>
          </Pressable>
        </View>
      </View>
      <View style={styles.card}>
        {everyone.map((p) => {
          const on = participants.includes(p.id);
          const share = on ? shares[participants.indexOf(p.id)] : 0;
          return (
            <View key={p.id} style={styles.row}>
              <Pressable style={styles.splitWho} onPress={() => toggleParticipant(p.id)}>
                <View style={[styles.check, on && styles.checkOn]}>
                  {on && (
                    <AppText variant="bodySemi" color={colors.onSage} style={styles.checkMark}>
                      ✓
                    </AppText>
                  )}
                </View>
                <AppText variant={on ? 'bodySemi' : 'body'} muted={!on}>
                  {p.name}
                </AppText>
              </Pressable>
              {splitMode === 'exact' && on ? (
                <TextInput
                  style={styles.shareInput}
                  value={exactText[p.id] ?? ''}
                  onChangeText={(v) => setExactText((c) => ({ ...c, [p.id]: v }))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                />
              ) : (
                <AppText variant="mono" muted={!on}>
                  {on ? fmtBill(share) : '—'}
                </AppText>
              )}
            </View>
          );
        })}
        {participants.length > 0 && amount > 0 && (
          <AppText
            variant="mono"
            muted={splitMode === 'even' || leftover === 0}
            color={splitMode === 'exact' && leftover !== 0 ? colors.danger : undefined}
            style={styles.splitNote}
          >
            {splitMode === 'even'
              ? `${fmtMoney(homeTotal)} split ${participants.length} way${participants.length === 1 ? '' : 's'}`
              : leftover === 0
                ? `${fmtBill(assigned)} of ${fmtBill(amount)} — adds up`
                : leftover > 0
                  ? `${fmtBill(assigned)} of ${fmtBill(amount)} — ${fmtBill(leftover / 100)} left to assign`
                  : `${fmtBill(assigned)} of ${fmtBill(amount)} — ${fmtBill(-leftover / 100)} too much`}
          </AppText>
        )}
      </View>

      <AppText variant="label" muted style={styles.sectionLabel}>
        Category
      </AppText>
      <View style={styles.chips}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setCategory(c.key)}
            style={[styles.chip, category === c.key && styles.chipActive]}
          >
            <View style={[styles.catDot, { backgroundColor: c.color }]} />
            <AppText variant={category === c.key ? 'bodySemi' : 'body'}>{c.label}</AppText>
          </Pressable>
        ))}
      </View>

      <View style={[styles.card, styles.mirrorCard]}>
        <View style={styles.row}>
          <View style={styles.mirrorText}>
            <AppText variant="bodyMed">Repeats every month</AppText>
            <AppText variant="mono" muted style={styles.mirrorSub}>
              {repeats
                ? `A fresh copy is added on the ${ordinal(Number(day.split('-')[2]))} of each month, same people and split.`
                : 'For rent, utilities and subscriptions — post it once and it comes back each month.'}
            </AppText>
          </View>
          <Switch
            value={repeats}
            onValueChange={setRepeats}
            trackColor={{ true: colors.iris }}
          />
        </View>
      </View>

      <View style={[styles.card, styles.mirrorCard]}>
        <View style={styles.row}>
          <View style={styles.mirrorText}>
            <AppText variant="bodyMed">Count my share in my spending</AppText>
            <AppText variant="mono" muted style={styles.mirrorSub}>
              {mine > 0
                ? `Adds ${fmtMoney(mineHome)} to your own expenses, so it shows up in Home.`
                : 'Adds your share to your own expenses, so it shows up in Home.'}
            </AppText>
          </View>
          <Switch
            value={countsAsMine}
            onValueChange={setCountsAsMine}
            trackColor={{ true: colors.iris }}
          />
        </View>
      </View>

      {!isNew && (
        <Pressable
          style={[styles.settleBtn, settledAt != null && styles.settleBtnOn]}
          onPress={async () => {
            const next = settledAt == null ? Date.now() : null;
            setSettledAt(next);
            if (id) await setSharedSettled(id, next != null);
          }}
        >
          <AppText
            variant="bodySemi"
            color={settledAt != null ? colors.onSage : colors.text}
          >
            {settledAt != null ? '✓ Settled — tap to reopen' : 'Mark this bill settled'}
          </AppText>
        </Pressable>
      )}
      {!isNew && (
        <AppText variant="mono" muted style={styles.settleNote}>
          {settledAt != null
            ? 'Kept as history, but no longer counted in anyone’s balance.'
            : 'Once everyone has paid you back for this one, mark it settled and it drops out of the balances.'}
        </AppText>
      )}

      {!isNew && (
        <Pressable style={styles.deleteBtn} onPress={() => setDeleteVisible(true)}>
          <AppText variant="bodySemi" color={colors.danger}>
            Delete shared expense
          </AppText>
        </Pressable>
      )}

      <ConfirmDialog
        visible={!!error}
        title="Couldn't save this"
        message={error ?? ''}
        confirmLabel="OK"
        onConfirm={() => setError(null)}
      />
      <ConfirmDialog
        visible={deleteVisible}
        title="Delete shared expense"
        message={
          linkedExpenseId
            ? 'This also removes your share from your own spending. This cannot be undone.'
            : 'This cannot be undone.'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={doDelete}
        onCancel={() => setDeleteVisible(false)}
      />
    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 60 },
    scanBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      padding: 14,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: c.line,
    },
    scanIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scanGlyph: { fontSize: 19, lineHeight: 24 },
    scanText: { flex: 1 },
    scanHint: { marginTop: 3, fontSize: 11 },
    titleInput: {
      color: c.text,
      fontFamily: 'Archivo_600SemiBold',
      fontSize: 24,
      paddingVertical: 8,
      marginBottom: 8,
    },
    amountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    currencyBtn: { alignItems: 'center', marginRight: 10 },
    currencyCode: { fontSize: 12, marginTop: -2 },
    convertedRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 14, marginLeft: 2 },
    convertedLabel: { fontSize: 20 },
    convertedValue: { fontSize: 24 },
    fxCard: {
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      padding: 14,
      marginTop: -6,
      marginBottom: 18,
    },
    fxRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    fxSwap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    fxSwapIcon: { fontSize: 17 },
    fxInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    fxPrefix: { fontSize: 13 },
    fxInput: {
      minWidth: 96,
      backgroundColor: c.haze,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      height: 46,
      color: c.text,
      fontFamily: 'Archivo_400Regular',
      fontSize: 17,
      textAlign: 'right',
    },
    fxNote: { marginTop: 12, fontSize: 13, lineHeight: 19 },
    currency: { fontSize: 30, marginRight: 6 },
    amountInput: {
      flex: 1,
      color: c.text,
      fontFamily: 'SpaceMono_700Bold',
      fontSize: 34,
      paddingVertical: 4,
    },
    card: {
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      paddingHorizontal: 16,
      paddingVertical: 2,
    },
    mirrorCard: { marginTop: 24 },
    mirrorText: { flex: 1, paddingRight: 14 },
    mirrorSub: { marginTop: 4 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 15,
    },
    sectionLabel: { marginTop: 24, marginBottom: 10, marginLeft: 2 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.mist,
      borderRadius: radius.pill,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    chipActive: { borderColor: c.iris },
    catDot: { width: 8, height: 8, borderRadius: 4 },
    splitWho: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    check: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: { backgroundColor: c.sage, borderColor: c.sage },
    checkMark: { fontSize: 13, lineHeight: 17 },
    splitNote: { paddingBottom: 14, paddingTop: 2 },
    splitHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 24,
      marginBottom: 10,
      marginLeft: 2,
    },
    modeToggle: { flexDirection: 'row', backgroundColor: c.mist, borderRadius: radius.pill, padding: 3 },
    mode: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
    modeActive: { backgroundColor: c.haze },
    shareInput: {
      minWidth: 84,
      textAlign: 'right',
      color: c.text,
      fontFamily: 'SpaceMono_400Regular',
      fontSize: 15,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: c.haze,
      borderRadius: radius.sm,
    },
    deleteBtn: { alignItems: 'center', paddingVertical: 22, marginTop: 4 },
    settleBtn: {
      alignItems: 'center',
      paddingVertical: 15,
      marginTop: 24,
      borderRadius: radius.lg,
      backgroundColor: c.mist,
    },
    settleBtnOn: { backgroundColor: c.sage },
    settleNote: { marginTop: 10, textAlign: 'center' },
  });
}
