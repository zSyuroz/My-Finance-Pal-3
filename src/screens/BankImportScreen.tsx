import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  expensesBetween,
  incomeBetween,
  uid,
  upsertExpense,
  upsertIncome,
  type ExpenseRow,
  type IncomeRow,
} from '../db';
import { dateRange, findDuplicates, type DuplicateMatch } from '../statement/duplicates';
import { guessIncomeCategory } from '../statement/merchants';
import { prettyDate, shiftDays, todayKey } from '../dateUtils';
import { RECENT_WINDOW_DAYS } from '../transactions';
import { categoryMeta, CATEGORIES, fmtMoney } from '../spending';
import {
  parseStatementFile,
  type Direction,
  type ParsedTransaction,
} from '../statementImport';
import { useTheme } from '../ThemeContext';
import { radius, shadow, type Theme } from '../theme';
import type { HomeStackParams } from '../navigation';

type Props = NativeStackScreenProps<HomeStackParams, 'BankImport'>;

type ReviewRow = ParsedTransaction & { included: boolean; duplicate?: DuplicateMatch };

const CLASSIFICATION_ORDER = [...CATEGORIES.map((c) => c.key), 'income'] as const;

function nextClassification(direction: Direction, category: ParsedTransaction['category']) {
  const current = direction === 'income' ? 'income' : category;
  const idx = CLASSIFICATION_ORDER.indexOf(current as (typeof CLASSIFICATION_ORDER)[number]);
  const next = CLASSIFICATION_ORDER[(idx + 1) % CLASSIFICATION_ORDER.length];
  return next === 'income'
    ? { direction: 'income' as Direction, category }
    : { direction: 'expense' as Direction, category: next };
}

