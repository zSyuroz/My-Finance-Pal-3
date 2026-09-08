import { Platform } from 'react-native';
import { currencyPrefix } from './currency';
import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'default';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'General',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Asks for permission if needed. Returns whether notifications can be sent. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.status === 'granted';
}

export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** A repeating reminder on the given day of the month, 9am local time. */
export async function schedulePaydayReminder(day: number): Promise<void> {
  if (Platform.OS === 'web') return;
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '💰 Payday today',
      body: "It's your payday — open the app to see how it lines up with your spending.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
      day,
      hour: 9,
      minute: 0,
      channelId: CHANNEL_ID,
    },
  });
}

/** Fires right away — used when a recurring expense auto-posts. */
export async function notifyRecurringPosted(label: string, amount: number): Promise<void> {
  if (Platform.OS === 'web') return;
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `↻ ${label || 'Recurring expense'} posted`,
      body: `${currencyPrefix()}${amount.toFixed(2)} was deducted automatically.`,
    },
    trigger: null,
  });
}

/**
 * A one-shot reminder at a fixed moment.
 *
 * `id` doubles as the notification's own identifier, so callers can pass an
 * event's id and later cancel or replace that reminder without storing a
 * separate handle. Scheduling against an id that is already scheduled replaces
 * it, which is exactly what re-saving an edited event should do.
 *
 * Returns false when the moment has already passed or notifications aren't
 * available, so callers can say so rather than assume it worked.
 */
export async function scheduleReminderAt(
  id: string,
  when: Date,
  title: string,
  body: string
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (when.getTime() <= Date.now()) return false;
  const granted = await requestNotificationPermission();
  if (!granted) return false;
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: CHANNEL_ID,
    },
  });
  return true;
}

/** Idempotent — cancelling something that isn't scheduled is not an error. */
export async function cancelReminder(id: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Nothing scheduled under that id.
  }
}


