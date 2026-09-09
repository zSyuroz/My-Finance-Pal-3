import type { GoalRow } from './db';
import { cents, fromCents } from './money';

/**
 * Putting money into goals without being asked every month.
 *
 * A goal's "saved so far" was a number you typed, so it stayed at whatever it
 * was the day you set the goal up — the app knew your target and your deadline
 * and then watched you miss it in silence. This says once, in a setting, how
 * much you put aside each cycle, and the app credits it from then on.
 *
 * It is a statement of intent, not an observation: nothing here watches a bank
 * account. What it buys is a progress bar that keeps up with a standing order
 * you already have, instead of one that only moves when you remember it.
 */

export type Allocation = { goal: GoalRow; add: number };

/**
 * Splits one cycle's saving across the goals that are still short.
 *
 * Evenly, but never more into a goal than it still needs: with $300 a month
 * across a goal $50 from done and one $5,000 away, an even split would leave
 * $100 sitting past the finish line of the first while the second went short.
 * Whatever a capped goal does not take is offered round again, so the full
 * amount lands as long as anything can still hold it.
 *
 * Cent arithmetic throughout, so a three-way split of $100 is 33.34 + 33.33 +
 * 33.33 and not $99.99.
 */
export function allocateSavings(amountPerCycle: number, goals: GoalRow[]): Allocation[] {
  const pot = cents(amountPerCycle);
  if (!(pot > 0)) return [];

  // Only goals that can still take money: no target set means no finish line
  // to measure against, and a met goal is done.
  const open = goals
    .map((goal) => ({ goal, need: cents(goal.target) - cents(goal.saved) }))
    .filter((g) => cents(g.goal.target) > 0 && g.need > 0);
  if (open.length === 0) return [];

  const given = new Map<string, number>(open.map((g) => [g.goal.id, 0]));
  let left = pot;

  // Each round shares what is left among the goals still short. A round always
  // hands out at least one cent per taker, so this cannot spin.
  while (left > 0) {
    const takers = open.filter((g) => given.get(g.goal.id)! < g.need);
    if (takers.length === 0) break;

    const base = Math.trunc(left / takers.length);
    let extra = left - base * takers.length;
    let handedOut = 0;

    for (const t of takers) {
      const room = t.need - given.get(t.goal.id)!;
      const offer = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
      const take = Math.min(room, offer);
      given.set(t.goal.id, given.get(t.goal.id)! + take);
      handedOut += take;
    }

    if (handedOut === 0) break;
    left -= handedOut;
  }

  return open
    .filter((g) => given.get(g.goal.id)! > 0)
    .map((g) => ({ goal: g.goal, add: fromCents(given.get(g.goal.id)!) }));
}

/** What the goals look like once an allocation is applied. */
export function applyAllocation(allocations: Allocation[]): GoalRow[] {
  return allocations.map(({ goal, add }) => ({
    ...goal,
    saved: fromCents(cents(goal.saved) + cents(add)),
  }));
}
