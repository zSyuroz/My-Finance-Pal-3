import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useNavigation } from '@react-navigation/native';

import ConfirmDialog from './ConfirmDialog';

type Props = {
  /** True while the screen holds something the user has not saved. */
  dirty: boolean;
  /** Writes the pending changes. Awaited before the screen is allowed to go. */
  onSave: () => Promise<void> | void;
  title?: string;
  message?: string;
  saveLabel?: string;
  discardLabel?: string;
  /**
   * Set by the screen's own Save just before it navigates away.
   *
   * A ref rather than a prop because the check has to be true *now*: a screen
   * that saves and then calls goBack() in the same tick would otherwise be
   * asked whether it wants to save, having just done exactly that.
   */
  leavingRef?: MutableRefObject<boolean>;
};

/**
 * Stops a screen closing on unsaved work, and asks what to do about it.
 *
 * Editors in this app have a Save button, which means the back arrow silently
 * threw work away — you typed a salary, went back, and it was simply gone with
 * nothing to say so. Auto-saving instead is worse: it stores numbers people
 * thought better of, with no way to back out.
 *
 * So: intercept the leave, ask once, and honour the answer. The held action is
 * re-dispatched rather than assumed to be "go back", so this works the same
 * for the header arrow, a swipe, the Android button, and a tab change.
 */
export default function UnsavedChangesGuard({
  dirty,
  onSave,
  title = 'Save your changes?',
  message = "You've made changes without saving them.",
  saveLabel = 'Save and leave',
  discardLabel = 'Discard',
  leavingRef,
}: Props) {
  const navigation = useNavigation();
  const [pending, setPending] = useState<{ action: unknown } | null>(null);
  // Set once the question is answered, so the listener lets that action past
  // instead of asking about it again.
  const leaving = useRef(false);

  useEffect(
    () =>
      navigation.addListener('beforeRemove' as never, ((e: any) => {
        if (!dirty || leaving.current || leavingRef?.current) return;
        e.preventDefault();
        setPending({ action: e.data.action });
      }) as never),
    [navigation, dirty, leavingRef]
  );

  const go = (action: unknown) => {
    leaving.current = true;
    if (action) navigation.dispatch(action as never);
  };

  return (
    <ConfirmDialog
      visible={!!pending}
      title={title}
      message={message}
      confirmLabel={saveLabel}
      cancelLabel={discardLabel}
      onConfirm={async () => {
        const held = pending?.action;
        setPending(null);
        await onSave();
        go(held);
      }}
      onCancel={() => {
        const held = pending?.action;
        setPending(null);
        go(held);
      }}
    />
  );
}
