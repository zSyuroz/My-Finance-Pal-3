import { cents, round2 } from '../money';
import { parseAmount } from '../statement/fields';

/**
 * Turning the text off a photographed receipt into line items and totals.
 *
 * OCR gives back a flat list of lines with no structure: item names, prices,
 * tax lines, payment lines and shop furniture all look the same. The job here
 * is deciding which lines are things you bought, which are charges on top, and
 * which are noise — then checking the result adds up, because a receipt that
 * doesn't reconcile must not be presented as if it does.
 *
 * Written against Singapore and Malaysian receipts in particular: 10% service
 * charge, GST/SST, and the rounding adjustment Malaysian receipts carry since
 * 1- and 5-sen coins were withdrawn.
 */

export type ReceiptItem = {
  id: string;
  name: string;
  qty: number;
  amount: number; // line total, already qty × unit price
};

export type ParsedReceipt = {
  merchant: string | null;
  items: ReceiptItem[];
  subtotal: number | null;
  serviceCharge: number;
  tax: number;
  discount: number;
  rounding: number;
  /** What the receipt says is due. Null when no total line was found. */
  total: number | null;
  /** Everything on top of the items — service, tax, rounding, less discount. */
  extras: number;
  warnings: string[];
};

// Ordered: the first pattern that matches wins, so "sub total" must be tested
// before "total" or every subtotal would be read as the grand total.
const LINE_KINDS: { kind: string; re: RegExp }[] = [
  { kind: 'subtotal', re: /\b(sub[\s-]?totals?|jumlah\s+kecil)\b/i },
  { kind: 'service', re: /\b(service\s*(charge|chg)?|svc\s*(chg|charge)?|servis|s\.?c\.?\s*10)\b/i },
  { kind: 'tax', re: /\b(gst|sst|vat|tax|cukai|govt\s*tax)\b/i },
  { kind: 'discount', re: /\b(discount|disc\.?|rebate|voucher|promo|promotion|potongan)\b/i },
  { kind: 'rounding', re: /\b(round(ing)?(\s*(adj|adjustment))?|pembundaran)\b/i },
  { kind: 'total', re: /\b(grand\s*total|total\s*(amount|due)?|amount\s*due|nett?\s*total|jumlah|amaun)\b/i },
  // Payment lines sit below the total and would otherwise read as items.
  {
    kind: 'payment',
    re: /\b(cash|change|tendered|visa|master(card)?|amex|nets|paynow|paywave|debit|credit\s*card|ewallet|grabpay|touch\s*'?n?\s*go|tng|boost|shopeepay|balance|paid)\b/i,
  },
  // Shop furniture that happens to carry a number.
  {
    kind: 'noise',
    re: /\b(gst\s*reg|co\.?\s*reg|tel|phone|invoice|receipt\s*no|bill\s*no|table|pax|cashier|server|date|time|thank\s*you|www\.|\.com)\b/i,
  },
];

function classify(line: string): string | null {
  for (const { kind, re } of LINE_KINDS) {
    if (re.test(line)) return kind;
  }
  return null;
}

/**
 * The money at the end of a line, if there is any.
 *
 * Anchored to the end because an item name can contain digits ("100 PLUS",
 * "7UP") and those must not be mistaken for the price.
 */
function trailingAmount(line: string): { amount: number; rest: string } | null {
  const m = line.match(
    /(?:^|\s)((?:RM|MYR|SGD|S\$|\$)?\s*-?\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})|(?:RM|MYR|SGD|S\$|\$)\s*-?\d+(?:\.\d+)?)\s*[A-Za-z]{0,2}\s*$/
  );
  if (!m || m.index == null) return null;
  const parsed = parseAmount(m[1]);
  if (!parsed) return null;
  const rest = line.slice(0, m.index).trim();
  return { amount: parsed.value, rest };
}

/** Pulls a leading quantity: "2 x Teh Tarik", "2x", "3 @". */
function leadingQty(text: string): { qty: number; name: string } {
  const m = text.match(/^(\d{1,3})\s*(?:x|@|\*)\s*(.+)$/i);
  if (m) return { qty: Number(m[1]), name: m[2].trim() };
  const trailing = text.match(/^(.+?)\s+x\s*(\d{1,3})$/i);
  if (trailing) return { qty: Number(trailing[2]), name: trailing[1].trim() };
  return { qty: 1, name: text };
}

let nextId = 1;

