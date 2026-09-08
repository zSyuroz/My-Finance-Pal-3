import type { PaymentRow, PersonRow, SharedExpenseRow, SharedSplitRow } from './db';
import { activeCurrency } from './currency';
import { cents, fromCents } from './money';
import { prettyDate } from './dateUtils';
import { fmtMoney } from './spending';

/**
 * The id standing for you.
 *
 * You are a participant in almost every shared expense, but you are not a row
 * in the people table — there's no name to edit and no way to delete yourself.
 * A reserved id keeps every split, balance and settlement calculation uniform
 * instead of special-casing "and also the user" at each step.
 */
export const ME = 'me';

export const isMe = (id: string) => id === ME;

/**
 * Display name for any participant id, including you.
 *
 * `myName` is the name from your profile. Once you've set one, your own rows
 * read as that name rather than "You" — which matters most in the shared text,
 * since that gets pasted into a group chat where "You" means nothing to anyone
 * reading it. Falls back to "You" while no profile name is set.
 */
export function personName(id: string, people: PersonRow[], myName?: string): string {
  if (isMe(id)) return myName?.trim() || 'You';
  return people.find((p) => p.id === id)?.name ?? 'Someone';
}

const toCents = cents;
const toMoney = fromCents;

/**
 * What a bill is worth in the app's own currency.
 *
 * Every balance, split and settlement is denominated in one currency, and it
 * is this one. `homeAmount` is written when the bill is saved, using the rate
 * of that day; bills entered before conversion existed have none, and their
 * amount already was the home amount.
 */
export function homeAmount(e: SharedExpenseRow): number {
  return e.homeAmount ?? e.amount;
}

/** The currency a bill was actually paid in; empty means the app's own. */
export function billCurrency(e: SharedExpenseRow, home: string): string {
  return e.currency || home;
}

/** True when the bill was paid in something other than the app's currency. */
export function isForeign(e: SharedExpenseRow, home: string): boolean {
  return billCurrency(e, home) !== home;
}

/**
 * Splits an amount evenly, in whole cents, so the parts add back up exactly.
 *
 * $10 between three people is not $3.33 each — that loses a cent, and a
 * tracker that quietly loses a cent per bill is worse than useless for
 * settling up. The remainder is handed out one cent at a time to the earliest
 * shares, which is the convention people use splitting cash anyway.
 */
export function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const cents = toCents(total);
  const base = Math.trunc(cents / count);
  let remainder = cents - base * count;
  const step = remainder < 0 ? -1 : 1;
  remainder = Math.abs(remainder);

  const shares: number[] = [];
  for (let i = 0; i < count; i++) {
    const extra = i < remainder ? step : 0;
    shares.push(toMoney(base + extra));
  }
  return shares;
}

/**
 * Converts already-decided shares into the home currency, keeping the total.
 *
 * Converting each share on its own and adding them up does not reliably give
 * the converted total — three shares of ฿400 at 0.0378 are $15.12 each, $45.36
 * together, while ฿1,200 converts to $45.36 only by luck. Whenever they
 * disagree the difference is a cent or two, and it is handed out one cent at a
 * time to the largest shares, so the split still adds up to the bill.
 */
export function convertShares(shares: number[], rate: number, homeTotal: number): number[] {
  if (shares.length === 0) return [];
  const cents = shares.map((s) => Math.round(s * rate * 100));
  const target = Math.round(homeTotal * 100);
  let drift = target - cents.reduce((sum, c) => sum + c, 0);

  // Largest shares absorb the rounding, which is where a cent is least visible.
  const order = cents
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c - a.c)
    .map((x) => x.i);
  let k = 0;
  while (drift !== 0 && order.length > 0) {
    const i = order[k % order.length];
    cents[i] += drift > 0 ? 1 : -1;
    drift += drift > 0 ? -1 : 1;
    k++;
  }
  return cents.map(toMoney);
}

/**
 * Adds money without float drift.
 *
 * Seven shares of a 10c bill are 2,2,2,1,1,1,1 cents — exactly 10 — but adding
 * them as plain floats gives 0.09999999999999998. Rounding each to cents before
 * summing keeps totals equal to the sum of what's displayed.
 */
