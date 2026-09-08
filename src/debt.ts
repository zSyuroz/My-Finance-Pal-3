import type { AccountRow } from './db';
import { accountKind } from './networth';
import { round2 } from './money';

/**
 * What debt actually costs, and which one to kill first.
 *
 * This is where money is quietly lost. A card at 25% APR costs more each month
 * than most people save in a year, and no amount of cutting back on coffee
 * competes with clearing it — but an app that only records balances can never
 * say so. Everything here exists to turn a list of debts into an order.
 */

export function monthlyInterest(balance: number, apr: number): number {
  if (!(balance > 0) || !(apr > 0)) return 0;
  return round2((balance * (apr / 100)) / 12);
}

/**
 * Months to clear a balance at a fixed monthly payment.
 *
 * Returns null when the payment does not cover the interest, because the debt
 * then never clears — reporting "never" is the whole point, and any number
 * would be a lie.
 */
export function monthsToClear(balance: number, apr: number, payment: number): number | null {
  if (!(balance > 0)) return 0;
  if (!(payment > 0)) return null;
  const monthlyRate = apr / 100 / 12;
  if (monthlyRate <= 0) return Math.ceil(balance / payment);
  if (payment <= balance * monthlyRate) return null;

  // Standard amortisation, solved for the number of periods.
  const months = -Math.log(1 - (balance * monthlyRate) / payment) / Math.log(1 + monthlyRate);
  return Math.ceil(months);
}

export type DebtSummary = {
  any: boolean;
  totalOwed: number;
  /** What the debts cost per month in interest alone. */
  monthlyCost: number;
  /** Highest rate first — the order that costs least overall. */
  order: { account: AccountRow; apr: number; monthlyInterest: number }[];
  /** Debts whose payment never clears them. */
  stuck: AccountRow[];
};

/**
 * Ranked highest-rate-first (the avalanche), not smallest-balance-first.
 *
 * Snowball ordering is easier to stick to, but it is measurably more
 * expensive, and a tool giving financial information should default to the
 * arithmetic rather than the psychology.
 */
export function debtSummary(accounts: AccountRow[]): DebtSummary {
  const debts = accounts.filter((a) => accountKind(a.kind).liability && Math.abs(a.balance) > 0);
  const order = debts
    .map((account) => ({
      account,
      apr: account.apr ?? 0,
      monthlyInterest: monthlyInterest(Math.abs(account.balance), account.apr ?? 0),
    }))
    .sort((a, b) => b.apr - a.apr || Math.abs(b.account.balance) - Math.abs(a.account.balance));

  const stuck = debts.filter(
    (a) => monthsToClear(Math.abs(a.balance), a.apr ?? 0, a.minPayment ?? 0) == null
  );

  return {
    any: debts.length > 0,
    totalOwed: round2(debts.reduce((s, a) => s + Math.abs(a.balance), 0)),
    monthlyCost: round2(order.reduce((s, o) => s + o.monthlyInterest, 0)),
    order,
    stuck,
  };
}

export type DebtProgress = {
  /** What was owed in the earliest month on record. */
  startOwed: number;
  paidOff: number;
  /** Share of the original debt cleared, or null with nothing to compare to. */
  fraction: number | null;
};

/**
 * How much of the debt has actually gone.
 *
 * Read from the monthly net-worth snapshots the app already writes on open,
 * because nothing stores what a card started at — the balance is overwritten
 * every time it is edited. One month of history means no comparison and a null
 * fraction, which is honest: an empty ring beats a fabricated one.
 */
export function debtProgress(
  snapshots: { liabilities: number }[],
  owedNow: number
): DebtProgress {
  const first = snapshots.find((s) => s.liabilities > 0);
  const startOwed = round2(first?.liabilities ?? 0);
  if (!(startOwed > 0) || snapshots.length < 2) {
    return { startOwed, paidOff: 0, fraction: null };
  }
  const paidOff = round2(Math.max(0, startOwed - owedNow));
  return { startOwed, paidOff, fraction: Math.max(0, Math.min(1, paidOff / startOwed)) };
}

/** The one line worth putting in front of someone about their debts. */
export function debtHeadline(
  summary: DebtSummary,
  money: (n: number) => string
): string | null {
  if (!summary.any) return null;
  const stuckOne = summary.stuck[0];
  if (stuckOne) {
    return `${stuckOne.name} never clears at its current payment — the interest outpaces it.`;
  }
  const worst = summary.order[0];
  if (worst && worst.apr > 0) {
    return `Clear ${worst.account.name} first — at ${worst.apr}% it costs ${money(
      worst.monthlyInterest
    )} a month to keep.`;
  }
  return `${money(summary.totalOwed)} owed. Add interest rates to see what it costs you.`;
}
