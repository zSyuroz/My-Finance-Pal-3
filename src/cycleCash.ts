import type { ExpenseRow, RecurringRow } from './db';
import { toKey } from './dateUtils';
import { round2 } from './money';

/**
 * What is left of this pay cycle, and what is already spoken for.
 *
 * The app could say what had been spent and what was owned, but not the one
 * thing people open a finance app to ask: can I spend this right now. That
 * answer needs three numbers held together — what came in, what has gone out,
 * and what has not gone out yet but will before the next payday. A balance
 * that ignores the rent due on Friday is a balance that lies to you.
 */

/** One recurring rule, resolved to the date it next falls due. */
export type DueBill = {
  rule: RecurringRow;
  /** YYYY-MM-DD of the occurrence inside the current cycle. */
  date: string;
  paid: boolean;
};

export type BillsAhead = {
  /** False when no recurring rules exist at all, which is a different empty
   *  state from "all of them are paid". */
  any: boolean;
  bills: DueBill[];
  unpaid: DueBill[];
  /** Money still to leave the account before the next payday. */
  unpaidTotal: number;
  paidTotal: number;
  /** Paid ÷ all, for the ring. Null when there is nothing due. */
  fraction: number | null;
  /** The next one to land, which is the only date worth putting on a card. */
  next: DueBill | null;
};

/**
 * Resolves a day-of-month rule to its occurrence inside one cycle.
 *
 * A cycle rarely lines up with a calendar month — paid on the 25th, the cycle
 * runs 25th to 25th — so a bill on the 1st belongs to the cycle that started
 * last month. Walking the months the cycle touches is what handles that, and
 * short months clamp the way the rest of the app clamps them (the 31st in
 * February is the 28th, not March 3rd).
 */
function occurrenceIn(rule: RecurringRow, start: Date, end: Date): string | null {
  for (let step = 0; step <= 1; step++) {
    const probe = new Date(start.getFullYear(), start.getMonth() + step, 1);
    const lastDay = new Date(probe.getFullYear(), probe.getMonth() + 1, 0).getDate();
    const date = new Date(probe.getFullYear(), probe.getMonth(), Math.min(rule.dayOfMonth, lastDay));
    if (date >= start && date < end) return toKey(date);
  }
  return null;
}

/**
 * The bills falling between the start of this cycle and the next payday.
 *
 * A bill counts as paid once the recurring poster has written its expense, so
 * this agrees with what the ledger actually holds rather than assuming money
 * moved on the day the rule said it would.
 */
export function billsAhead(
  rules: RecurringRow[],
  cycleExpenses: ExpenseRow[],
  cycleStart: Date,
  nextPayday: Date
): BillsAhead {
  const posted = new Set(
    cycleExpenses.map((e) => e.recurringId).filter((id): id is string => !!id)
  );

  const bills = rules
    .filter((r) => r.active === 1)
    .map((rule) => {
      const date = occurrenceIn(rule, cycleStart, nextPayday);
      return date ? { rule, date, paid: posted.has(rule.id) } : null;
    })
    .filter((b): b is DueBill => b !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const unpaid = bills.filter((b) => !b.paid);
  const sum = (list: DueBill[]) => round2(list.reduce((t, b) => t + b.rule.amount, 0));

  return {
    any: rules.some((r) => r.active === 1),
    bills,
    unpaid,
    unpaidTotal: sum(unpaid),
    paidTotal: sum(bills.filter((b) => b.paid)),
    fraction: bills.length > 0 ? (bills.length - unpaid.length) / bills.length : null,
    next: unpaid[0] ?? null,
  };
}

export type SafeToSpend = {
  /** Null until a salary is recorded — there is no honest number without one. */
  amount: number | null;
  /** What is left, per day, until the next payday. */
  perDay: number | null;
  daysLeft: number;
  spent: number;
  committed: number;
  income: number;
  /** Share of the cycle's money still unspent, for the ring. */
  fraction: number | null;
  over: boolean;
};

/**
 * What is genuinely free to spend before the next payday.
 *
 * Bills that have not posted yet are subtracted, not just the ones that have:
 * money that is going to leave on the 28th is not yours on the 27th, and a
 * "safe to spend" that says otherwise is worse than no number at all.
 */
export function safeToSpend(
  income: number | null,
  spent: number,
  committed: number,
  daysUntilPayday: number
): SafeToSpend {
  const days = Math.max(1, daysUntilPayday);
  if (income == null || !(income > 0)) {
    return {
      amount: null,
      perDay: null,
      daysLeft: days,
      spent: round2(spent),
      committed: round2(committed),
      income: 0,
      fraction: null,
      over: false,
    };
  }

  const amount = round2(income - spent - committed);
  return {
    amount,
    perDay: round2(amount / days),
    daysLeft: days,
    spent: round2(spent),
    committed: round2(committed),
    income: round2(income),
    // What is left, not what is gone: the ring empties as the cycle is used up.
    fraction: Math.max(0, Math.min(1, amount / income)),
    over: amount < 0,
  };
}