export function sumMoney(values: number[]): number {
  return values.reduce((cents, v) => cents + toCents(v), 0) / 100;
}

export type Balance = {
  personId: string;
  /** Positive: they are owed this much. Negative: they owe this much. */
  net: number;
  paid: number;
  share: number;
};

export const isSettled = (e: SharedExpenseRow) => e.settledAt != null;

/**
 * What each participant paid, what they owed, and the difference.
 *
 * Bills marked settled are left out: the money on those has already changed
 * hands, so counting them would keep reporting debts that were paid. They stay
 * in the list as history, they just stop moving the balance.
 *
 * Everything is summed in cents and converted back once at the end, so a
 * hundred bills of $33.33 can't drift the way repeated float addition would.
 */
export function balances(
  allExpenses: SharedExpenseRow[],
  splits: SharedSplitRow[],
  payments: PaymentRow[] = []
): Balance[] {
  const expenses = allExpenses.filter((e) => !isSettled(e));
  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, cents: number) =>
    map.set(key, (map.get(key) ?? 0) + cents);

  const byExpense = new Map<string, SharedSplitRow[]>();
  for (const split of splits) {
    const list = byExpense.get(split.sharedId);
    if (list) list.push(split);
    else byExpense.set(split.sharedId, [split]);
  }

  for (const expense of expenses) {
    add(paid, expense.paidBy, toCents(homeAmount(expense)));
    for (const split of byExpense.get(expense.id) ?? []) {
      add(share, split.personId, toCents(split.shareAmount));
    }
  }

  // A payment is modelled exactly like paying a share of the bills: money
  // handed over reduces what you owe, and receiving it reduces what you are
  // owed. That keeps the ledger a single sum instead of two competing ones.
  for (const p of payments) {
    add(paid, p.fromPerson, toCents(p.amount));
    add(share, p.toPerson, toCents(p.amount));
  }

  const ids = new Set([...paid.keys(), ...share.keys()]);
  return [...ids]
    .map((personId) => {
      const p = paid.get(personId) ?? 0;
      const s = share.get(personId) ?? 0;
      return { personId, paid: toMoney(p), share: toMoney(s), net: toMoney(p - s) };
    })
    .sort((a, b) => b.net - a.net);
}

export type Settlement = { from: string; to: string; amount: number };

/**
 * The shortest set of payments that clears every balance.
 *
 * Repeatedly matches the largest debtor against the largest creditor. That
 * settles a group in at most (people - 1) payments, rather than having
 * everyone pay everyone — which is the whole point of tracking a group
 * balance instead of a pile of individual IOUs.
 */
export function settlements(list: Balance[]): Settlement[] {
  const creditors = list
    .filter((b) => toCents(b.net) > 0)
    .map((b) => ({ id: b.personId, cents: toCents(b.net) }))
    .sort((a, b) => b.cents - a.cents);
  const debtors = list
    .filter((b) => toCents(b.net) < 0)
    .map((b) => ({ id: b.personId, cents: -toCents(b.net) }))
    .sort((a, b) => b.cents - a.cents);

  const payments: Settlement[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const amount = Math.min(creditors[ci].cents, debtors[di].cents);
    if (amount > 0) {
      payments.push({ from: debtors[di].id, to: creditors[ci].id, amount: toMoney(amount) });
    }
    creditors[ci].cents -= amount;
    debtors[di].cents -= amount;
    if (creditors[ci].cents === 0) ci++;
    if (debtors[di].cents === 0) di++;
  }
  return payments;
}

/** Longest list of individual bills worth pasting into a chat before it's noise. */
const MAX_LISTED = 25;

/**
 * The whole group's position as plain text, ready to paste into a group chat.
 *
 * Deliberately plain: no column alignment, no box drawing, no tabs. Chat apps
 * render in a proportional font, so anything that relies on character widths
 * arrives as ragged nonsense. Bullets and short lines survive WhatsApp,
 * Telegram, Messages and email alike.
 */
