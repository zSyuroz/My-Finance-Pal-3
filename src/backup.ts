import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  type AccountRow,
  type BudgetRow,
  type DocRow,
  type EventRow,
  type ExpenseRow,
  type GoalRow,
  type NetWorthSnapshot,
  type IncomeRow,
  type PersonRow,
  type SharedExpenseRow,
  type SharedSplitRow,
  type PaymentRow,
  type RecurringIncomeRow,
  type RecurringRow,
  captureNetWorth,
  getNotificationsEnabled,
  getPayday,
  listAccounts,
  listAllExpenses,
  listAllIncome,
  listAllSettings,
  listBudgets,
  listDocs,
  listEvents,
  listGoals,
  listNetWorthSnapshots,
  listPeople,
  listRecurringIncome,
  upsertRecurringIncome,
  listRecurring,
  listSharedExpenses,
  listSplits,
  listPayments,
  setBudget,
  setSetting,
  upsertAccount,
  upsertDoc,
  upsertEvent,
  upsertExpense,
  upsertGoal,
  upsertIncome,
  upsertPerson,
  upsertPayment,
  upsertRecurring,
  upsertSharedExpense,
} from './db';
import { syncScheduledNotifications } from './reminders';

// Not a display name: it is stamped into every export and checked on the way
// back in, so it has to keep matching the backups people already hold. The app
// was called planner-app when the format was set.
const APP_ID = 'planner-app';
// 2 added accounts, budgets, goals and the net-worth history. Version 1
// files still import — every table is optional on the way back in.
// 3 added recurring income, which took over from the pay-rhythm settings.
const BACKUP_VERSION = 3;

export type BackupEnvelope = {
  app: typeof APP_ID;
  version: number;
  exportedAt: number;
  data: {
    events: EventRow[];
    documents: DocRow[];
    expenses: ExpenseRow[];
    recurring_expenses: RecurringRow[];
    recurring_income: RecurringIncomeRow[];
    income: IncomeRow[];
    people: PersonRow[];
    shared_expenses: SharedExpenseRow[];
    shared_splits: SharedSplitRow[];
    payments: PaymentRow[];
    accounts: AccountRow[];
    budgets: BudgetRow[];
    goals: GoalRow[];
    net_worth_snapshots: NetWorthSnapshot[];
    settings: { key: string; value: string }[];
  };
};

export type ImportSummary = {
  events: number;
  documents: number;
  expenses: number;
  recurring: number;
  income: number;
  shared: number;
  accounts: number;
  budgets: number;
  goals: number;
};

async function buildEnvelope(): Promise<BackupEnvelope> {
  const [
    events,
    documents,
    expenses,
    recurring_expenses,
    recurring_income,
    income,
    people,
    shared_expenses,
    shared_splits,
    payments,
    accounts,
    budgets,
    goals,
    net_worth_snapshots,
    settings,
  ] = await Promise.all([
    listEvents(),
    listDocs(),
    listAllExpenses(),
    listRecurring(),
    listRecurringIncome(),
    listAllIncome(),
    listPeople(),
    listSharedExpenses(),
    listSplits(),
    listPayments(),
    listAccounts(),
    listBudgets(),
    listGoals(),
    listNetWorthSnapshots(),
    listAllSettings(),
  ]);
  return {
    app: APP_ID,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    data: {
      events,
      documents,
      expenses,
      recurring_expenses,
      recurring_income,
      income,
      people,
      shared_expenses,
      shared_splits,
      payments,
      accounts,
      budgets,
      goals,
      net_worth_snapshots,
      settings,
    },
  };
}

function backupFilename(): string {
  const d = new Date();
  const stamp = [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-');
  return `planner-backup-${stamp}.json`;
}

/**
 * Writes every table to a JSON file and hands it to the OS share sheet (native)
 * or triggers a browser download (web) so the user can move it to a new phone.
 */
export async function exportData(): Promise<void> {
  const json = JSON.stringify(await buildEnvelope(), null, 2);
  const filename = backupFilename();

  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save your planner backup',
    });
  }
}

function parseEnvelope(jsonText: string): BackupEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const env = parsed as Partial<BackupEnvelope> | null;
  if (!env || env.app !== APP_ID || !env.data) {
    throw new Error('That file is not a My Finance Pal backup.');
  }
  return env as BackupEnvelope;
}

async function applyEnvelope(env: BackupEnvelope): Promise<ImportSummary> {
  const {
    events = [],
    documents = [],
    expenses = [],
    recurring_expenses = [],
    recurring_income = [],
    income = [],
    people = [],
    shared_expenses = [],
    shared_splits = [],
    payments = [],
    accounts = [],
    budgets = [],
    goals = [],
    net_worth_snapshots = [],
    settings = [],
  } = env.data;

  for (const e of events) await upsertEvent(e);
  for (const d of documents) await upsertDoc(d);
  for (const ex of expenses) await upsertExpense(ex);
  for (const r of recurring_expenses) await upsertRecurring(r);
  for (const r of recurring_income) await upsertRecurringIncome(r);
  for (const i of income) await upsertIncome(i);
  for (const p of people) await upsertPerson(p);
  // Splits are grouped back onto their expense, because `upsertSharedExpense`
  // replaces an expense's splits wholesale rather than adding to them.
  for (const se of shared_expenses) {
    await upsertSharedExpense(
      se,
      shared_splits.filter((s) => s.sharedId === se.id)
    );
  }
  for (const pay of payments) await upsertPayment(pay);
  for (const a of accounts) await upsertAccount(a);
  for (const b of budgets) await setBudget(b.category, b.amount);
  for (const g of goals) await upsertGoal(g);
  // Restored rather than recomputed: the history is months of past positions
  // that today's accounts cannot reproduce.
  for (const snap of net_worth_snapshots) {
    await captureNetWorth(snap.month, snap.assets, snap.liabilities);
  }
  for (const s of settings) await setSetting(s.key, s.value);

  // Imported events carry their reminder offsets, but nothing is registered
  // with the OS yet — without this, a restored backup would show reminders
  // that never fire. Re-syncing picks up a restored payday at the same time.
  const pay = await getPayday();
  await syncScheduledNotifications(await getNotificationsEnabled(), pay.day);

  return {
    events: events.length,
    documents: documents.length,
    expenses: expenses.length,
    recurring: recurring_expenses.length,
    income: income.length,
    shared: shared_expenses.length,
    accounts: accounts.length,
    budgets: budgets.length,
    goals: goals.length,
  };
}

/** Merges a backup's rows into local data (existing ids are overwritten, others are added). */
export async function importFromText(jsonText: string): Promise<ImportSummary> {
  return applyEnvelope(parseEnvelope(jsonText));
}

/** Opens the OS document picker and imports the chosen backup file (native + web). */
export async function pickAndImportData(): Promise<ImportSummary | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
  return importFromText(text);
}
