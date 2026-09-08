import { round2 } from './money';
import type { GoalRow } from './db';

/**
 * A target, a date, and what it takes each month to get there.
 *
 * A savings goal without a deadline is a wish — it never demands anything of
 * this month in particular. Attaching a date lets the app answer the only
 * question that changes behaviour: how much do I need to put aside, starting
 * now?
 */

const DAY = 86_400_000;

export type GoalStatus = {
  remaining: number;
  ratio: number;
  done: boolean;
  /** Whole months left, rounded up; null when there's no deadline. */
  monthsLeft: number | null;
  /** What to set aside monthly to arrive on time; null without a deadline. */
  perMonth: number | null;
  overdue: boolean;
  summary: (money: (n: number) => string) => string;
};

function monthsBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const days = (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY;
  // Rounded up so a target three weeks away asks for the whole amount now
  // rather than pretending there is most of a month to spread it over.
  return Math.ceil(days / 30.44);
}

export function goalStatus(goal: GoalRow, todayKey: string): GoalStatus {
  const remaining = round2(Math.max(0, goal.target - goal.saved));
  const ratio = goal.target > 0 ? goal.saved / goal.target : 0;
  const done = remaining <= 0 && goal.target > 0;

  let monthsLeft: number | null = null;
  let perMonth: number | null = null;
  let overdue = false;

  if (goal.dueDate) {
    const months = monthsBetween(todayKey, goal.dueDate);
    overdue = months <= 0 && !done;
    monthsLeft = Math.max(0, months);
    // With the deadline gone or this month, the whole remainder is due now.
    perMonth = done ? 0 : round2(remaining / Math.max(1, months));
  }

  const summary = (money: (n: number) => string) => {
    if (done) return 'Reached — nice.';
    if (goal.target <= 0) return 'Set a target amount.';
    if (overdue) return `${money(remaining)} short, and the date has passed.`;
    if (perMonth != null && monthsLeft != null) {
      return `${money(remaining)} to go · ${money(perMonth)} a month for ${monthsLeft} month${
        monthsLeft === 1 ? '' : 's'
      }`;
    }
    return `${money(remaining)} to go · no deadline set`;
  };

  return { remaining, ratio, done, monthsLeft, perMonth, overdue, summary };
}

