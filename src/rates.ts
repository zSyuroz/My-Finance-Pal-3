import { KEYS, getSetting, setSetting } from './db';

/**
 * Exchange rates, for bills paid in a currency that isn't yours.
 *
 * A trip abroad is exactly when shared expenses matter most, and it is exactly
 * when a single-currency tracker falls apart: dinner in Bangkok, taxis in
 * baht, one person paying in ringgit at the border. Without conversion the
 * balances are a pile of incompatible numbers.
 *
 * Two rules shape everything here:
 *
 *  - **The rate is frozen when the bill is entered.** Rates move daily; a
 *    settlement that silently changes because the baht moved is a settlement
 *    nobody can check against what they agreed. Splitwise freezes it, banks
 *    freeze it, and so does this.
 *  - **The network is optional.** Rates are cached and the last good table is
 *    used when offline; if there has never been one, the rate is typed in by
 *    hand. Nothing here is allowed to block logging a bill.
 */

export type RateTable = {
  /** The currency every rate is quoted against. */
  base: string;
  /** When these rates were retrieved, epoch ms. */
  fetchedAt: number;
  /** code → units of that currency per 1 unit of `base`. */
  rates: Record<string, number>;
};

/** Rates older than this are refreshed when the network allows. */
const FRESH_FOR_MS = 12 * 60 * 60 * 1000;

const ENDPOINT = 'https://open.er-api.com/v6/latest/USD';

/**
 * Converts one currency to another through the table's base.
 *
 * Rates arrive quoted against a single base, so a THB → SGD rate is the ratio
 * of the two. Null rather than 1 when either currency is missing: quietly
 * treating an unknown currency as parity would put a wrong number into a
 * settlement, which is worse than asking for the rate.
 */
export function rateBetween(table: RateTable | null, from: string, to: string): number | null {
  if (from === to) return 1;
  if (!table) return null;
  const f = table.rates[from];
  const t = table.rates[to];
  if (!f || !t || !Number.isFinite(f) || !Number.isFinite(t)) return null;
  return t / f;
}

/** Applies a frozen rate, rounded to whole cents like every other amount. */
export function convert(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}

/**
 * How a rate reads on screen: "1 THB = 0.038 SGD".
 *
 * Small rates need more decimals than large ones — "1 IDR = 0.00 SGD" is
 * useless — so the precision follows the magnitude rather than being fixed.
 */
export function rateLine(from: string, to: string, rate: number): string {
  const digits = rate >= 100 ? 2 : rate >= 1 ? 4 : rate >= 0.01 ? 4 : 6;
  return `1 ${from} = ${rate.toFixed(digits)} ${to}`;
}

export function isFresh(table: RateTable | null, now = Date.now()): boolean {
  return !!table && now - table.fetchedAt < FRESH_FOR_MS;
}

/**
 * Reads a rates payload, rejecting anything that is not usable.
 *
 * Kept separate from the fetch so it can be tested without a network, and so
 * a provider returning an error body with a 200 status — which this one does
 * on a bad request — is treated as a failure rather than an empty table.
 */
export function parseRatesResponse(body: unknown): RateTable | null {
  if (!body || typeof body !== 'object') return null;
  const data = body as Record<string, unknown>;
  if (data.result != null && data.result !== 'success') return null;
  const base = typeof data.base_code === 'string' ? data.base_code : null;
  const rates = data.rates;
  if (!base || !rates || typeof rates !== 'object') return null;

  const clean: Record<string, number> = {};
  for (const [code, value] of Object.entries(rates as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) clean[code] = value;
  }
  if (Object.keys(clean).length === 0) return null;
  return { base, fetchedAt: Date.now(), rates: clean };
}

async function readCache(): Promise<RateTable | null> {
  const raw = await getSetting(KEYS.fxRates);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RateTable;
    if (!parsed?.rates || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The best rates available, refreshing in the background when stale.
 *
 * Returns the cache immediately when it is fresh. When it is stale the fetch
 * is awaited but a failure falls back to the stale table: yesterday's rate is
 * a far better answer than no rate, and the difference on a dinner bill is
 * cents.
 */
export async function loadRates(): Promise<RateTable | null> {
  const cached = await readCache();
  if (isFresh(cached)) return cached;

  try {
    const response = await fetch(ENDPOINT);
    const table = parseRatesResponse(await response.json());
    if (table) {
      await setSetting(KEYS.fxRates, JSON.stringify(table));
      return table;
    }
  } catch {
    // Offline, blocked, or the provider is down — the cache still stands.
  }
  return cached;
}

/**
 * The same rate read the other way round.
 *
 * "1 MYR = 0.29 SGD" and "1 SGD = 3.44 MYR" are the same fact, but only one of
 * them is the one a given person carries in their head — and it is usually the
 * direction where the number is bigger than one. Making people do the division
 * themselves is how wrong rates get typed in.
 *
 * Six significant figures rather than six decimal places: 0.000062 and 62.7313
 * are both rates, and a fixed decimal count mangles one of them.
 */
export function invertRate(rate: number): number | null {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Number((1 / rate).toPrecision(6));
}
