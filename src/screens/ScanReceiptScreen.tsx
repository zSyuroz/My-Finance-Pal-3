import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  getProfile,
  listPeople,
  uid,
  upsertExpense,
  upsertSharedExpense,
  type PersonRow,
  type SharedExpenseRow,
  type SharedSplitRow,
} from '../db';
import { todayKey } from '../dateUtils';
import { allocateReceipt, parseReceipt, type ParsedReceipt } from '../receipt/parseReceipt';
import { recognizeReceipt, RECEIPT_SCAN_AVAILABLE } from '../receipt/ocr';
import { ME, personName, sumMoney } from '../sharing';
import { activeCurrency } from '../currency';
import { fmtMoney } from '../spending';
import { useTheme } from '../ThemeContext';
import { radius, shadow, type Theme } from '../theme';
import type { SharedStackParams } from '../navigation';

type Props = NativeStackScreenProps<SharedStackParams, 'ScanReceipt'>;

/**
 * Said in one place so the banner and the error dialog can't drift apart.
 * The recogniser is native code, so it is missing from Expo Go and from the
 * browser — the options stay on screen either way, because hiding them makes
 * the feature look absent rather than unavailable.
 */
const UNAVAILABLE_REASON =
  'Receipt text is read on the device itself, so nothing is uploaded anywhere — but that ' +
  'needs a development build of the app. It will not work in Expo Go or a browser.';

