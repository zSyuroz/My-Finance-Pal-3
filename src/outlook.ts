import { cents, fromCents, round2 } from './money';

/**
 * Where this cycle is heading, and what is driving it.
 *
 * The trend tile used to report the past — today against yesterday, then this
 * cycle against last — and a fact about the past is not something you can act
 * on. What people open a finance app to ask is whether they are going to make
 * it to payday, and if not, what is doing it. Both are answerable from figures
 * the app already holds, so the tile now answers them instead.
 */

export type Spend = { category: string; amount: number };

export type Outlook = {
  /** Why there is no forecast, when there isn't one. */
  verdict: 'on-track' | 'over' | 'no-income' | 'too-early';
  /** Everything expected to leave before payday. */
  projected: number;
  /** Income less everything projected. Negative means short. */
  leftAtPayday: number;
  /** What is driving the spending, when one category clearly is. */
  driver: { category: string; amount: number } | null;
  /** True when the driver is named against a real history rather than a guess. */
  driverIsUnusual: boolean;
};

/**
 * How much of a cycle must pass before its own rate can be projected without a
 * history to steady it: a fifth of it, and never less than a day. Proportional
 * rather than a fixed number of days, so a weekly cycle is not held silent for
 * most of its length by a threshold chosen for a monthly one.
 */
const minDaysToProject = (total: number) => Math.max(1, Math.ceil(total * 0.2));

function blank(verdict: Outlook['verdict']): Outlook {
  return { verdict, projected: 0, leftAtPayday: 0, driver: null, driverIsUnusual: false };
}

function byCategory(rows: Spend[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.category, (map.get(r.category) ?? 0) + cents(r.amount));
  return map;
}

/** The middle value, which a single unusual month cannot drag around. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function cycleOutlook(input: {
  /** What the cycle has to spend. Null until a salary is recorded. */
  income: number | null;
  /** Day-to-day spending so far, with bills excluded. */
  discretionary: Spend[];
  /** Bills already posted this cycle. */
  postedBills: number;
  /** Bills still to leave before payday. */
  billsToCome: number;
  /** What is going into goals when the cycle ends. */
  saving: number;
  elapsed: number;
  total: number;
  /**
   * Day-to-day spending from previous complete cycles, newest first. Three is
   * enough to be a habit and few enough to still reflect how you live now.
   */
  priorCycles?: Spend[][];
}): Outlook {
  const { income, discretionary, postedBills, billsToCome, saving, elapsed, total } = input;
  if (income == null || !(income > 0)) return blank('no-income');
  if (elapsed <= 0 || total <= 0) return blank('too-early');

  const spentCents = discretionary.reduce((t, r) => t + cents(r.amount), 0);
  const prior = (input.priorCycles ?? []).slice(0, 3).map(byCategory);
  const priorTotals = prior.map((p) => [...p.values()].reduce((t, v) => t + v, 0));
  const typicalCycle = priorTotals.length > 0 ? median(priorTotals) : null;

  /*
   * A raw run rate is unusable early on. Two days into a month it multiplies
   * every purchase by fifteen, so one big shop reads as a catastrophe and the
   * figure lurches by hundreds; and with nothing spent at all it still drifts
   * upward daily, because the same total divided by more days is a smaller
   * rate. Neither movement means anything about your spending.
   *
   * So the rate is blended with what a cycle usually costs you, weighted by
   * how much of this one has actually happened. On day one it is almost
   * entirely your normal; by the last day it is entirely this cycle. It
   * converges on the truth instead of guessing at it loudly.
   */
  const observedRate = spentCents / elapsed;
  let rate: number;
  if (typicalCycle != null) {
    const weight = Math.min(1, elapsed / total);
    rate = weight * observedRate + (1 - weight) * (typicalCycle / total);
  } else {
    // Nothing to steady it with: say so rather than print a number that will
    // be wrong by hundreds tomorrow. Spending nothing yet is the exception —
    // there is no rate to get wrong, and the bills are known exactly.
    if (spentCents > 0 && elapsed < minDaysToProject(total)) return blank('too-early');
    rate = observedRate;
  }

  // Bills are added whole rather than extrapolated: rent landing on day one
  // would otherwise be spread across the month and predict a catastrophe every
  // cycle. They are known exactly, not estimated.
  const projectedCents =
    Math.round(rate * total) + cents(postedBills) + cents(billsToCome) + cents(Math.max(0, saving));
  const leftCents = cents(income) - projectedCents;

  // Which category is driving it. Against a history where there is one, the
  // answer is what is most above its usual; without, it is simply the largest,
  // and the caller is told which of the two it got.
  const thisCycle = byCategory(discretionary);
  let driver: { category: string; amount: number } | null = null;
  let driverIsUnusual = false;

  if (prior.length > 0) {
    let worst: { category: string; excess: number } | null = null;
    for (const [category, amount] of thisCycle) {
      const usual = median(prior.map((p) => p.get(category) ?? 0));
      const excess = amount - usual;
      if (excess > 0 && (!worst || excess > worst.excess)) worst = { category, excess };
    }
    if (worst) {
      driver = { category: worst.category, amount: fromCents(worst.excess) };
      driverIsUnusual = true;
    }
  }

  if (!driver) {
    let biggest: { category: string; amount: number } | null = null;
    for (const [category, amount] of thisCycle) {
      if (!biggest || amount > biggest.amount) biggest = { category, amount };
    }
    if (biggest) driver = { category: biggest.category, amount: fromCents(biggest.amount) };
  }

  return {
    verdict: leftCents < 0 ? 'over' : 'on-track',
    projected: fromCents(projectedCents),
    leftAtPayday: round2(fromCents(leftCents)),
    driver,
    driverIsUnusual,
  };
}
