import type { ExpenseRow } from './db';
import { cents, fromCents } from './money';
import { currencyPrefix } from './currency';

export type CategoryKey = 'food' | 'transport' | 'shopping' | 'bills' | 'other';

// Colors sample the app's one accent ramp (emerald → lime → amber, see
// EVENT_COLORS in theme.ts) — categorical color is a data mark here, not
// decoration, so every category shares the same hue family. "Other" stays a
// neutral grey rather than claiming another ramp stop, since it isn't really
// a category.
export const CATEGORIES: { key: CategoryKey; label: string; color: string }[] = [
  { key: 'food', label: 'Food', color: '#14D98A' },
  { key: 'transport', label: 'Transport', color: '#77E34B' },
  { key: 'shopping', label: 'Shopping', color: '#C1E337' },
  { key: 'bills', label: 'Bills', color: '#F2D94E' },
  { key: 'other', label: 'Other', color: '#7E8885' },
];

/**
 * Where money comes from.
 *
 * Expenses have had categories from the start; income was free text, so the
 * app could tell you where money went but not where it came from. These reuse
 * the same accent ramp as expense categories so a mixed list still reads as
 * one palette.
 */
export type IncomeCategoryKey = 'salary' | 'bonus' | 'refund' | 'gift' | 'interest' | 'other';

export const INCOME_CATEGORIES: { key: IncomeCategoryKey; label: string; color: string }[] = [
  { key: 'salary', label: 'Salary', color: '#14D98A' },
  { key: 'bonus', label: 'Bonus', color: '#4FDF64' },
  { key: 'refund', label: 'Refund', color: '#8AE53F' },
  { key: 'gift', label: 'Gift', color: '#C1E337' },
  { key: 'interest', label: 'Interest', color: '#F2D94E' },
  { key: 'other', label: 'Other', color: '#7E8885' },
];

export function incomeCategoryMeta(key: string) {
  return (
    INCOME_CATEGORIES.find((c) => c.key === key) ??
    INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1]
  );
}

export function categoryMeta(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}

/**
 * Money rounded to whole units, for figures that are estimates rather than
 * records. A forecast printed to the cent claims a precision it does not have,
 * and is too long for a half-width tile besides.
 */
export function fmtMoneyRough(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}${currencyPrefix()}${Math.round(Math.abs(n)).toLocaleString()}`;
}

export function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}${currencyPrefix()}${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Adds money in cents, not in floats.
 *
 * Plain addition drifts: a hundred 1-cent expenses came to 1.0000000000000007
 * and 0.10 + 0.20 to 0.30000000000000004. Formatting hides it, but the totals
 * feed comparisons — whether a cycle is overspent, how full a budget ring is —
 * and a total that is a fraction of a cent over its limit is over it.
 * Everywhere else in the app already sums in cents; this was the exception.
 */
export function sumAmount(rows: { amount: number }[]): number {
  return fromCents(rows.reduce((total, r) => total + cents(r.amount), 0));
}

export function topCategory(rows: ExpenseRow[]): { key: CategoryKey; total: number } | null {
  if (rows.length === 0) return null;
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.category, (totals.get(r.category) ?? 0) + cents(r.amount));
  let best: { key: CategoryKey; total: number } | null = null;
  for (const [key, total] of totals) {
    if (!best || total > best.total) best = { key: key as CategoryKey, total };
  }
  return best && { key: best.key, total: fromCents(best.total) };
}

// Percent change in spend from `previous` to `current`. Null when there's
// nothing to compare (both zero) rather than a misleading 0%.
export function trendPct(current: number, previous: number): number | null {
  if (current === 0 && previous === 0) return null;
  if (previous === 0) return 100;
  return Math.round(((current - previous) / previous) * 100);
}
