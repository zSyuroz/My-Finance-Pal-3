import { Linking, Platform } from 'react-native';

import appConfig from '../app.json';

/**
 * Getting in touch, and being asked to rate the app.
 *
 * Both are one-line actions that fail badly if handled carelessly: a mailto:
 * on a device with no mail client does nothing at all, and a store link for an
 * app that isn't published lands on "item not found". Neither is allowed to
 * be a dead end here — the caller is told what happened so it can show the
 * address, or explain why there is nothing to rate yet.
 */

/** Where feedback goes. One line to change if the address ever does. */
export const FEEDBACK_EMAIL = 'chngdamien@gmail.com';

const APP_NAME = 'My Finance Pal';
/** Read from app.json so the number on screen cannot drift from the build. */
export const APP_VERSION = appConfig.expo.version;
const VERSION = APP_VERSION;
const ANDROID_PACKAGE = appConfig.expo.android.package;

/**
 * Set to true once the app is actually listed on a store.
 *
 * Sending someone to a Play Store page that does not exist is worse than
 * telling them it is not published yet, so Rate offers feedback instead until
 * this flips.
 */
export const PUBLISHED_ON_STORE = false;

/** Apple's numeric id, which only exists after the first App Store submission. */
export const APP_STORE_ID: string | null = null;

/**
 * A body worth reading: what the person wrote, plus the three facts that are
 * always the first questions back — which version, which platform, which OS.
 */
export function feedbackBody(): string {
  return [
    '',
    '',
    '---',
    `${APP_NAME} ${VERSION}`,
    // The web build reports 0.0.0, which is noise rather than a version.
    Platform.OS === 'web' ? 'web' : `${Platform.OS} ${Platform.Version}`,
    '(Written above this line, please — the details help me find the problem.)',
  ].join('\n');
}

export function feedbackUrl(): string {
  const subject = encodeURIComponent(`${APP_NAME} feedback`);
  const body = encodeURIComponent(feedbackBody());
  return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
}

/**
 * The store page for this build's platform, or null when there is nothing to
 * link to. Android gets the `market:` scheme so it opens the Play Store app
 * rather than a browser tab of it.
 */
export function storeUrl(): string | null {
  if (!PUBLISHED_ON_STORE) return null;
  if (Platform.OS === 'android') return `market://details?id=${ANDROID_PACKAGE}`;
  if (Platform.OS === 'ios' && APP_STORE_ID) {
    return `itms-apps://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
  }
  return null;
}

/** The browser equivalent, for when the store app itself will not open. */
export function storeWebUrl(): string | null {
  if (!PUBLISHED_ON_STORE) return null;
  if (Platform.OS === 'ios' && APP_STORE_ID) {
    return `https://apps.apple.com/app/id${APP_STORE_ID}`;
  }
  return `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
}

export type OpenOutcome = 'opened' | 'unavailable';

async function open(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    // No handler, or the platform refused it. `canOpenURL` is not consulted
    // first: on Android it needs the scheme declared in the manifest and
    // answers false for schemes that would in fact have opened.
    return false;
  }
}

export async function openFeedback(): Promise<OpenOutcome> {
  return (await open(feedbackUrl())) ? 'opened' : 'unavailable';
}

export async function openStoreReview(): Promise<OpenOutcome> {
  const primary = storeUrl();
  if (primary && (await open(primary))) return 'opened';
  const web = storeWebUrl();
  if (web && (await open(web))) return 'opened';
  return 'unavailable';
}
