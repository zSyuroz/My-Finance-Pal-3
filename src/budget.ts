import type { BudgetRow, ExpenseRow } from './db';
import { CATEGORIES, categoryMeta } from './spending';
import { cents, round2 } from './money';

/**
 * Turning a set of limits and a cycle's spending into something actionable.
 *
 * The point of a budget is not to say what you spent — the app already showed
 * that — but whether you are on course. That needs pace: two weeks into a
 * month, £300 of a £500 limit is fine on the 28th and alarming on the 3rd.
 * Everything here exists to make that distinction.
 *
 * Budgets run over the pay cycle rather than the calendar month, because the
 * money arrives on payday and that is the span a person actually manages.
 */

export type CategoryStatus = {
  key: string;
  label: string;
  color: string;
  limit: number;
  spent: number;
  /** Negative once the limit is passed. */
  remaining: number;
  /** 0–1 while inside the limit, above 1 once past it. */
  ratio: number;
  over: boolean;
};

export type BudgetSummary = {
  /** True when at least one category has a limit set. */
  active: boolean;
  totalLimit: number;
  totalSpent: number;
  ratio: number;
  categories: CategoryStatus[];
  /** Categories with spending but no limit — money the budget doesn't see. */
  unbudgetedSpend: number;
  /**
   * Where spending should be by now if it were spread evenly across the
   * cycle, and how far off that it actually is. Null before the cycle has
   * started or when no limits are set.
   */
  pace: { expected: number; diff: number; behind: boolean } | null;
  /** Spending at the current rate, projected to the end of the cycle. */
  projected: number | null;
};

export function budgetSummary(
  budgets: BudgetRow[],
  cycleExpenses: ExpenseRow[],
  cycleDaysElapsed: number,
  cycleDaysTotal: number
): BudgetSummary {
  const limits = new Map(budgets.map((b) => [b.category, b.amount]));

  const spentBy = new Map<string, number>();
  for (const e of cycleExpenses) {
    spentBy.set(e.category, (spentBy.get(e.category) ?? 0) + cents(e.amount));
  }

  const categories: CategoryStatus[] = CATEGORIES.filter((c) => limits.has(c.key)).map((c) => {
    const limit = limits.get(c.key) ?? 0;
    const spent = (spentBy.get(c.key) ?? 0) / 100;
    const remaining = round2(limit - spent);
    return {
      key: c.key,
      label: c.label,
      color: c.color,
      limit,
      spent,
      remaining,
      ratio: limit > 0 ? spent / limit : 0,
      over: cents(spent) > cents(limit),
    };
  });

  const totalLimit = round2(categories.reduce((s, c) => s + c.limit, 0));
  const totalSpent = round2(categories.reduce((s, c) => s + c.spent, 0));

  // Spending in categories with no limit is deliberately excluded from the
  // ratio — counting it would make the bar move for money the user never
  // agreed to budget — but it is reported so it can't hide.
  const unbudgetedSpend = round2(
    [...spentBy.entries()]
      .filter(([key]) => !limits.has(key))
      .reduce((s, [, v]) => s + v / 100, 0)
  );

  const active = categories.length > 0 && totalLimit > 0;

  let pace: BudgetSummary['pace'] = null;
  let projected: number | null = null;
  if (active && cycleDaysTotal > 0 && cycleDaysElapsed > 0) {
    const through = Math.min(1, cycleDaysElapsed / cycleDaysTotal);
    const expected = round2(totalLimit * through);
    pace = {
      expected,
      diff: round2(totalSpent - expected),
      behind: cents(totalSpent) > cents(expected),
    };
    projected = round2((totalSpent / cycleDaysElapsed) * cycleDaysTotal);
  }

  return {
    active,
    totalLimit,
    totalSpent,
    ratio: totalLimit > 0 ? totalSpent / totalLimit : 0,
    categories,
    unbudgetedSpend,
    pace,
    projected,
  };
}

/**
 * The single most useful sentence the app can say about a budget.
 *
 * Prefers the specific over the general: a category already past its limit is
 * more actionable than an overall pace figure, and being on course is worth
 * saying plainly rather than leaving the user to infer it from a bar.
 */
export function budgetHeadline(
  summary: BudgetSummary,
  money: (n: number) => string
): string | null {
  if (!summary.active) return null;

  const worst = [...summary.categories].sort((a, b) => b.ratio - a.ratio)[0];
  if (worst?.over) {
    return `${worst.label} is ${money(Math.abs(worst.remaining))} over its limit.`;
  }
  if (summary.pace?.behind) {
    return `${money(summary.pace.diff)} ahead of pace — on track to finish at ${money(
      summary.projected ?? 0
    )}.`;
  }
  if (worst && worst.ratio >= 0.8) {
    return `${worst.label} has ${money(worst.remaining)} left of ${money(worst.limit)}.`;
  }
  if (summary.pace) {
    return `${money(Math.abs(summary.pace.diff))} under pace so far.`;
  }
  return null;
}

export { categoryMeta };
