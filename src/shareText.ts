import { Platform, Share } from 'react-native';

export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'unavailable';

/**
 * Hands a block of text to whatever the platform uses to pass text around.
 *
 * On a phone this is the OS share sheet, which is the thing that actually
 * lists WhatsApp, Telegram, Messages and the rest — `expo-sharing` is not the
 * tool here, it shares *files* and would attach a document rather than post a
 * message.
 *
 * The browser has no equivalent guarantee: `navigator.share` exists on mobile
 * browsers and almost nowhere on the desktop, and it throws rather than
 * degrading. So a failure there falls back to the clipboard, which every
 * browser has and which gets the text into the same group chat with one extra
 * paste. The caller is told which happened so it can say so.
 */
export async function shareTextBlock(text: string, title: string): Promise<ShareOutcome> {
  try {
    const result = await Share.share({ message: text, title }, { dialogTitle: title });
    // Only iOS reports dismissal; elsewhere a dismissed sheet still resolves.
    if ('action' in result && result.action === Share.dismissedAction) return 'dismissed';
    return 'shared';
  } catch {
    // Fall through to the clipboard rather than reporting a dead end.
  }

  if (Platform.OS === 'web') {
    // A phone browser has the same share sheet the native app does, reached
    // through the Web Share API — this is what puts WhatsApp and Telegram in
    // front of someone running the app from a tunnel URL rather than a build.
    // It must be called from a user gesture, which a button press is, and it
    // rejects on cancel, which is not an error worth reporting.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text });
        return 'shared';
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return 'dismissed';
        // Anything else — no permission, unsupported payload — falls through
        // to the clipboard below.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      // Clipboard access needs a secure context and, in some browsers, a
      // permission the user has refused.
      return 'unavailable';
    }
  }
  return 'unavailable';
}
