/**
 * Money arithmetic, in one place.
 *
 * Every figure in this app is a number of cents that happens to be stored as a
 * decimal. Adding those decimals directly drifts — seven shares of a 10c bill
 * come to 0.09999999999999998 — so every total in the app is summed in whole
 * cents and divided back once at the end.
 *
 * These two lines were previously copied into eight modules. They were
 * identical in all of them, which is exactly why they belong here: if the
 * rounding rule ever has to change, it has to change once.
 */

/** A money value as whole cents, rounded half away from zero. */
export const cents = (n: number) => Math.round(n * 100);

/** Whole cents back to a money value. */
export const fromCents = (c: number) => c / 100;

/** Rounds a money value to whole cents, staying a decimal. */
export const round2 = (n: number) => Math.round(n * 100) / 100;
