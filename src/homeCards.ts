/**
 * Which card the Home ring opens on, and the order of the rest.
 *
 * The pager was written assuming everyone cares most about today's spending,
 * which is only true of some people: anyone paying down a card or building a
 * cushion opens the app for the other number and would have to swipe for it
 * every single time. It is the first thing seen on launch, so it is worth
 * getting right for each person — hence both a considered default and a
 * preference that overrides it.
 */

export type HomeCardKey =
  | 'networth'
  | 'safe'
  | 'spending'
  | 'bills'
  | 'debt'
  | 'split';

export type HomeCard = {
  key: HomeCardKey;
  label: string;
  /** What the card actually shows, for the reorder screen. */
  hint: string;
};

/**
 * Ordered as they ship: where you stand, then what that leaves you, then the
 * detail. Net worth opens the app because it is the one figure that answers
 * "am I getting anywhere" — today's spending is a detail of this month, and
 * leading with it made the app feel like a receipt rather than a position.
 *
 * Anyone who cares most about a different number moves it to the front, and
 * whatever they put first is what Home opens on from then on.
 */
export const HOME_CARDS: HomeCard[] = [
  { key: 'networth', label: 'Net worth', hint: 'What you own minus what you owe, and your cash runway' },
  { key: 'safe', label: 'Safe to spend', hint: 'What is left this cycle once bills are set aside' },
  { key: 'spending', label: 'Spending', hint: "What you have spent today, and how the cycle is going" },
  { key: 'bills', label: 'Bills ahead', hint: 'Recurring bills due before your next payday' },
  { key: 'debt', label: 'Debt', hint: 'What you owe, what it costs, and how much you have cleared' },
  { key: 'split', label: 'Split balance', hint: "What you are owed or owe across shared bills" },
];

export const DEFAULT_HOME_CARD_ORDER: HomeCardKey[] = HOME_CARDS.map((c) => c.key);

const isKey = (value: string): value is HomeCardKey =>
  HOME_CARDS.some((c) => c.key === value);

/**
 * Parses a stored order, forgivingly.
 *
 * Unknown keys are dropped and missing ones appended in their default
 * position, so an order saved by a different version of the app can never
 * make a card vanish from Home or crash the pager — the worst case is a card
 * appearing at the end rather than where it once was.
 */
export function parseHomeCardOrder(raw: string | null): HomeCardKey[] {
  const saved = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(isKey);
  const seen = new Set<HomeCardKey>();
  const order: HomeCardKey[] = [];
  for (const key of saved) {
    if (seen.has(key)) continue;
    seen.add(key);
    order.push(key);
  }
  for (const card of HOME_CARDS) {
    if (!seen.has(card.key)) order.push(card.key);
  }
  return order;
}

export function serializeHomeCardOrder(order: HomeCardKey[]): string {
  return order.join(',');
}

/** Moves one card by `delta` places, clamped at the ends. */
export function moveHomeCard(
  order: HomeCardKey[],
  key: HomeCardKey,
  delta: number
): HomeCardKey[] {
  const from = order.indexOf(key);
  if (from < 0) return order;
  const to = from + delta;
  if (to < 0 || to >= order.length) return order;
  const next = [...order];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
