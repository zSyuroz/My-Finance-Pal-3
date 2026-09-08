import type { ExpenseRow, IncomeRow } from './db';

/**
 * How far back Home's "Recent" list reaches. Shared rather than kept local to
 * Home because the statement importer has to know it too: anything older than
 * this won't appear there after an import, and saying so on the spot is the
 * difference between an obviously successful import and an apparent no-op.
 */
export const RECENT_WINDOW_DAYS = 14;

/**
 * The floor on how many transactions Recent shows. The 14-day window is about
 * keeping a busy dashboard current, but when it's empty — a quiet fortnight, or
 * a statement imported for an earlier month — an empty list is worse than a
 * slightly stale one. Below this count Recent falls back to simply the latest
 * transactions, whenever they happened.
 */
export const RECENT_MIN_ITEMS = 15;

export type TransactionItem =
  | ({ kind: 'expense' } & ExpenseRow)
  | ({ kind: 'income' } & IncomeRow);

/** Merges expenses and income into one list, newest first (by date, then by creation order within a day). */
export function mergeTransactions(expenses: ExpenseRow[], income: IncomeRow[]): TransactionItem[] {
  const merged: TransactionItem[] = [
    ...expenses.map((e): TransactionItem => ({ kind: 'expense', ...e })),
    ...income.map((i): TransactionItem => ({ kind: 'income', ...i })),
  ];
  return merged.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}