export default function ScanReceiptScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [people, setPeople] = useState<PersonRow[]>([]);
  const [myName, setMyName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [assignment, setAssignment] = useState<Record<string, string[]>>({});
  const [paidBy, setPaidBy] = useState<string>(ME);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setPeople(await listPeople());
      setMyName((await getProfile()).name);
    })();
  }, []);

  const everyone = [
    { id: ME, name: personName(ME, people, myName) },
    ...people.map((p) => ({ id: p.id, name: p.name })),
  ];

  const capture = async (source: 'camera' | 'gallery' | 'files') => {
    setError(null);
    // Refuse before opening a picker rather than after: choosing a photo and
    // only then being told it can't be read wastes the user's time.
    if (!RECEIPT_SCAN_AVAILABLE) {
      setError(UNAVAILABLE_REASON);
      return;
    }
    try {
      let uri: string | null = null;

      if (source === 'files') {
        // The Files app / Downloads, for a receipt saved as an image rather
        // than sitting in the camera roll.
        const picked = await DocumentPicker.getDocumentAsync({
          type: 'image/*',
          copyToCacheDirectory: true,
        });
        if (picked.canceled || !picked.assets?.[0]) return;
        uri = picked.assets[0].uri;
      } else {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError(
            source === 'camera'
              ? 'The app needs camera permission to scan a receipt. You can grant it in your device settings.'
              : 'The app needs permission to open your photos.'
          );
          return;
        }
        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
            : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
        if (result.canceled || !result.assets?.[0]) return;
        uri = result.assets[0].uri;
      }

      if (!uri) return;
      setPhoto(uri);
      setBusy(true);

      const text = await recognizeReceipt(uri);
      const parsed = parseReceipt(text);
      setReceipt(parsed);
      // Everything starts shared by everyone — that's the common case, and
      // unticking the one dish someone didn't have is quicker than assigning
      // every line from scratch.
      setAssignment(
        Object.fromEntries(parsed.items.map((i) => [i.id, everyone.map((p) => p.id)]))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that photo.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (itemId: string, personId: string) => {
    setAssignment((current) => {
      const on = current[itemId] ?? [];
      return {
        ...current,
        [itemId]: on.includes(personId) ? on.filter((p) => p !== personId) : [...on, personId],
      };
    });
  };

  const splitEvenlyAcrossAll = () => {
    if (!receipt) return;
    setAssignment(
      Object.fromEntries(receipt.items.map((i) => [i.id, everyone.map((p) => p.id)]))
    );
  };

  const shares = receipt ? allocateReceipt(receipt.items, assignment, receipt.extras) : {};
  const assignedTotal = sumMoney(Object.values(shares));
  const unassigned = receipt
    ? receipt.items.filter((i) => (assignment[i.id] ?? []).length === 0).length
    : 0;

  const save = async () => {
    if (!receipt) return;
    const participants = Object.keys(shares).filter((id) => shares[id] !== 0);
    if (participants.length === 0) {
      setError('Assign at least one item to someone before saving.');
      return;
    }

    const sharedId = uid();
    const mine = shares[ME] ?? 0;
    let linkedExpenseId: string | null = null;
    try {
      if (mine > 0) {
        linkedExpenseId = uid();
        await upsertExpense({
          id: linkedExpenseId,
          amount: mine,
          category: 'food',
          note: receipt.merchant || 'Receipt',
          date: todayKey(),
          createdAt: Date.now(),
          recurringId: null,
        });
      }
      const row: SharedExpenseRow = {
        id: sharedId,
        description: receipt.merchant || 'Receipt',
        amount: assignedTotal,
        category: 'food',
        date: todayKey(),
        paidBy,
        createdAt: Date.now(),
        countsAsMine: mine > 0 ? 1 : 0,
        linkedExpenseId,
        // Per-item assignment produces uneven shares by design, so the bill is
        // stored as exact amounts rather than an even split.
        splitMode: 'exact',
      // A scanned receipt is in whatever the app is set to; nothing on the
      // paper says otherwise, and the editor can change it afterwards.
      currency: activeCurrency(),
      rate: 1,
      homeAmount: assignedTotal,
      homeCurrency: activeCurrency(),
        settledAt: null,
        repeatsMonthly: 0,
        lastPostedMonth: null,
      };
      const splits: SharedSplitRow[] = participants.map((personId) => ({
        id: uid(),
        sharedId,
        personId,
        shareAmount: shares[personId],
      }));
      await upsertSharedExpense(row, splits);
    } catch (err) {
      setError(
        (err instanceof Error ? err.message : 'Something went wrong while saving.') +
          '\n\nThis receipt has not been saved.'
      );
      return;
    }
    navigation.goBack();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!receipt && (
        <>
          <View style={styles.intro}>
            <AppText variant="title" center>
              Scan a receipt
            </AppText>
            <AppText variant="body" muted center style={styles.introBody}>
              Take a photo of the whole receipt, flat and in good light. Every line is read on
              your phone — the photo never leaves it.
            </AppText>
          </View>
          {!RECEIPT_SCAN_AVAILABLE && (
            <View style={styles.notice}>
              <AppText variant="bodySemi" color={colors.onAction}>
                Not available in this build
              </AppText>
              <AppText variant="body" color={colors.onAction} style={styles.noticeBody}>
                {UNAVAILABLE_REASON}
              </AppText>
            </View>
          )}

          <Pressable style={styles.primaryBtn} onPress={() => capture('camera')} disabled={busy}>
            <AppText variant="bodySemi" color={colors.onAction}>
              Take a photo
            </AppText>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => capture('gallery')} disabled={busy}>
            <AppText variant="bodySemi">Pick from gallery</AppText>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => capture('files')} disabled={busy}>
            <AppText variant="bodySemi">Pick from files</AppText>
          </Pressable>
        </>
      )}

      {busy && (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.action} />
          <AppText variant="body" muted style={styles.busyText}>
            Reading the receipt…
          </AppText>
        </View>
      )}

      {receipt && (
        <>
          {photo && <Image source={{ uri: photo }} style={styles.preview} resizeMode="cover" />}

          <View style={styles.summaryRow}>
            <AppText variant="title">{receipt.merchant || 'Receipt'}</AppText>
            <AppText variant="monoBold">{fmtMoney(receipt.total ?? 0)}</AppText>
          </View>
          {receipt.extras !== 0 && (
            <AppText variant="mono" muted style={styles.extrasNote}>
              includes {fmtMoney(receipt.extras)} service, tax and rounding — shared in proportion
              to what each person ordered
            </AppText>
          )}
          {receipt.warnings.map((w) => (
            <AppText key={w} variant="body" color={colors.action} style={styles.warning}>
              {w}
            </AppText>
          ))}

          <View style={styles.actionsRow}>
            <AppText variant="label" muted>
              Who had what
            </AppText>
            <Pressable onPress={splitEvenlyAcrossAll} hitSlop={8}>
              <AppText variant="bodySemi" color={colors.iris}>
                Split all evenly
              </AppText>
            </Pressable>
          </View>

          {receipt.items.map((item) => {
            const on = assignment[item.id] ?? [];
            return (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemHead}>
                  <AppText variant="bodySemi" style={styles.itemName}>
                    {item.qty > 1 ? `${item.qty} × ` : ''}
                    {item.name}
                  </AppText>
                  <AppText variant="mono">{fmtMoney(item.amount)}</AppText>
                </View>
                <View style={styles.chips}>
                  {everyone.map((p) => {
                    const active = on.includes(p.id);
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => toggle(item.id, p.id)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <AppText variant={active ? 'bodySemi' : 'body'} muted={!active}>
                          {p.name}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                {on.length === 0 && (
                  <AppText variant="mono" color={colors.danger} style={styles.itemWarn}>
                    nobody assigned — this line will be left out
                  </AppText>
                )}
              </View>
            );
          })}

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

          <AppText variant="label" muted style={styles.sectionLabel}>
            Each person owes
          </AppText>
          <View style={styles.card}>
            {everyone.map((p) => (
              <View key={p.id} style={styles.oweRow}>
                <AppText variant="body">{p.name}</AppText>
                <AppText variant="monoBold">{fmtMoney(shares[p.id] ?? 0)}</AppText>
              </View>
            ))}
            <View style={[styles.oweRow, styles.oweTotal]}>
              <AppText variant="bodySemi">
                Total{unassigned > 0 ? ` (${unassigned} line${unassigned === 1 ? '' : 's'} left out)` : ''}
              </AppText>
              <AppText variant="monoBold">{fmtMoney(assignedTotal)}</AppText>
            </View>
          </View>

          <Pressable style={styles.primaryBtn} onPress={save}>
            <AppText variant="bodySemi" color={colors.onAction}>
              Add to shared expenses
            </AppText>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => { setReceipt(null); setPhoto(null); }}>
            <AppText variant="bodySemi">Scan a different receipt</AppText>
          </Pressable>
        </>
      )}

      <ConfirmDialog
        visible={!!error}
        title="Couldn't scan that"
        message={error ?? ''}
        confirmLabel="OK"
        onConfirm={() => setError(null)}
      />
    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 60 },
    centre: { alignItems: 'center', justifyContent: 'center', padding: 32 },
    notice: {
      backgroundColor: c.action,
      borderRadius: radius.lg,
      padding: 14,
      marginBottom: 4,
    },
    noticeBody: { marginTop: 6, opacity: 0.85, lineHeight: 19 },
    intro: { marginTop: 24, marginBottom: 24 },
    introBody: { marginTop: 10, lineHeight: 21 },
    primaryBtn: {
      height: 52,
      borderRadius: radius.md,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 20,
    },
    secondaryBtn: {
      height: 52,
      borderRadius: radius.md,
      backgroundColor: c.mist,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
    },
    busy: { alignItems: 'center', paddingVertical: 40, gap: 12 },
    busyText: {},
    preview: { width: '100%', height: 160, borderRadius: radius.lg, marginBottom: 16 },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    extrasNote: { marginTop: 6, lineHeight: 17 },
    warning: { marginTop: 10, lineHeight: 19 },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 24,
      marginBottom: 10,
    },
    itemCard: {
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      padding: 14,
      marginBottom: 10,
      ...shadow.card,
    },
    itemHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    itemName: { flex: 1, paddingRight: 12 },
    itemWarn: { marginTop: 8, fontSize: 11 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderRadius: radius.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: c.haze,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    chipActive: { borderColor: c.sage, backgroundColor: c.mist },
    sectionLabel: { marginTop: 24, marginBottom: 10, marginLeft: 2 },
    card: { backgroundColor: c.mist, borderRadius: radius.lg, paddingHorizontal: 16 },
    oweRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    oweTotal: { borderBottomWidth: 0 },
  });
}
