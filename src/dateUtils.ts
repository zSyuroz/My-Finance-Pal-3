export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ------------------------------------------------------------------ *
 * TEMPORARY: TIME TRAVEL — set both offsets to 0 to undo.
 *
 * Shifts the app's idea of "now" so you can see what it does on a future
 * date: which bills post, where the pay cycle sits, what falls overdue.
 * Months for jumping cycles, days for the finer cases — a bill due on the
 * 10th and a payday on the 9th are a day apart, and whole months can never
 * land between them.
 *
 * It only moves what the app *reads* as today — the data already in the
 * database is untouched, but anything the app writes while shifted (a
 * posted recurring bill, a net-worth snapshot) is written at the shifted
 * date and stays there when you set this back.
 * ------------------------------------------------------------------ */
export const DEV_MONTH_OFFSET: number = 0;
export const DEV_DAY_OFFSET: number = 0;

/** The app's "now", shifted while either offset is not zero. */
export function now(): Date {
  const d = new Date();
  // Months first: adding days afterwards means a shift onto the 31st of a
  // short month lands where the calendar actually puts it, rather than being
  // clamped and then nudged.
  if (DEV_MONTH_OFFSET !== 0) d.setMonth(d.getMonth() + DEV_MONTH_OFFSET);
  if (DEV_DAY_OFFSET !== 0) d.setDate(d.getDate() + DEV_DAY_OFFSET);
  return d;
}

export function todayKey(): string {
  return toKey(now());
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function prettyDate(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtTime(hhmm: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function dateToHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function hhmmToDate(hhmm: string | null): Date {
  const d = new Date();
  if (hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

export function shiftDays(key: string, delta: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + delta);
  return toKey(d);
}

export function startOfMonthKey(key: string): string {
  const d = fromKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function shortDate(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
