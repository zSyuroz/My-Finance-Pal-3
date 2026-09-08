/**
 * Reading a bank's dates and amounts.
 *
 * Malaysian and Singaporean banks between them ship at least four date
 * formats — DBS writes `11 Dec 2019`, OCBC and Maybank write `30/06/2018`,
 * some exports write ISO, and a few omit the year entirely because the
 * statement period implies it. Amounts arrive with thousands separators,
 * sometimes in parentheses, sometimes with a trailing CR/DR, sometimes with
 * an `RM` or `SGD` prefix, and occasionally with a trailing minus.
 *
 * Day-first is the default and is correct for every bank in both countries:
 * 03/04/2026 is 3 April, never 4 March.
 */

const MONTHS: Record<string, number> = {
  // English
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  // Bahasa Malaysia — Maybank, BSN and Bank Islam statements are often
  // printed in Malay, and the month name is the only word that has to parse.
  mac: 3, mei: 5, ogo: 8, ogos: 8, okt: 10, dis: 12,
  januari: 1, februari: 2, april: 4, julai: 7, september: 9,
  oktober: 10, disember: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const valid = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= new Date(y, m, 0).getDate() && y >= 1970 && y <= 2199;

const century = (yy: number) => (yy >= 70 ? 1900 + yy : 2000 + yy);

const monthFrom = (word: string): number | undefined => {
  const w = word.toLowerCase();
  return MONTHS[w] ?? MONTHS[w.slice(0, 4)] ?? MONTHS[w.slice(0, 3)];
};

export type DateOptions = {
  /** 03/04/2026 → 3 April when true (the default, and correct for MY and SG). */
  dayFirst?: boolean;
  /** Supplies the year for statements that print dates without one. */
  fallbackYear?: number | null;
};

/** Best-effort date parsing. Returns null when the value isn't a date at all. */
export function parseDate(value: string, opts: DateOptions = {}): string | null {
  const dayFirst = opts.dayFirst !== false;
  const fallbackYear = opts.fallbackYear ?? null;
  const s = String(value || '').trim();
  if (!s) return null;

  // ISO first — unambiguous.
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return valid(y, mo, d) ? iso(y, mo, d) : null;
  }

  // 11 Dec 2019 · 11 Disember 2019 · 11-Dec-19 · 11 Dec (year implied)
  m = s.match(/^(\d{1,2})[\s\-/.]*([A-Za-z]{3,9})\.?(?:[\s\-/.]+(\d{2,4}))?/);
  if (m) {
    const mo = monthFrom(m[2]);
    if (mo) {
      const d = Number(m[1]);
      let y = m[3] ? Number(m[3]) : fallbackYear;
      if (y == null) return null;
      if (y < 100) y = century(y);
      return valid(y, mo, d) ? iso(y, mo, d) : null;
    }
  }

  // Dec 11, 2019
  m = s.match(/^([A-Za-z]{3,9})\.?[\s\-]+(\d{1,2}),?(?:[\s\-]+(\d{2,4}))?/);
  if (m) {
    const mo = monthFrom(m[1]);
    if (mo) {
      const d = Number(m[2]);
      let y = m[3] ? Number(m[3]) : fallbackYear;
      if (y == null) return null;
      if (y < 100) y = century(y);
      return valid(y, mo, d) ? iso(y, mo, d) : null;
    }
  }

  // 30/06/2018 · 30-06-18 · 30.06.2018 — and 30/06 with the year implied.
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let y = m[3] ? Number(m[3]) : fallbackYear;
    if (y == null) return null;
    if (y < 100) y = century(y);
    let d = dayFirst ? a : b;
    let mo = dayFirst ? b : a;
    // One arrangement may be impossible (13/06 can only be 13 June); if so,
    // take the other rather than dropping the row.
    if (!valid(y, mo, d) && valid(y, d, mo)) [d, mo] = [mo, d];
    return valid(y, mo, d) ? iso(y, mo, d) : null;
  }

  return null;
}

export function looksLikeDate(value: string, opts?: DateOptions): boolean {
  return parseDate(value, { fallbackYear: 2000, ...opts }) !== null;
}

export type ParsedAmount = {
  value: number;
  /**
   * True when the cell itself declares a credit (a trailing CR, a leading +),
   * false for an explicit debit marker, null when the cell says nothing and
   * the column it sits in has to decide.
   */
  credit: boolean | null;
};

/** Parse a money cell. Returns null when the value isn't money at all. */
export function parseAmount(value: string | null | undefined): ParsedAmount | null {
  let s = String(value ?? '').trim();
  if (!s) return null;

  let credit: boolean | null = null;
  let negative = false;

  if (/\(.*\)/.test(s)) {
    negative = true;
    s = s.replace(/[()]/g, '');
  }

  // Trailing/leading CR and DR markers — Standard Chartered, Public Bank and
  // CIMB all lean on these instead of a sign. They are written flush against
  // the figure as often as not ("28.50DR"), so this deliberately does not
  // require a word boundary: an amount never legitimately ends in "cr"/"dr".
  const suffix = s.match(/\s*(CR|DR)\.?\s*$/i);
  if (suffix) {
    credit = suffix[1].toUpperCase() === 'CR';
    s = s.slice(0, suffix.index);
  } else {
    // Single-letter C/D markers are far more likely to be a stray character,
    // so those do still need whitespace in front of them.
    const short = s.match(/\s+(C|D)\.?\s*$/i);
    if (short) {
      credit = short[1].toUpperCase() === 'C';
      s = s.slice(0, short.index);
    }
  }
  const prefix = s.match(/^(CR|DR)\.?\s*/i);
  if (prefix) {
    credit = prefix[1].toUpperCase() === 'CR';
    s = s.slice(prefix[0].length);
  }

  // Currency codes, including both countries' own. Malaysian statements write
  // "RM1,234.56" with nothing between the code and the figure, so matching on
  // a trailing word boundary would never fire — these are anchored to the
  // start or end of the cell instead.
  const CODES = 'MYR|SGD|USD|EUR|GBP|AUD|JPY|HKD|CNY|THB|IDR|PHP|VND|BND|RM';
  s = s.replace(new RegExp(`^\\s*(?:${CODES})\\s*`, 'i'), '');
  s = s.replace(new RegExp(`\\s*(?:${CODES})\\s*$`, 'i'), '');
  s = s.replace(/[$€£¥₱₩]/g, '').trim();

  if (/^[-−–]/.test(s)) {
    negative = true;
    s = s.replace(/^[-−–]\s*/, '');
  } else if (/^\+/.test(s)) {
    credit = credit === null ? true : credit;
    s = s.replace(/^\+\s*/, '');
  }
  if (/[-−–]\s*$/.test(s)) {
    negative = true;
    s = s.replace(/[-−–]\s*$/, '');
  }

  s = s.replace(/\s/g, '');
  if (!s) return null;

  // 1.234,56 (comma decimal) vs 1,234.56 — decide by whichever separator is
  // last, since that one is the decimal point.
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }

  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;

  return { value: negative ? -n : n, credit };
}

export function looksLikeAmount(value: string): boolean {
  const parsed = parseAmount(value);
  if (!parsed) return false;
  // A bare integer — a year, a reference number, an account number — is not
  // an amount. Money in a statement essentially always carries its cents.
  return /[.,]\d{2}\b/.test(String(value)) || /\b(CR|DR)\b/i.test(String(value));
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
