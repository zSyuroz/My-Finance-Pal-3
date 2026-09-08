import { useState, type MutableRefObject, type ReactNode } from 'react';

import ConfirmDialog from './ConfirmDialog';

/**
 * Save, then leave — and say so when the save does not happen.
 *
 * Every editor had the same three lines: write, mark the exit as ours, go
 * back. If the write threw, the promise rejected before the navigation ever
 * ran, so the button did nothing at all: no movement, no message, nothing to
 * distinguish "your data is saved" from "your database is broken". A silent
 * failure on a Save button is the worst failure a form can have, because the
 * user's next move is to close the app and lose the work for real.
 *
 * The dialog is returned as an element rather than left to each caller, so a
 * screen cannot adopt the hook and forget to render the part that speaks.
 */
export function useSaveAndClose({
  persist,
  leaving,
  goBack,
  what,
}: {
  /** Writes and returns; must throw if it did not. */
  persist: () => Promise<void>;
  /** Told before leaving, so the unsaved-changes guard stays quiet. */
  leaving: MutableRefObject<boolean>;
  goBack: () => void;
  /** Names the thing in the failure message, e.g. "your pay rhythm". */
  what: string;
}): { save: () => Promise<void>; saveFailedDialog: ReactNode } {
  const [failed, setFailed] = useState<string | null>(null);

  const save = async () => {
    try {
      await persist();
    } catch (err) {
      // Staying put is deliberate: the screen still holds what was typed, so
      // the user can try again rather than watch it disappear.
      setFailed(err instanceof Error ? err.message : 'Something went wrong.');
      return;
    }
    leaving.current = true;
    goBack();
  };

  const saveFailedDialog = (
    <ConfirmDialog
      visible={failed != null}
      title={`Couldn't save ${what}`}
      message={`${failed ?? ''}\n\nWhat you entered is still here — try again, and if it keeps failing, restart the app.`}
      confirmLabel="OK"
      onConfirm={() => setFailed(null)}
    />
  );

  return { save, saveFailedDialog };
}
