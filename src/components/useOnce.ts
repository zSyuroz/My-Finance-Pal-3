import { useCallback, useRef } from 'react';

/**
 * Wraps an async action so a second press cannot start a second run.
 *
 * Every editor in the app saves by minting a fresh id and writing a new row.
 * The button stays live across the await, so two taps — or one tap the app was
 * slow to acknowledge — wrote the record twice. That is how a single salary
 * became two identical rules, and the app began planning around double the
 * income while showing only one payment arriving.
 *
 * A ref rather than state, because the guard has to be true on the very next
 * press rather than after a re-render, which is precisely the window the two
 * presses fall into.
 */
export function useOnce<A extends unknown[]>(
  action: (...args: A) => Promise<void>
): (...args: A) => Promise<void> {
  const running = useRef(false);

  return useCallback(
    async (...args: A) => {
      if (running.current) return;
      running.current = true;
      try {
        await action(...args);
      } finally {
        // Released even when the action threw or navigated away: a screen that
        // stays put after a failed save must still accept the retry.
        running.current = false;
      }
    },
    [action]
  );
}