export default function BankImportScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [problem, setProblem] = useState<{ title: string; message: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [doneDialog, setDoneDialog] = useState<string | null>(null);

  const onChooseFile = async () => {
    setProblem(null);
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setParsing(true);
    try {
      const parsed = await parseStatementFile({
        name: asset.name,
        uri: asset.uri,
        mimeType: asset.mimeType,
        file: asset.file,
      });
      if (parsed.rows.length === 0) {
        setProblem({
          title: "Couldn't read that file",
          message:
            parsed.warnings[0] ??
            "No transactions found in that file — check it's a transaction export with dates and amounts.",
        });
        return;
      }
      setSource(parsed.bank ? parsed.bank.name : null);
      setWarnings(parsed.warnings);

      // Cross-check against what's already saved over the same dates, so a
      // second import of the same statement doesn't silently double everything.
      const span = dateRange(parsed.rows);
      const [existingExpenses, existingIncome] = span
        ? await Promise.all([
            expensesBetween(span.from, span.to),
            incomeBetween(span.from, span.to),
          ])
        : [[], []];
      const dupes = findDuplicates(parsed.rows, existingExpenses, existingIncome);
      setRows(
        parsed.rows.map((tx) => {
          const duplicate = dupes.get(tx.tempId);
          // Already-imported rows come in unticked. They stay visible and can
          // be ticked back on, because a genuine repeat purchase on the same
          // day for the same amount does happen.
          return { ...tx, included: !duplicate, duplicate };
        })
      );
    } catch (err) {
      setProblem({
        title: "Couldn't read that file",
        message: err instanceof Error ? err.message : 'Could not read that file.',
      });
    } finally {
      setParsing(false);
    }
  };

  const toggleIncluded = (tempId: string) => {
    setRows((rs) => rs && rs.map((r) => (r.tempId === tempId ? { ...r, included: !r.included } : r)));
  };

  const cycleClassification = (tempId: string) => {
    setRows(
      (rs) =>
        rs &&
        rs.map((r) => {
          if (r.tempId !== tempId) return r;
          const next = nextClassification(r.direction, r.category);
          return { ...r, ...next };
        })
    );
  };

  const editDescription = (tempId: string, description: string) => {
    setRows((rs) => rs && rs.map((r) => (r.tempId === tempId ? { ...r, description } : r)));
  };

  const included = rows?.filter((r) => r.included) ?? [];
  const duplicates = rows?.filter((r) => r.duplicate) ?? [];
  const duplicateCount = duplicates.length;
  const allDuplicatesOn = duplicateCount > 0 && duplicates.every((r) => r.included);
  const includedExpenses = included.filter((r) => r.direction === 'expense');
  const includedIncome = included.filter((r) => r.direction === 'income');

  const onImport = async () => {
    if (included.length === 0) return;
    setImporting(true);
    let savedCount = 0;
    try {
      for (const tx of includedExpenses) {
        const row: ExpenseRow = {
          id: uid(),
          amount: tx.amount,
          category: tx.category,
          note: tx.description,
          date: tx.date,
          createdAt: Date.now(),
          recurringId: null,
        };
        await upsertExpense(row);
        savedCount++;
      }
      for (const tx of includedIncome) {
        const row: IncomeRow = {
          id: uid(),
          amount: tx.amount,
          source: tx.description,
          category: guessIncomeCategory(tx.description),
          note: '',
          date: tx.date,
          createdAt: Date.now(),
        };
        await upsertIncome(row);
        savedCount++;
      }
      const parts = [
        includedExpenses.length && `${includedExpenses.length} expense${includedExpenses.length === 1 ? '' : 's'} (${fmtMoney(includedExpenses.reduce((s, r) => s + r.amount, 0))})`,
        includedIncome.length && `${includedIncome.length} income entr${includedIncome.length === 1 ? 'y' : 'ies'} (${fmtMoney(includedIncome.reduce((s, r) => s + r.amount, 0))})`,
      ].filter(Boolean);
      // A statement is usually last month's, and Home only shows the last two
      // weeks — so without this the import succeeds and the dashboard looks
      // untouched, which reads as failure. Say where the rows went.
      const cutoff = shiftDays(todayKey(), -(RECENT_WINDOW_DAYS - 1));
      const olderThanRecent = included.filter((tx) => tx.date < cutoff).length;
      const whereToLook =
        olderThanRecent === included.length
          ? `\n\nThese are older than ${RECENT_WINDOW_DAYS} days, so they won't show under Recent on the home screen — find them under History.`
          : olderThanRecent > 0
            ? `\n\n${olderThanRecent} of them are older than ${RECENT_WINDOW_DAYS} days and will appear under History rather than Recent.`
            : '';
      setDoneDialog(`Imported ${parts.join(' and ')}.${whereToLook}`);
    } catch (err) {
      // Previously this was a bare try/finally: a failed write reset the
      // button and said nothing at all, so pressing Import looked like it
      // did nothing. Whatever went wrong, it has to be visible — and any
      // rows written before the failure are already saved, which the
      // message has to admit so nobody imports the same statement twice.
      const saved = savedCount;
      setProblem({
        title: "Couldn't save everything",
        message:
          (err instanceof Error ? err.message : 'Something went wrong while saving.') +
          (saved > 0
            ? `\n\n${saved} of ${included.length} were saved before this happened — check your expenses before importing this statement again.`
            : '\n\nNothing was saved. Try again, and if it keeps failing, restart the app.'),
      });
    } finally {
      setImporting(false);
    }
  };

  const onDoneConfirmed = () => {
    setDoneDialog(null);
    navigation.navigate('HomeMain');
  };

  return (
    <View style={styles.container}>
      {!rows && (
        <View style={styles.pickWrap}>
          <View style={styles.pickCard}>
            <AppText variant="title">Import a bank statement</AppText>
            <AppText variant="body" muted style={styles.pickBody}>
              Pick a CSV export from your bank (most reliable), or a PDF statement
              (best-effort — some banks' layouts won't parse cleanly). You'll get a
              chance to review and edit everything before anything is saved.
            </AppText>
            {parsing ? (
              <View style={styles.parsingRow}>
                <ActivityIndicator color={colors.iris} />
                <AppText variant="body" muted>
                  Reading file…
                </AppText>
              </View>
            ) : (
              <Pressable style={styles.chooseBtn} onPress={onChooseFile}>
                <AppText variant="bodySemi" color="#fff">
                  Choose file
                </AppText>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {rows && (
        <>
          <FlatList
            data={rows}
            keyExtractor={(r) => r.tempId}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <>
                <Pressable
                  style={styles.selectAllRow}
                  onPress={() => {
                    const allIn = rows.every((r) => r.included);
                    setRows(rows.map((r) => ({ ...r, included: !allIn })));
                  }}
                >
                  <AppText variant="label" muted>
                    {source ? `${source} · ` : ''}
                    {rows.length} transaction{rows.length === 1 ? '' : 's'}
                  </AppText>
                  <AppText variant="bodySemi" color={colors.iris}>
                    {rows.every((r) => r.included) ? 'Deselect all' : 'Select all'}
                  </AppText>
                </Pressable>
                {warnings.map((w) => (
                  <AppText key={w} variant="body" muted style={styles.warning}>
                    {w}
                  </AppText>
                ))}
                {duplicateCount > 0 && (
                  <View style={styles.dupeBanner}>
                    <View style={styles.dupeBannerTop}>
                      <AppText variant="bodySemi" color={colors.onAction}>
                        {duplicateCount} already imported
                      </AppText>
                      <Pressable
                        onPress={() =>
                          setRows(
                            rows.map((r) =>
                              r.duplicate ? { ...r, included: !allDuplicatesOn } : r
                            )
                          )
                        }
                        hitSlop={8}
                      >
                        <AppText variant="bodySemi" color={colors.onAction}>
                          {allDuplicatesOn ? 'Skip them' : 'Include anyway'}
                        </AppText>
                      </Pressable>
                    </View>
                    <AppText variant="body" color={colors.onAction} style={styles.dupeBannerBody}>
                      These match transactions already saved on the same date for the same
                      amount, so they're unticked. Tick one back on if it really happened twice.
                    </AppText>
                  </View>
                )}
              </>
            }
            renderItem={({ item }) => {
              const isIncome = item.direction === 'income';
              const meta = isIncome ? null : categoryMeta(item.category);
              return (
                <View style={[styles.row, !item.included && styles.rowDimmed]}>
                  <Pressable
                    style={[styles.checkbox, item.included && { backgroundColor: colors.iris, borderColor: colors.iris }]}
                    onPress={() => toggleIncluded(item.tempId)}
                  >
                    {item.included && (
                      <AppText variant="bodySemi" color="#fff" style={styles.checkmark}>
                        ✓
                      </AppText>
                    )}
                  </Pressable>

                  <View style={styles.rowMain}>
                    <View style={styles.rowTopLine}>
                      <AppText variant="mono" muted style={styles.rowDate}>
                        {prettyDate(item.date)}
                      </AppText>
                      <AppText
                        variant="monoBold"
                        color={isIncome ? colors.sage : colors.text}
                        style={styles.rowAmount}
                      >
                        {isIncome ? '+' : '−'}
                        {fmtMoney(item.amount)}
                      </AppText>
                    </View>
                    <TextInput
                      style={styles.descInput}
                      value={item.description}
                      onChangeText={(v) => editDescription(item.tempId, v)}
                    />
                    {item.duplicate && (
                      <AppText variant="mono" color={colors.action} style={styles.dupeTag}>
                        {item.duplicate.exact
                          ? 'already imported'
                          : `already have ${fmtMoney(item.amount)} on this date`}
                      </AppText>
                    )}
                  </View>

                  <Pressable
                    style={[
                      styles.classPill,
                      { backgroundColor: isIncome ? colors.sage : meta!.color },
                    ]}
                    onPress={() => cycleClassification(item.tempId)}
                  >
                    <AppText variant="mono" color="#fff" style={styles.classPillText}>
                      {isIncome ? 'Income' : meta!.label}
                    </AppText>
                  </Pressable>
                </View>
              );
            }}
          />

          <View style={styles.footer}>
            <View style={{ flex: 1 }}>
              <AppText variant="mono" muted>
                {includedExpenses.length} expense{includedExpenses.length === 1 ? '' : 's'} ·{' '}
                {includedIncome.length} income
              </AppText>
            </View>
            <Pressable
              style={[styles.importBtn, included.length === 0 && styles.importBtnDisabled]}
              disabled={included.length === 0 || importing}
              onPress={onImport}
            >
              {importing ? (
                <ActivityIndicator color={colors.onAction} />
              ) : (
                <AppText variant="bodySemi" color={colors.onAction}>
                  Import {included.length}
                </AppText>
              )}
            </Pressable>
          </View>
        </>
      )}

      <ConfirmDialog
        visible={!!problem}
        title={problem?.title ?? ''}
        message={problem?.message ?? ''}
        confirmLabel="OK"
        onConfirm={() => setProblem(null)}
      />
      <ConfirmDialog
        visible={!!doneDialog}
        title="Import complete"
        message={doneDialog ?? ''}
        confirmLabel="OK"
        onConfirm={onDoneConfirmed}
      />
    </View>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    pickWrap: { flex: 1, padding: 20, justifyContent: 'center' },
    pickCard: {
      backgroundColor: c.mist,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.line,
      padding: 22,
      ...shadow.card,
    },
    pickBody: { marginTop: 10, lineHeight: 20 },
    parsingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
    chooseBtn: {
      marginTop: 20,
      backgroundColor: c.iris,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    list: { padding: 16, paddingBottom: 12 },
    selectAllRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      paddingHorizontal: 4,
    },
    dupeBanner: {
      backgroundColor: c.action,
      borderRadius: radius.lg,
      padding: 14,
      marginBottom: 12,
    },
    dupeBannerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    dupeBannerBody: { opacity: 0.85, lineHeight: 19 },
    dupeTag: { marginTop: 4, fontSize: 12 },
    warning: { paddingHorizontal: 4, marginBottom: 10, lineHeight: 19 },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      padding: 12,
      marginBottom: 8,
    },
    rowDimmed: { opacity: 0.45 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    checkmark: { fontSize: 13, lineHeight: 15 },
    rowMain: { flex: 1 },
    rowTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    rowDate: { fontSize: 12 },
    rowAmount: { fontSize: 15 },
    descInput: {
      fontSize: 14,
      color: c.text,
      marginTop: 4,
      paddingVertical: 2,
    },
    classPill: {
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginTop: 2,
    },
    classPillText: { fontSize: 11 },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      backgroundColor: c.haze,
    },
    importBtn: {
      backgroundColor: c.action,
      borderRadius: radius.md,
      paddingHorizontal: 20,
      paddingVertical: 12,
      minWidth: 110,
      alignItems: 'center',
    },
    importBtnDisabled: { opacity: 0.4 },
  });
}