export function parseReceipt(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const items: ReceiptItem[] = [];
  const warnings: string[] = [];
  let subtotal: number | null = null;
  let total: number | null = null;
  let serviceCharge = 0;
  let tax = 0;
  let discount = 0;
  let rounding = 0;
  let merchant: string | null = null;

  // The shop name is nearly always the first line with letters and no price.
  for (const line of lines.slice(0, 4)) {
    if (!/[A-Za-z]{3}/.test(line)) continue;
    if (trailingAmount(line)) continue;
    if (classify(line) === 'noise') continue;
    merchant = line.replace(/[*=_-]{2,}/g, '').trim() || null;
    break;
  }

  let seenTotal = false;

  for (const line of lines) {
    const kind = classify(line);
    const money = trailingAmount(line);

    if (kind === 'noise') continue;

    if (!money) {
      // A bare "TOTAL" with the figure on the next line is common; handled by
      // the next iteration picking up an amount-only line below.
      continue;
    }

    switch (kind) {
      case 'subtotal':
        subtotal = money.amount;
        continue;
      case 'service':
        serviceCharge = round2(serviceCharge + money.amount);
        continue;
      case 'tax':
        tax = round2(tax + money.amount);
        continue;
      case 'discount':
        // Receipts write discounts as either -5.00 or 5.00; normalise to positive.
        discount = round2(discount + Math.abs(money.amount));
        continue;
      case 'rounding':
        rounding = round2(rounding + money.amount);
        continue;
      case 'total':
        // Keep the first total seen. Later "total" words tend to belong to
        // payment summaries ("total paid", "total items").
        if (!seenTotal) {
          total = money.amount;
          seenTotal = true;
        }
        continue;
      case 'payment':
        continue;
    }

    // Anything left with a name and a price is something you bought. Lines
    // after the total are payment furniture even when they look like items.
    if (seenTotal) continue;
    if (!money.rest || !/[A-Za-z]{2}/.test(money.rest)) continue;
    if (money.amount <= 0) continue;

    const { qty, name } = leadingQty(money.rest);
    items.push({ id: `r${nextId++}`, name, qty, amount: money.amount });
  }

  const itemsTotal = round2(items.reduce((sum, i) => sum + i.amount, 0));
  const extras = round2(serviceCharge + tax + rounding - discount);

  if (items.length === 0) {
    warnings.push("Couldn't pick out any items — check the photo is sharp and the whole receipt is in frame.");
  }
  if (subtotal != null && cents(subtotal) !== cents(itemsTotal)) {
    warnings.push(
      `Items add up to ${itemsTotal.toFixed(2)} but the receipt's subtotal is ${subtotal.toFixed(2)} — check for a missed line.`
    );
  }
  if (total != null && items.length > 0) {
    const computed = round2(itemsTotal + extras);
    if (cents(computed) !== cents(total)) {
      warnings.push(
        `Items plus charges come to ${computed.toFixed(2)}, but the receipt total is ${total.toFixed(2)}.`
      );
    }
  }
  if (total == null) {
    warnings.push('No total line found — using the items and charges that were read.');
  }

  return {
    merchant,
    items,
    subtotal,
    serviceCharge,
    tax,
    discount,
    rounding,
    total: total ?? (items.length ? round2(itemsTotal + extras) : null),
    extras,
    warnings,
  };
}

/**
 * Splits a receipt across people by who had what.
 *
 * Service charge and tax are apportioned in proportion to what each person
 * actually ordered, not split evenly — the person who had the $40 steak owes
 * more of the 10% service charge than the one who had a $4 coffee, and
 * splitting the extras evenly would quietly overcharge the cheap eater.
 *
 * The remainder is handed out a cent at a time, largest fractional part first,
 * so the shares always add back to the receipt total exactly.
 */
export function allocateReceipt(
  items: ReceiptItem[],
  /** Person ids sharing each item, keyed by item id. An item with nobody on it is dropped. */
  assignment: Record<string, string[]>,
  extras: number
): Record<string, number> {
  const owed = new Map<string, number>(); // in cents

  for (const item of items) {
    const people = assignment[item.id] ?? [];
    if (people.length === 0) continue;
    const total = cents(item.amount);
    const base = Math.trunc(total / people.length);
    let remainder = total - base * people.length;
    people.forEach((pid, i) => {
      const extra = i < remainder ? 1 : 0;
      owed.set(pid, (owed.get(pid) ?? 0) + base + extra);
    });
  }

  const itemsCents = [...owed.values()].reduce((a, b) => a + b, 0);
  const extrasCents = cents(extras);

  if (itemsCents > 0 && extrasCents !== 0) {
    const ids = [...owed.keys()];
    const exact = ids.map((id) => ((owed.get(id) ?? 0) * extrasCents) / itemsCents);
    const floored = exact.map((n) => Math.floor(n));
    let left = extrasCents - floored.reduce((a, b) => a + b, 0);
    // Largest fractional part first — the standard way to hand out a remainder
    // without favouring whoever happens to be first in the list.
    const order = ids
      .map((_id, i) => ({ i, frac: exact[i] - floored[i] }))
      .sort((a, b) => b.frac - a.frac);
    for (const { i } of order) {
      if (left === 0) break;
      const step = left > 0 ? 1 : -1;
      floored[i] += step;
      left -= step;
    }
    ids.forEach((id, i) => owed.set(id, (owed.get(id) ?? 0) + floored[i]));
  }

  const result: Record<string, number> = {};
  for (const [id, c] of owed) result[id] = c / 100;
  return result;
}
