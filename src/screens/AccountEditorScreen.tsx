import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import ConfirmDialog from '../components/ConfirmDialog';
import UnsavedChangesGuard from '../components/UnsavedChangesGuard';
import { useSaveAndClose } from '../components/useSaveAndClose';
import { todayKey } from '../dateUtils';
import {
  deleteAccount,
  getAccount,
  setEverydayAccount,
  uid,
  upsertAccount,
  type AccountRow,
} from '../db';
import { monthlyInterest, monthsToClear } from '../debt';
import { ACCOUNT_KINDS, accountKind } from '../networth';
import { fmtMoney } from '../spending';
import { useTheme } from '../ThemeContext';
import { radius, type Theme } from '../theme';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'AccountEditor'>;

/**
 * One account, on its own screen.
 *
 * It used to unfold beneath the list, which meant the fields you were filling
 * in sat below the balances you were changing, and a long form pushed the
 * account you tapped off the top of the screen. A pushed screen also gives
 * the back arrow something to mean.
 */
export default function AccountEditorScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const id = route.params?.id;
  const isNew = !id;

  const [existing, setExisting] = useState<AccountRow | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [kind, setKind] = useState('bank');
  const [apr, setApr] = useState('');
  const [minPayment, setMinPayment] = useState('');
  const [everyday, setEveryday] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  // Set when we leave on purpose, so the guard does not question our own exit.
  const leaving = useRef(false);

  useEffect(() => {
    navigation.setOptions({ title: isNew ? 'Add an account' : 'Edit account' });
  }, [navigation, isNew]);

  useEffect(() => {
    if (!id) return;
    getAccount(id).then((row) => {
      if (row) {
        setExisting(row);
        setName(row.name);
        setBalance(String(row.balance));
        setKind(row.kind);
        setApr(row.apr ? String(row.apr) : '');
        setMinPayment(row.minPayment ? String(row.minPayment) : '');
        setEveryday(!!row.isEveryday);
      }
      setLoaded(true);
    });
  }, [id]);

  // Shown while typing, so the cost of a rate is visible at the moment it is
  // entered rather than a screen away.
  const livePreview = (() => {
    const b = Math.abs(Number(balance.replace(/[^0-9.]/g, '')) || 0);
    const rate = Number(apr.replace(/[^0-9.]/g, '')) || 0;
    const pay = Number(minPayment.replace(/[^0-9.]/g, '')) || 0;
    if (!(b > 0) || !(rate > 0)) return null;
    const cost = monthlyInterest(b, rate);
    const months = monthsToClear(b, rate, pay);
    if (pay <= 0) return `Costs ${fmtMoney(cost)} a month in interest.`;
    if (months == null) {
      return `Costs ${fmtMoney(cost)} a month in interest — more than you are paying, so it never clears.`;
    }
    return `Costs ${fmtMoney(cost)} a month · clear in ${months} month${months === 1 ? '' : 's'}.`;
  })();

  const canSave = !!name.trim();
  const dirty =
    loaded &&
    canSave &&
    (isNew ||
      name !== (existing?.name ?? '') ||
      balance !== String(existing?.balance ?? '') ||
      kind !== (existing?.kind ?? 'bank') ||
      (Number(apr.replace(/[^0-9.]/g, '')) || 0) !== (existing?.apr ?? 0) ||
      (Number(minPayment.replace(/[^0-9.]/g, '')) || 0) !== (existing?.minPayment ?? 0) ||
      everyday !== !!existing?.isEveryday);

  const persist = async () => {
    if (!canSave) return;
    const value = Math.abs(Number(balance.replace(/[^0-9.]/g, '')) || 0);
    const now = Date.now();
    const accountId = id || uid();
    // The toggle is hidden for debts, so a kind switched to a liability must
    // not keep a flag the user can no longer see or clear.
    const spendFrom = everyday && !accountKind(kind).liability;
    await upsertAccount({
      id: accountId,
      name: name.trim(),
      kind,
      balance: value,
      note: '',
      apr: Number(apr.replace(/[^0-9.]/g, '')) || 0,
      minPayment: Number(minPayment.replace(/[^0-9.]/g, '')) || 0,
      // Stating a balance re-dates it to today, which clears the accumulated
      // adjustment — the number you just typed is true as of now.
      balanceAsOf: todayKey(),
      isEveryday: spendFrom ? 1 : 0,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    if (spendFrom) await setEverydayAccount(accountId);
  };

  const { save, saveFailedDialog } = useSaveAndClose({
    persist,
    leaving,
    goBack: () => navigation.goBack(),
    what: 'this account',
  });

  if (!loaded) return <View style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <UnsavedChangesGuard
        dirty={dirty}
        onSave={persist}
        leavingRef={leaving}
        title="Save this account?"
        message="You've filled in an account without saving it."
      />
      {saveFailedDialog}

      <AppText variant="label" muted style={styles.fieldLabel}>
        Name
      </AppText>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="DBS savings"
        placeholderTextColor={colors.textMuted}
        autoFocus={isNew}
      />

      <AppText variant="label" muted style={[styles.fieldLabel, styles.spaced]}>
        Balance
      </AppText>
      <TextInput
        style={styles.input}
        value={balance}
        onChangeText={setBalance}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.textMuted}
      />
      <AppText variant="mono" muted style={styles.hint}>
        {accountKind(kind).liability
          ? 'Enter what you owe as a positive number — it is subtracted for you.'
          : 'What the account holds today.'}
      </AppText>

      <AppText variant="label" muted style={[styles.fieldLabel, styles.spaced]}>
        Type
      </AppText>
      <View style={styles.kinds}>
        {ACCOUNT_KINDS.map((k) => (
          <Pressable
            key={k.key}
            onPress={() => setKind(k.key)}
            style={[styles.kindChip, kind === k.key && { borderColor: k.color }]}
          >
            <View style={[styles.kindDot, { backgroundColor: k.color }]} />
            <AppText variant={kind === k.key ? 'bodySemi' : 'body'}>{k.label}</AppText>
          </Pressable>
        ))}
      </View>
      <AppText variant="mono" muted style={styles.hint}>
        {accountKind(kind).hint}
      </AppText>

      {/* Only debts have a rate and a payment; asking a savings account for
          its APR would be noise on every other row. */}
      {accountKind(kind).liability && (
        <>
          <View style={styles.debtRow}>
            <View style={styles.debtField}>
              <AppText variant="label" muted style={styles.fieldLabel}>
                Interest rate %
              </AppText>
              <TextInput
                style={styles.input}
                value={apr}
                onChangeText={setApr}
                keyboardType="decimal-pad"
                placeholder="24.9"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.debtField}>
              <AppText variant="label" muted style={styles.fieldLabel}>
                Paying / month
              </AppText>
              <TextInput
                style={styles.input}
                value={minPayment}
                onChangeText={setMinPayment}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>
          {!!livePreview && (
            <AppText variant="mono" muted style={styles.hint}>
              {livePreview}
            </AppText>
          )}
        </>
      )}

      {!accountKind(kind).liability && (
        <Pressable style={styles.everydayRow} onPress={() => setEveryday((v) => !v)}>
          <View style={[styles.check, everyday && styles.checkOn]}>
            {everyday && (
              <AppText variant="bodySemi" color={colors.onSage} style={styles.checkMark}>
                ✓
              </AppText>
            )}
          </View>
          <View style={styles.everydayText}>
            <AppText variant="bodyMed">Spend from this account</AppText>
            <AppText variant="mono" muted style={styles.hint}>
              Expenses and income you log adjust this balance automatically.
            </AppText>
          </View>
        </Pressable>
      )}

      <Pressable style={styles.saveBtn} onPress={save} disabled={!canSave}>
        <AppText variant="bodySemi" color={canSave ? colors.onGold : colors.textMuted}>
          {isNew ? 'Add account' : 'Save'}
        </AppText>
      </Pressable>

      {!isNew && (
        <Pressable style={styles.deleteBtn} onPress={() => setDeleteVisible(true)}>
          <AppText variant="bodySemi" color={colors.danger}>
            Remove this account
          </AppText>
        </Pressable>
      )}

      <ConfirmDialog
        visible={deleteVisible}
        title={`Remove ${existing?.name ?? 'this account'}?`}
        message="It stops counting toward your net worth. Nothing else in the app is affected."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        onConfirm={async () => {
          setDeleteVisible(false);
          leaving.current = true;
          if (id) await deleteAccount(id);
          navigation.goBack();
        }}
        onCancel={() => setDeleteVisible(false)}
      />
    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 60 },
    fieldLabel: { marginBottom: 8, marginLeft: 2 },
    spaced: { marginTop: 18 },
    input: {
      backgroundColor: c.mist,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      height: 48,
      color: c.text,
      fontFamily: 'Archivo_400Regular',
      fontSize: 16,
    },
    hint: { marginTop: 8, fontSize: 11, lineHeight: 16 },
    kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    kindChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.mist,
      borderRadius: radius.pill,
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    kindDot: { width: 8, height: 8, borderRadius: 4 },
    debtRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
    debtField: { flex: 1 },
    everydayRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 20 },
    everydayText: { flex: 1 },
    check: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    checkOn: { backgroundColor: c.sage, borderColor: c.sage },
    checkMark: { fontSize: 13, lineHeight: 17 },
    saveBtn: {
      height: 50,
      borderRadius: radius.md,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 26,
    },
    deleteBtn: { alignItems: 'center', paddingTop: 20, paddingBottom: 4 },
  });
}