export function settlementText(
  expenses: SharedExpenseRow[],
  splits: SharedSplitRow[],
  people: PersonRow[],
  payments: PaymentRow[] = [],
  myName?: string,
  home: string = activeCurrency()
): string {
  const name = (id: string) => personName(id, people, myName);
  const foreign = (e: SharedExpenseRow) => isForeign(e, home);
  const fmtForeign = (e: SharedExpenseRow) =>
    `${billCurrency(e, home)} ${e.amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  // Second person only while you're still "You". Once your own name is in the
  // message it has to read in the third person like everyone else's, or the
  // group chat gets "Damien — are owed $16.50".
  const second = !myName?.trim();
  const lines: string[] = [];

  const total = sumMoney(expenses.map(homeAmount));
  lines.push(`Shared expenses — ${fmtMoney(total)} across ${expenses.length} bill${expenses.length === 1 ? '' : 's'}`);

  if (expenses.length === 0) {
    lines.push('');
    lines.push('Nothing logged yet.');
    return lines.join('\n');
  }

  const dates = expenses.map((e) => e.date).sort();
  const span =
    dates[0] === dates[dates.length - 1]
      ? prettyDate(dates[0])
      : `${prettyDate(dates[0])} – ${prettyDate(dates[dates.length - 1])}`;
  lines.push(span);

  lines.push('');
  lines.push('EXPENSES');
  // Oldest first reads as a running tab, which is how people recall a trip.
  const ordered = [...expenses].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const e of ordered.slice(0, MAX_LISTED)) {
    const label = e.description.trim() || 'Expense';
    // Settled bills are flagged rather than hidden: the group still wants to
    // see what the total covers, they just no longer owe anything on them.
    const settled = isSettled(e) ? ' — settled' : '';
    // A bill paid in baht is quoted in baht — that is the figure on the
    // receipt everyone remembers — with the converted amount beside it so the
    // balances below can be checked against it.
    const shown = foreign(e)
      ? `${fmtForeign(e)} ≈ ${fmtMoney(homeAmount(e))}`
      : fmtMoney(homeAmount(e));
    lines.push(`• ${label} — ${shown} (${name(e.paidBy)} paid)${settled}`);
  }
  if (ordered.length > MAX_LISTED) {
    lines.push(`• …and ${ordered.length - MAX_LISTED} more`);
  }

  if (payments.length > 0) {
    lines.push('');
    lines.push('PAYMENTS');
    for (const p of payments.slice(0, MAX_LISTED)) {
      lines.push(`• ${name(p.fromPerson)} paid ${name(p.toPerson)} ${fmtMoney(p.amount)}`);
    }
  }

  const ledger = balances(expenses, splits, payments);
  lines.push('');
  lines.push('BALANCES');
  for (const b of ledger) {
    const net = Math.round(b.net * 100);
    // "You" takes second-person verbs; everyone else takes third. Without this
    // the line reads "You — is owed $56.66".
    const you = isMe(b.personId) && second;
    const verdict =
      net === 0
        ? you
          ? 'are square'
          : 'is square'
        : net > 0
          ? `${you ? 'are' : 'is'} owed ${fmtMoney(b.net)}`
          : `${you ? 'owe' : 'owes'} ${fmtMoney(Math.abs(b.net))}`;
    lines.push(`• ${name(b.personId)} — ${verdict}`);
  }

  const toSettle = settlements(ledger);
  lines.push('');
  lines.push('SETTLE UP');
  if (toSettle.length === 0) {
    lines.push("• Everyone's square — nothing to pay.");
  } else {
    for (const s of toSettle) {
      const verb = isMe(s.from) && second ? 'pay' : 'pays';
      lines.push(`• ${name(s.from)} ${verb} ${name(s.to)} ${fmtMoney(s.amount)}`);
    }
  }

  return lines.join('\n');
}

/** Your share of one shared expense — what it actually cost you. */
export function myShare(expenseId: string, splits: SharedSplitRow[]): number {
  const mine = splits.find((s) => s.sharedId === expenseId && s.personId === ME);
  return mine?.shareAmount ?? 0;
}

/** Everything you are owed, less everything you owe. */
export function myNet(list: Balance[]): number {
  return list.find((b) => isMe(b.personId))?.net ?? 0;
}
