import { round2 } from './money';
import type { NetWorthSnapshot } from './db';

/**
 * Turning a run of monthly snapshots into a direction.
 *
 * A single net-worth figure says what you are worth; it cannot say whether
 * that is better than last month, which is the only part that tells you
 * whether anything you are doing is working.
 */

export type Trend = {
  /** Change against the previous month, or null with nothing to compare to. */
  change: number | null;
  /** Months of history actually recorded, including this one. */
  points: number;
  /** Oldest-first values for a sparkline. */
  series: number[];
  /** Change across the whole recorded span. */
  sinceStart: number | null;
};

export function netWorthTrend(snapshots: NetWorthSnapshot[]): Trend {
  const ordered = [...snapshots].sort((a, b) => (a.month < b.month ? -1 : 1));
  const series = ordered.map((s) => s.net);

  return {
    // Needs two months before a comparison means anything — the first month
    // has nothing behind it, and reporting "+$49,600 this month" for a fresh
    // account would be nonsense.
    change: series.length >= 2 ? round2(series[series.length - 1] - series[series.length - 2]) : null,
    points: series.length,
    series,
    sinceStart: series.length >= 2 ? round2(series[series.length - 1] - series[0]) : null,
  };
}

/** The month key a date falls in, matching how snapshots are stored. */
export function monthKey(todayKey: string): string {
  return todayKey.slice(0, 7);
}

/** One line about the direction of travel, or null while there's no history. */
export function trendLine(trend: Trend, money: (n: number) => string): string | null {
  if (trend.change == null) return null;
  if (Math.round(trend.change * 100) === 0) return 'level with last month';
  const direction = trend.change > 0 ? 'up' : 'down';
  return `${direction} ${money(Math.abs(trend.change))} on last month`;
}
