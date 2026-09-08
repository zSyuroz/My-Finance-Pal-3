import { cents, round2 } from './money';
import type { AccountRow } from './db';

/**
 * What you own, what you owe, and the difference.
 *
 * This is the number the app was missing entirely: it could say what you
 * spent, never what you have. Spending tells you about a month; net worth
 * tells you whether the months are adding up to anything.
 *
 * Balances are stored positive and their meaning comes from the kind, so a
 * user typing "2400" into a credit card never has to remember a minus sign —
 * and can't silently invert their whole position by forgetting one.
 */

export type AccountKind = {
  key: string;
  label: string;
  /** Subtracted from net worth rather than added. */
  liability: boolean;
  /** Short line shown under the picker, to make the choice obvious. */
  hint: string;
  color: string;
};

export const ACCOUNT_KINDS: AccountKind[] = [
  { key: 'cash', label: 'Cash', liability: false, hint: 'Notes and coins on hand', color: '#14D98A' },
  { key: 'bank', label: 'Bank account', liability: false, hint: 'Savings and current accounts', color: '#4FDF64' },
  { key: 'ewallet', label: 'E-wallet', liability: false, hint: 'GrabPay, TnG, PayLah and the like', color: '#8AE53F' },
  { key: 'investment', label: 'Investments', liability: false, hint: 'Shares, funds, crypto', color: '#C1E337' },
  { key: 'retirement', label: 'CPF / EPF', liability: false, hint: 'Retirement balances you cannot spend yet', color: '#E3D437' },
  { key: 'property', label: 'Property', liability: false, hint: 'What the place is worth today', color: '#F2D94E' },
  { key: 'card', label: 'Credit card', liability: true, hint: 'What you currently owe on it', color: '#FF8D5A' },
  { key: 'loan', label: 'Loan', liability: true, hint: 'Study, car or personal loan outstanding', color: '#FF7043' },
  { key: 'mortgage', label: 'Mortgage', liability: true, hint: 'Outstanding home loan', color: '#F4511E' },
];

export function accountKind(key: string): AccountKind {
  return ACCOUNT_KINDS.find((k) => k.key === key) ?? ACCOUNT_KINDS[0];
}

export type NetWorth = {
  assets: number;
  liabilities: number;
  net: number;
  /** True once anything at all has been recorded. */
  any: boolean;
  /** Ratio of debt to assets — over 1 means you owe more than you own. */
  leverage: number | null;
};

export function netWorth(accounts: AccountRow[]): NetWorth {
  let assetCents = 0;
  let liabilityCents = 0;
  for (const a of accounts) {
    const value = cents(Math.abs(a.balance));
    if (accountKind(a.kind).liability) liabilityCents += value;
    else assetCents += value;
  }
  return {
    assets: assetCents / 100,
    liabilities: liabilityCents / 100,
    net: (assetCents - liabilityCents) / 100,
    any: accounts.length > 0,
    leverage: assetCents > 0 ? liabilityCents / assetCents : null,
  };
}

/**
 * How long your liquid money would last without income.
 *
 * The first question in any real review, and the one the app could never
 * answer. Deliberately counts only what you could actually spend this week —
 * a flat and a CPF balance are wealth, not a cushion, and including them
 * would report a comfortable runway to someone one payslip from trouble.
 */
const LIQUID_KINDS = new Set(['cash', 'bank', 'ewallet']);

export function emergencyFund(
  accounts: AccountRow[],
  monthlyExpenses: number
): { liquid: number; months: number | null } {
  const liquid =
    accounts
      .filter((a) => LIQUID_KINDS.has(a.kind))
      .reduce((sum, a) => sum + cents(Math.abs(a.balance)), 0) / 100;
  return {
    liquid: round2(liquid),
    months: monthlyExpenses > 0 ? round2(liquid / monthlyExpenses) : null,
  };
}

/**
 * Balances brought up to date with what has been spent since they were stated.
 *
 * A balance is a fact about a moment — the number in your banking app when you
 * looked. Left alone it is wrong by lunchtime. Left to be corrected by hand it
 * is wrong permanently, because nobody does that.
 *
 * A transaction only counts if it happened after the balance was stated, which
 * takes two rules rather than one:
 *
 *  - dated after the as-of day: always counts;
 *  - dated on the as-of day: counts only if it was recorded after the balance
 *    was saved, since anything logged before it was already in the figure the
 *    user typed;
 *  - dated before: never counts.
 *
 * That last rule is the important one. An imported statement covering last
 * month must not be subtracted from a balance that already reflected those
 * purchases — the classic way these figures end up counted twice.
 *
 * Only the everyday account moves. The app has no idea which card or wallet
 * any given purchase came from, and spreading spending across accounts it
 * cannot see would be a guess dressed up as arithmetic.
 */
export type Movement = { date: string; amount: number; createdAt: number };

/**
 * The date the live adjustment has to start from, or null when there is none.
 *
 * Exposed so callers can ask the database for just those rows instead of
 * reading every transaction and filtering afterwards.
 */
export function liveBalanceSince(accounts: AccountRow[]): string | null {
  const everyday = accounts.find((a) => a.isEveryday);
  return everyday?.balanceAsOf || null;
}

export function withLiveBalances(
  accounts: AccountRow[],
  expenses: Movement[],
  income: Movement[]
): { accounts: AccountRow[]; adjustment: number; since: string | null } {
  const everyday = accounts.find((a) => a.isEveryday);
  if (!everyday || !everyday.balanceAsOf) {
    return { accounts, adjustment: 0, since: null };
  }
  const since = everyday.balanceAsOf;
  const statedAt = everyday.updatedAt;

  const after = (t: Movement) =>
    t.date > since || (t.date === since && t.createdAt > statedAt);
  const total = (rows: Movement[]) =>
    rows.filter(after).reduce((sum, t) => sum + cents(t.amount), 0);

  const adjustment = (total(income) - total(expenses)) / 100;

  return {
    accounts: accounts.map((a) =>
      a.id === everyday.id ? { ...a, balance: round2(a.balance + adjustment) } : a
    ),
    adjustment: round2(adjustment),
    since,
  };
}
