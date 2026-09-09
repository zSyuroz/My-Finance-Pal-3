// The pay cycle: where "now" sits between the previous payday and the next one.

import { now } from './dateUtils';

function clampDay(year: number, month0: number, day: number): Date {
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  return new Date(year, month0, Math.min(day, lastDay));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export type PayCycle = {
  prev: Date; // start of the current cycle
  next: Date; // the upcoming payday
  daysUntil: number; // whole days from today to next payday (0 = today)
  fraction: number; // 0..1 progress through the current cycle
};

export function payCycle(day: number, at: Date = now()): PayCycle {
  const today = startOfDay(at);
  const y = today.getFullYear();
  const m = today.getMonth();

  const thisMonth = clampDay(y, m, day);

  let prev: Date;
  let next: Date;
  if (today.getTime() < thisMonth.getTime()) {
    prev = clampDay(y, m - 1, day);
    next = thisMonth;
  } else {
    prev = thisMonth;
    next = clampDay(y, m + 1, day);
  }

  const dayMs = 86_400_000;
  const daysUntil = Math.round((next.getTime() - today.getTime()) / dayMs);
  const span = next.getTime() - prev.getTime();
  const fraction = span > 0 ? (today.getTime() - prev.getTime()) / span : 0;

  return { prev, next, daysUntil, fraction: Math.max(0, Math.min(1, fraction)) };
}

export function paydayLabel(daysUntil: number): string {
  if (daysUntil <= 0) return 'Payday today';
  if (daysUntil === 1) return '1 day to payday';
  return `${daysUntil} days to payday`;
}

// The payday date within a specific month, clamped to the last day.
export function paydayKeyFor(year: number, month1: number, day: number): string {
  const lastDay = new Date(year, month1, 0).getDate();
  const d = Math.min(day, lastDay);
  return `${year}-${String(month1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * The window a budget is measured over: where it starts, and how far through
 * it we are.
 *
 * Falls back to the calendar month when no payday is set, so budgeting works
 * before someone has any income set up. `elapsed` counts the current day
 * as one, so day one of a cycle divides by 1 rather than 0.
 */
export function cycleWindow(
  paydayDay: number | null,
  todayKeyStr: string
): { start: string; elapsed: number; total: number } {
  const [y, m, d] = todayKeyStr.split('-').map(Number);
  const today = new Date(y, m - 1, d);
  const dayMs = 86_400_000;
  const key = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;

  if (paydayDay == null) {
    const start = new Date(y, m - 1, 1);
    const total = new Date(y, m, 0).getDate();
    return { start: key(start), elapsed: d, total };
  }

  const { prev, next } = payCycle(paydayDay, today);
  return {
    start: key(prev),
    elapsed: Math.round((today.getTime() - prev.getTime()) / dayMs) + 1,
    total: Math.max(1, Math.round((next.getTime() - prev.getTime()) / dayMs)),
  };
}

/**
 * The start and end of a cycle, counting `back` cycles from the current one.
 *
 * Stepping through history by month number would drift for anyone paid on the
 * 31st — February has no 31st, so the same clamping the rest of this file does
 * has to apply to every step back, not just the current cycle. The end is the
 * day before the following cycle begins, capped at today so a half-finished
 * cycle never reports a window that runs into the future.
 */
export function cycleRange(
  paydayDay: number | null,
  todayKeyStr: string,
  back: number
): { start: string; end: string; days: number; elapsed: number; current: boolean } {
  const [y, m, d] = todayKeyStr.split('-').map(Number);
  const today = new Date(y, m - 1, d);
  const dayMs = 86_400_000;
  const key = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  const dayBefore = (date: Date) => new Date(date.getTime() - dayMs);

  let start: Date;
  let nextStart: Date;
  if (paydayDay == null) {
    start = new Date(y, m - 1 - back, 1);
    nextStart = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  } else {
    const { prev } = payCycle(paydayDay, today);
    start = clampDay(prev.getFullYear(), prev.getMonth() - back, paydayDay);
    nextStart = clampDay(start.getFullYear(), start.getMonth() + 1, paydayDay);
  }

  const last = dayBefore(nextStart);
  const end = last.getTime() > today.getTime() ? today : last;
  const days = Math.max(1, Math.round((nextStart.getTime() - start.getTime()) / dayMs));

  return {
    start: key(start),
    end: key(end),
    days,
    elapsed: Math.round((end.getTime() - start.getTime()) / dayMs) + 1,
    current: back === 0,
  };
}
