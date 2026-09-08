import { getNotificationsEnabled, listEvents, type EventRow } from './db';
import {
  cancelAllNotifications,
  cancelReminder,
  schedulePaydayReminder,
  scheduleReminderAt,
} from './notifications';
import { fmtTime, prettyDate } from './dateUtils';

/**
 * The hour an all-day event's reminder is measured from.
 *
 * An all-day event has no time, so "on the day" has to mean *something* —
 * measuring from midnight would fire every such reminder at 00:00, and "1 day
 * before" at midnight the previous night. Google Calendar anchors these to a
 * morning hour for the same reason; 9am is that anchor here.
 */
const ALL_DAY_HOUR = 9;

export type ReminderOption = { minutes: number | null; label: string };

const TIMED_OPTIONS: ReminderOption[] = [
  { minutes: null, label: 'None' },
  { minutes: 0, label: 'At time of event' },
  { minutes: 5, label: '5 minutes before' },
  { minutes: 10, label: '10 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 1440, label: '1 day before' },
  { minutes: 2880, label: '2 days before' },
  { minutes: 10080, label: '1 week before' },
];

/**
 * All-day events get day-scale choices only: "10 minutes before" an event with
 * no time is meaningless, and offering it invites reminders at 8:50am that the
 * user never meant to ask for.
 */
const ALL_DAY_OPTIONS: ReminderOption[] = [
  { minutes: null, label: 'None' },
  { minutes: 0, label: 'On the day (9am)' },
  { minutes: 1440, label: '1 day before (9am)' },
  { minutes: 2880, label: '2 days before (9am)' },
  { minutes: 10080, label: '1 week before (9am)' },
];

export function reminderOptions(allDay: boolean): ReminderOption[] {
  return allDay ? ALL_DAY_OPTIONS : TIMED_OPTIONS;
}

/**
 * Coerces an offset onto the list actually offered for this kind of event.
 *
 * Flipping an event to all-day can strand an offset with no day-scale
 * equivalent — "30 minutes before" an event with no time. Snapping at the
 * moment of the switch keeps what's stored, what's displayed and what
 * actually fires in agreement; leaving it would show one thing and ring at
 * another.
 */
export function snapReminder(minutes: number | null, allDay: boolean): number | null {
  if (minutes == null) return null;
  const choices = reminderOptions(allDay).filter((o) => o.minutes != null);
  if (choices.some((o) => o.minutes === minutes)) return minutes;
  return choices.reduce((best, o) =>
    Math.abs(o.minutes! - minutes) < Math.abs(best.minutes! - minutes) ? o : best
  ).minutes;
}

/** The label to show on the editor row for a stored offset. */
export function reminderLabel(minutes: number | null, allDay: boolean): string {
  if (minutes == null) return 'None';
  const snapped = snapReminder(minutes, allDay);
  return reminderOptions(allDay).find((o) => o.minutes === snapped)?.label ?? 'None';
}

/** When an event's reminder should fire, or null when it has none. */
export function reminderDate(event: EventRow): Date | null {
  if (event.reminderMinutes == null) return null;
  const [y, m, d] = event.date.split('-').map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = event.allDay
    ? [ALL_DAY_HOUR, 0]
    : (event.startTime ?? '09:00').split(':').map(Number);
  const at = new Date(y, m - 1, d, hh, mm, 0, 0);
  at.setMinutes(at.getMinutes() - event.reminderMinutes);
  return at;
}

function reminderText(event: EventRow): { title: string; body: string } {
  const title = event.title.trim() || 'Untitled event';
  const when = event.allDay
    ? `All day · ${prettyDate(event.date)}`
    : `${fmtTime(event.startTime ?? '')} · ${prettyDate(event.date)}`;
  return { title, body: when };
}

/**
 * Brings one event's reminder in line with what it's set to — scheduling,
 * replacing, or removing it. Returns whether a reminder is now pending, which
 * is false both when none was wanted and when the chosen time has already
 * passed; the editor uses that to tell the user which of the two happened.
 */
export async function syncEventReminder(event: EventRow): Promise<boolean> {
  await cancelReminder(event.id);
  const when = reminderDate(event);
  if (!when) return false;
  // The Notifications switch in Settings is the master control. Without this
  // check a reminder set while notifications are off would still be scheduled
  // with the OS — and would then be silently cancelled by the next full
  // resync, so it fired for a while and then stopped for no visible reason.
  if (!(await getNotificationsEnabled())) return false;
  const { title, body } = reminderText(event);
  return scheduleReminderAt(event.id, when, title, body);
}

export async function cancelEventReminder(id: string): Promise<void> {
  await cancelReminder(id);
}

/**
 * Re-syncs every standing reminder with what's currently enabled and stored.
 *
 * This clears the whole schedule first, so it has to put the event reminders
 * back as well as the payday one — otherwise toggling notifications off and on
 * again, or changing payday, would silently drop every event reminder the user
 * had set.
 */
export async function syncScheduledNotifications(
  enabled: boolean,
  paydayDay: number | null
): Promise<void> {
  await cancelAllNotifications();
  if (!enabled) return;
  if (paydayDay != null) await schedulePaydayReminder(paydayDay);

  const events = await listEvents();
  for (const event of events) {
    const when = reminderDate(event);
    if (!when || when.getTime() <= Date.now()) continue;
    const { title, body } = reminderText(event);
    await scheduleReminderAt(event.id, when, title, body);
  }
}
