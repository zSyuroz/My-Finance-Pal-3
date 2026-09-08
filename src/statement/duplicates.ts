import type { ExpenseRow, IncomeRow } from '../db';
import type { ParsedTransaction } from '../statementImport';

/**
 * Spotting transactions you have already imported.
 *
 * Re-importing a statement is normal — you download this month's PDF, and it
 * overlaps last month's by a few days, or you simply import the same file
 * twice. Without this every row lands again, and because the app's savings
 * figure is cumulative, a double import doesn't just clutter a list, it
 * inflates a headline number.
 *
 * Matching is deliberately strict rather than clever: same date, same amount,
 * same direction. Bank descriptions for the identical transaction are stable
 * within one account, so the description is used to raise confidence, never to
 * rule a match out — a reworded description on the same day for the same
 * amount is still almost certainly the same transaction.
 */

export type DuplicateMatch = {
  /** What it collided with, for explaining the match to the user. */
  existingNote: string;
  /** True when the descriptions agree too, not just the date and amount. */
  exact: boolean;
};

const cents = (n: number) => Math.round(Math.abs(n) * 100);

/**
 * Reduces a bank description to its comparable core.
 *
 * Statements pad the same merchant with card numbers, reference ids and
 * varying whitespace ("DEBIT PURCHASE xx-2526 POKKA PTE LTD 8837291"), so raw
 * equality almost never holds even for a genuine repeat. Digits go, case goes,
 * and runs of space collapse.
 */
export function descriptionKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+/g, ' ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Existing = { date: string; amount: number; text: string; kind: 'expense' | 'income' };

function indexExisting(expenses: ExpenseRow[], income: IncomeRow[]): Map<string, Existing[]> {
  const byKey = new Map<string, Existing[]>();
  const add = (e: Existing) => {
    const key = `${e.kind}|${e.date}|${cents(e.amount)}`;
    const list = byKey.get(key);
    if (list) list.push(e);
    else byKey.set(key, [e]);
  };
  for (const e of expenses) {
    add({ date: e.date, amount: e.amount, text: e.note, kind: 'expense' });
  }
  for (const i of income) {
    add({ date: i.date, amount: i.amount, text: i.source, kind: 'income' });
  }
  return byKey;
}

/**
 * Flags which parsed rows already exist, keyed by `tempId`.
 *
 * Each existing transaction is consumed at most once, so importing a statement
 * that genuinely contains the same $4.50 coffee three times still brings in
 * three rows when only two were previously saved.
 */
export function findDuplicates(
  rows: ParsedTransaction[],
  expenses: ExpenseRow[],
  income: IncomeRow[]
): Map<string, DuplicateMatch> {
  const byKey = indexExisting(expenses, income);
  const used = new Set<Existing>();
  const found = new Map<string, DuplicateMatch>();

  for (const row of rows) {
    const key = `${row.direction}|${row.date}|${cents(row.amount)}`;
    const candidates = (byKey.get(key) ?? []).filter((c) => !used.has(c));
    if (candidates.length === 0) continue;

    // Prefer a candidate whose description also matches, so the report can say
    // how sure it is — but fall back to the first unused one on date+amount.
    const rowKey = descriptionKey(row.description);
    const exactMatch = candidates.find(
      (c) => rowKey.length > 0 && descriptionKey(c.text) === rowKey
    );
    const chosen = exactMatch ?? candidates[0];
    used.add(chosen);
    found.set(row.tempId, {
      existingNote: chosen.text,
      exact: chosen === exactMatch,
    });
  }
  return found;
}

/** The date window a set of parsed rows covers, for querying existing data. */
export function dateRange(rows: ParsedTransaction[]): { from: string; to: string } | null {
  if (rows.length === 0) return null;
  const dates = rows.map((r) => r.date).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}
