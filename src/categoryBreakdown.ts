import { cents, round2 } from './money';
import { CATEGORIES, categoryMeta, type CategoryKey } from './spending';

/**
 * Where the money in one pay cycle actually went.
 *
 * Home could only ever name the single biggest category, which answers "what
 * do I spend most on" and nothing else — not whether it is 90% of the cycle or
 * barely ahead of second place, and not whether it is worse than last cycle.
 * Those are the questions that change behaviour, so they get a screen.
 *
 * Everything is summed in cents. Floats accumulate error over a few hundred
 * transactions, and a breakdown whose parts do not add up to the total is
 * worse than no breakdown at all.
 */

export type Spend = { category: string; amount: number };

export type CategorySlice = {
  key: CategoryKey;
  label: string;
  color: string;
  total: number;
  /** 0..1 of the cycle's spending. */
  share: number;
  count: number;
  /** Average per day so far this cycle. */
  perDay: number;
  /** What this category reaches by the end of the cycle at that pace. */
  projected: number;
  /** Change against the same category last cycle; null when unknown. */
  delta: number | null;
};

export type Breakdown = {
  slices: CategorySlice[];
  total: number;
  count: number;
  /** Total across the comparison cycle, or null when there is none. */
  previousTotal: number | null;
};

function totalsByCategory(rows: Spend[]): Map<string, { cents: number; count: number }> {
  const map = new Map<string, { cents: number; count: number }>();
  for (const row of rows) {
    const key = categoryMeta(row.category).key;
    const entry = map.get(key) ?? { cents: 0, count: 0 };
    entry.cents += cents(row.amount);
    entry.count += 1;
    map.set(key, entry);
  }
  return map;
}

export function categoryBreakdown(
  rows: Spend[],
  previous: Spend[] | null,
  days: { elapsed: number; total: number }
): Breakdown {
  const totals = totalsByCategory(rows);
  // An empty comparison cycle is not a comparison: it would mark every
  // category as up by its full amount, which says nothing about spending.
  const prevTotals = previous && previous.length > 0 ? totalsByCategory(previous) : null;

  let allCents = 0;
  for (const entry of totals.values()) allCents += entry.cents;

  // Elapsed can be zero on the payday itself if a cycle is misconfigured;
  // dividing by it would report Infinity as a daily average.
  const elapsed = Math.max(1, days.elapsed);
  const span = Math.max(elapsed, days.total);

  const slices: CategorySlice[] = [];
  for (const meta of CATEGORIES) {
    const entry = totals.get(meta.key);
    if (!entry || entry.cents === 0) continue;
    const perDayCents = entry.cents / elapsed;
    const prev = prevTotals?.get(meta.key)?.cents ?? (prevTotals ? 0 : null);
    slices.push({
      key: meta.key,
      label: meta.label,
      color: meta.color,
      total: entry.cents / 100,
      share: allCents > 0 ? entry.cents / allCents : 0,
      count: entry.count,
      perDay: round2(perDayCents / 100),
      projected: round2((perDayCents * span) / 100),
      delta: prev == null ? null : round2((entry.cents - prev) / 100),
    });
  }

  // Biggest first — the whole point of the screen is what dominates.
  slices.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  let prevAllCents: number | null = null;
  if (prevTotals) {
    prevAllCents = 0;
    for (const entry of prevTotals.values()) prevAllCents += entry.cents;
  }

  return {
    slices,
    total: allCents / 100,
    count: rows.length,
    previousTotal: prevAllCents == null ? null : prevAllCents / 100,
  };
}

/**
 * One line describing the shape of the cycle.
 *
 * Says "dominates" only when one category really does — a 34% leader in a
 * five-way split is the top category but not a finding, and calling it one
 * would train the user to ignore the line.
 */
export function breakdownHeadline(
  breakdown: Breakdown,
  fmt: (n: number) => string
): string | null {
  const [first, second] = breakdown.slices;
  if (!first) return null;
  const share = Math.round(first.share * 100);
  if (!second) return `Everything this cycle went on ${first.label.toLowerCase()}.`;
  if (first.share >= 0.5) {
    return `${first.label} is ${share}% of this cycle — ${fmt(first.total)} of ${fmt(breakdown.total)}.`;
  }
  const lead = first.total - second.total;
  if (lead < breakdown.total * 0.05) {
    return `${first.label} and ${second.label.toLowerCase()} are running neck and neck this cycle.`;
  }
  return `${first.label} leads at ${share}%, ${fmt(lead)} ahead of ${second.label.toLowerCase()}.`;
}
