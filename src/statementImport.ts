/**
 * Turning a Malaysian or Singaporean bank statement into ledger rows.
 *
 * The shape is detected rather than hardcoded per bank: find the header row
 * wherever it sits under the preamble, match each column against the alias
 * table in `statement/banks.ts`, and normalise. A bank nobody has heard of
 * still imports, because the only thing that really varies between them is
 * which labels they use — and where labels are absent entirely, the columns
 * are identified by what they contain instead.
 *
 * PDFs take a different route: their text layer has no columns at all, so
 * they go through the running-balance ledger reader below, which was built
 * and verified against a real multi-page OCBC statement.
 */

import { extractPdfText } from './pdfExtract';
import { todayKey } from './dateUtils';
import { type CategoryKey } from './spending';
import { looksDelimited, toGrid } from './statement/csv';
import {
  looksLikeAmount,
  looksLikeDate,
  parseAmount,
  parseDate,
  round2,
  type DateOptions,
} from './statement/fields';
import {
  detectBank,
  detectPeriodYear,
  ROLES,
  scoreHeader,
  type BankProfile,
  type ColumnRole,
} from './statement/banks';
import { guessCategory, INCOME_KEYWORDS } from './statement/merchants';

export { guessCategory };

export type Direction = 'expense' | 'income';

export type ParsedTransaction = {
  tempId: string;
  date: string; // YYYY-MM-DD, best-effort — always a valid date, falls back to today
  description: string;
  amount: number; // always positive; direction carries the sign
  direction: Direction;
  category: CategoryKey; // only meaningful when direction === 'expense'
  /** True when nothing in the row said which way the money went. */
  ambiguous?: boolean;
};

export type StatementParseResult = {
  rows: ParsedTransaction[];
  warnings: string[];
  bank: BankProfile | null;
  /** How the file was read, for the review screen's own wording. */
  mode: 'table' | 'text';
};

let nextTempId = 1;
function tempId(): string {
  return `parsed-${Date.now()}-${nextTempId++}`;
}

type ColumnMap = Partial<Record<ColumnRole, number>>;

const dateOr = (raw: string, opts: DateOptions): string => parseDate(raw, opts) ?? todayKey();

function guessDirectionFromWords(description: string): Direction {
  const d = description.toLowerCase();
  return INCOME_KEYWORDS.some((w) => d.includes(w)) ? 'income' : 'expense';
}

/* ------------------------------------------------------------ column map -- */

/** Greedy assignment: strongest column/role pair first, each used once. */
function mapByHeader(cells: string[]): ColumnMap {
  const pairs: { index: number; role: ColumnRole; score: number }[] = [];
  cells.forEach((cell, index) => {
    for (const role of ROLES) {
      const score = scoreHeader(cell, role);
      if (score > 0) pairs.push({ index, role, score });
    }
  });
  pairs.sort((a, b) => b.score - a.score || a.index - b.index);

  const map: ColumnMap = {};
  const usedColumns = new Set<number>();
  for (const pair of pairs) {
    if (map[pair.role] !== undefined || usedColumns.has(pair.index)) continue;
    map[pair.role] = pair.index;
    usedColumns.add(pair.index);
  }
  return map;
}

function headerScore(cells: string[]): number {
  const seen = new Set<ColumnRole>();
  let total = 0;
  cells.forEach((cell) => {
    for (const role of ROLES) {
      const s = scoreHeader(cell, role);
      if (s >= 70 && !seen.has(role)) {
        seen.add(role);
        total += s;
      }
    }
  });
  // A header row has to at least name a date and something money-shaped.
  const money = seen.has('debit') || seen.has('credit') || seen.has('amount');
  return seen.has('date') && money ? total : 0;
}

/**
 * Bank exports bury the header under a preamble — account number, holder
 * name, statement period, sometimes a blank row or three. Scan for it rather
 * than assuming row 0.
 */
function findHeader(rows: string[][]): number {
  let best = { index: -1, score: 0 };
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i += 1) {
    const score = headerScore(rows[i]);
    if (score > best.score) best = { index: i, score };
  }
  return best.index;
}

/** No usable header at all: work the roles out from the data itself. */
function mapByContent(rows: string[][], opts: DateOptions): ColumnMap {
  const width = Math.max(...rows.map((r) => r.length));
  const columns: { dates: number; amounts: number; text: number; length: number; filled: number }[] = [];

  for (let c = 0; c < width; c += 1) {
    const cells = rows.map((r) => r[c] || '').filter(Boolean);
    if (!cells.length) {
      columns.push({ dates: 0, amounts: 0, text: 0, length: 0, filled: 0 });
      continue;
    }
    columns.push({
      dates: cells.filter((v) => looksLikeDate(v, opts)).length / cells.length,
      amounts: cells.filter((v) => looksLikeAmount(v)).length / cells.length,
      text:
        cells.filter((v) => /[A-Za-z]{3,}/.test(v) && !looksLikeDate(v, opts)).length / cells.length,
      length: cells.reduce((a, v) => a + v.length, 0) / cells.length,
      filled: cells.length / rows.length,
    });
  }

  const map: ColumnMap = {};
  const taken = new Set<number>();
  const pick = (role: ColumnRole, scorer: (col: (typeof columns)[number]) => number) => {
    let best = -1;
    let bestScore = 0.35;
    columns.forEach((col, i) => {
      if (taken.has(i)) return;
      const s = scorer(col);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    if (best >= 0) {
      map[role] = best;
      taken.add(best);
    }
  };

  pick('date', (col) => col.dates);
  pick('description', (col) => col.text * 0.6 + Math.min(col.length / 30, 1) * 0.4);

  const moneyColumns = columns
    .map((col, i) => ({ col, i }))
    .filter(({ col, i }) => !taken.has(i) && col.amounts > 0.5)
    .sort((a, b) => a.i - b.i);

  if (moneyColumns.length >= 3) {
    // Debit, credit, balance: the balance column is the one always filled.
    const [d, c, b] = moneyColumns;
    map.debit = d.i;
    map.credit = c.i;
    map.balance = b.i;
  } else if (moneyColumns.length === 2) {
    const [a, b] = moneyColumns;
    // Two money columns are debit/credit when each is sparse, and
    // amount + balance when both are dense.
    if (a.col.filled > 0.9 && b.col.filled > 0.9) {
      map.amount = a.i;
      map.balance = b.i;
    } else {
      map.debit = a.i;
      map.credit = b.i;
    }
  } else if (moneyColumns.length === 1) {
    map.amount = moneyColumns[0].i;
  }
  return map;
}

/* --------------------------------------------------------------- parsing -- */

type WorkingRow = ParsedTransaction & { balance: number | null };

function buildRow(cells: string[], map: ColumnMap, opts: DateOptions): WorkingRow | null {
  const at = (role: ColumnRole) => (map[role] === undefined ? '' : cells[map[role]!] || '');

  const date = parseDate(at('date'), opts) || parseDate(at('valueDate'), opts);

  const descriptionParts = [at('description')];
  if (map.description === undefined && map.reference !== undefined) {
    descriptionParts.push(at('reference'));
  }
  // Extra reference columns still carry merchant text on DBS and Maybank
  // exports, so anything wordy that isn't already claimed gets folded in.
  const mapped = new Set(Object.values(map));
  const extras = cells.filter((cell, i) => {
    if (mapped.has(i)) return false;
    return /[A-Za-z]{3,}/.test(cell) && !looksLikeAmount(cell) && !looksLikeDate(cell, opts);
  });
  const description = [...descriptionParts, ...extras]
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const declaredDirection = at('direction').trim().toLowerCase();

  const debit = map.debit !== undefined ? parseAmount(at('debit')) : null;
  const credit = map.credit !== undefined ? parseAmount(at('credit')) : null;
  const single = map.amount !== undefined ? parseAmount(at('amount')) : null;
  const balance = map.balance !== undefined ? parseAmount(at('balance')) : null;

  let value: number | null = null;
  let direction: Direction = 'expense';
  let ambiguous = false;

  if (debit && debit.value !== 0) {
    value = Math.abs(debit.value);
    direction = 'expense';
  } else if (credit && credit.value !== 0) {
    value = Math.abs(credit.value);
    direction = 'income';
  } else if (single && single.value !== 0) {
    value = Math.abs(single.value);
    if (single.credit === true) direction = 'income';
    else if (single.credit === false) direction = 'expense';
    else if (single.value < 0) direction = 'expense';
    else if (/^\s*\+/.test(at('amount'))) direction = 'income';
    else {
      direction = 'expense';
      ambiguous = true;
    }
  }

  // A source that states the direction outright beats a sign — including the
  // Malay wording Maybank and BSN statements use.
  if (declaredDirection) {
    if (/^(in|income|credit|cr|deposit|received|masuk|kredit|kemasukan)\b/.test(declaredDirection)) {
      direction = 'income';
      ambiguous = false;
    } else if (
      /^(out|expense|debit|dr|spend|spent|withdrawal|paid|payment|keluar|pengeluaran)\b/.test(
        declaredDirection
      )
    ) {
      direction = 'expense';
      ambiguous = false;
    }
  }

  if (value === null || !date) return null;

  return {
    tempId: tempId(),
    date,
    description: description || '(no description)',
    amount: round2(value),
    direction,
    category: guessCategory(description),
    ambiguous,
    balance: balance ? balance.value : null,
  };
}

/**
 * OCBC (and UOB, and Maybank on long DuitNow rows) wrap a description onto
 * the next row with the date column left blank. Such a row is a continuation,
 * not a transaction.
 */
function isContinuation(cells: string[], map: ColumnMap): boolean {
  const dateCell = map.date === undefined ? '' : cells[map.date] || '';
  const valueCell = map.valueDate === undefined ? '' : cells[map.valueDate] || '';
  if (dateCell || valueCell) return false;
  return cells.some((c) => /[A-Za-z0-9]/.test(c));
}

/** Direction from the balance column, for exports whose amount carries no sign. */
function resolveWithBalance(rows: WorkingRow[]): number {
  let resolved = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const prev = rows[i - 1];
    if (!row.ambiguous || row.balance === null || prev.balance === null) continue;
    const delta = round2(row.balance - prev.balance);
    if (Math.abs(Math.abs(delta) - row.amount) > 0.01) continue;
    row.direction = delta > 0 ? 'income' : 'expense';
    row.ambiguous = false;
    resolved += 1;
  }
  return resolved;
}

const strip = (rows: WorkingRow[]): ParsedTransaction[] =>
  rows.map(({ balance, ...row }) => row);

/* -------------------------------------------------------------- PDF text -- */

const DATE_TOKEN = '(?:\\d{1,2}\\s+[A-Za-z]{3}|\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4})';
// One or two leading dates (a statement often prints both a transaction date
// and a value date — we only need the first), a description, then either just
// an amount, or an amount followed by a running balance.
const LEDGER_ROW_RE = new RegExp(
  `^(${DATE_TOKEN})(?:\\s+${DATE_TOKEN})?\\s+(.+?)\\s+([\\d,]+\\.\\d{2})(?:\\s+([\\d,]+\\.\\d{2}))?$`,
  'i'
);
const OPENING_BALANCE_RE =
  /^(?:BALANCE B\/F|OPENING BALANCE|BALANCE BROUGHT FORWARD|PREVIOUS BALANCE|BAKI DIBAWA KE HADAPAN|BAKI AWAL)\s+([\d,]+\.\d{2})$/i;
const CLOSING_MARKER_RE =
  /^(?:BALANCE C\/F|CLOSING BALANCE|BALANCE CARRIED FORWARD|TOTAL WITHDRAWALS|TOTAL DEPOSITS|AVERAGE BALANCE|BAKI AKHIR|JUMLAH)/i;
// Fragments of a row's continuation lines that are really page furniture —
// letterhead, disclaimers, page numbers — repeated on every page.
const PAGE_FURNITURE_RE =
  /deposit insurance|statement of account|account no\.?|for enquiries|customer service|co\.? reg\.? no|penyata akaun|no\.? akaun|perbadanan insurans/i;
const CONTINUATION_JUNK_RE = /^[A-Z]$|^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$|^\d+$/;
const MAX_CONTINUATION_LINES = 4;
const MAX_CONTINUATION_LINE_LENGTH = 60;

/**
 * The common "running balance ledger" layout most bank statement PDFs use:
 * each row is a date, a description, a transaction amount, and (usually) the
 * account balance right after it. When a balance is present, comparing it to
 * the previous row's tells us whether the row was a deposit or a withdrawal —
 * far more reliable than guessing from keywords, and it works regardless of
 * which visual column the PDF actually drew the number in.
 */
function parseLedgerText(text: string, opts: DateOptions): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  let prevBalance: number | null = null;
  let current:
    | { date: string; description: string; amount: string; balance?: string; extra: string[] }
    | null = null;

  const flush = () => {
    if (!current) return;
    const amount = parseAmount(current.amount)?.value ?? null;
    if (amount != null && amount !== 0) {
      const description = [current.description, ...current.extra]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      const balance = current.balance != null ? parseAmount(current.balance)?.value ?? null : null;
      const direction: Direction =
        balance != null && prevBalance != null
          ? balance >= prevBalance - 0.005
            ? 'income'
            : 'expense'
          : guessDirectionFromWords(description);
      results.push({
        tempId: tempId(),
        date: current.date,
        description: description || '(no description)',
        amount: Math.abs(amount),
        direction,
        category: guessCategory(description),
      });
      if (balance != null) prevBalance = balance;
    }
    current = null;
  };

  // Continuation lines never carry over a page break — the next page always
  // starts with its own letterhead, not more detail for the previous row.
  for (const pageText of text.split('\f')) {
    for (const rawLine of pageText.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;

      const opening = line.match(OPENING_BALANCE_RE);
      if (opening) {
        prevBalance = parseAmount(opening[1])?.value ?? null;
        continue;
      }
      if (CLOSING_MARKER_RE.test(line)) {
        flush();
        continue;
      }

      const row = line.match(LEDGER_ROW_RE);
      if (row) {
        flush();
        current = {
          date: dateOr(row[1], opts),
          description: row[2],
          amount: row[3],
          balance: row[4],
          extra: [],
        };
        continue;
      }

      if (
        current &&
        !CONTINUATION_JUNK_RE.test(line) &&
        !PAGE_FURNITURE_RE.test(line) &&
        line.length <= MAX_CONTINUATION_LINE_LENGTH &&
        current.extra.length < MAX_CONTINUATION_LINES
      ) {
        current.extra.push(line);
      }
    }
    flush();
  }

  return results;
}

/**
 * Text copied from a PDF or an online-banking page that doesn't reconcile to
 * a running balance: a date, a description, then one or more amounts,
 * separated by runs of whitespace.
 */
function parseFreeText(text: string, opts: DateOptions): WorkingRow[] {
  const LINE =
    /^\s*(\d{1,2}[\s\-/.][A-Za-z]{3,9}[\s\-/.]?\d{0,4}|\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?|\d{4}-\d{2}-\d{2})\s+(.*?)\s{2,}([^\s].*)$/;
  const out: WorkingRow[] = [];

  for (const line of String(text).split(/\r\n?|\n/)) {
    if (!line.trim()) continue;
    const m = line.match(LINE);
    if (!m) {
      // A continuation of the previous row's description.
      const last = out[out.length - 1];
      if (last && /^\s{2,}\S/.test(line) && !looksLikeAmount(line.trim())) {
        last.description = `${last.description} ${line.trim()}`.replace(/\s+/g, ' ');
      }
      continue;
    }
    const date = parseDate(m[1], opts);
    if (!date) continue;

    const numbers = m[3]
      .trim()
      .split(/\s{2,}|\t/)
      .map((s) => s.trim())
      .filter(Boolean);
    const parsed = numbers.map(parseAmount).filter(Boolean) as NonNullable<
      ReturnType<typeof parseAmount>
    >[];
    if (!parsed.length) continue;

    const first = parsed[0];
    const value = Math.abs(first.value);
    if (!value) continue;

    let direction: Direction = 'expense';
    let ambiguous = false;
    if (first.credit === true) direction = 'income';
    else if (first.credit === false) direction = 'expense';
    else if (first.value < 0) direction = 'expense';
    else ambiguous = true;

    const description = m[2].trim().replace(/\s+/g, ' ') || '(no description)';
    out.push({
      tempId: tempId(),
      date,
      description,
      amount: round2(value),
      direction,
      category: guessCategory(description),
      ambiguous,
      balance: parsed.length > 1 ? parsed[parsed.length - 1].value : null,
    });
  }
  return out;
}

/* ---------------------------------------------------------------- entry -- */

export type ParseOptions = {
  /** 03/04/2026 → 3 April. Always true for MY and SG; overridable for imported foreign statements. */
  dayFirst?: boolean;
  fallbackYear?: number;
};

export function parseStatement(text: string, options: ParseOptions = {}): StatementParseResult {
  const warnings: string[] = [];
  const source = String(text || '');
  if (!source.trim()) {
    return { rows: [], warnings: ['That file is empty.'], bank: null, mode: 'text' };
  }

  const bank = detectBank(source);
  const periodYear = detectPeriodYear(source);
  const opts: DateOptions = {
    dayFirst: options.dayFirst ?? bank?.hints?.dayFirst ?? true,
    fallbackYear: options.fallbackYear ?? periodYear ?? new Date().getFullYear(),
  };

  const ambiguityWarning = (rows: { ambiguous?: boolean }[]) => {
    const n = rows.filter((r) => r.ambiguous).length;
    if (n > 0) {
      warnings.push(
        `${n} row${n === 1 ? '' : 's'} didn't say whether money came in or out — check the ones marked Expense before importing.`
      );
    }
  };

  /* ---- a PDF's text layer, or anything else that isn't a table ---- */
  if (!looksDelimited(source)) {
    const ledger = parseLedgerText(source, opts);
    if (ledger.length > 0) {
      return { rows: ledger, warnings, bank, mode: 'text' };
    }
    const free = parseFreeText(source, opts);
    if (free.length > 0) {
      resolveWithBalance(free);
      ambiguityWarning(free);
      return { rows: strip(free), warnings, bank, mode: 'text' };
    }
    return {
      rows: [],
      warnings: ["Couldn't find dated rows with amounts in that file."],
      bank,
      mode: 'text',
    };
  }

  /* ---- a delimited export ---- */
  const { rows: grid } = toGrid(source);
  const headerIndex = findHeader(grid);
  const body = headerIndex >= 0 ? grid.slice(headerIndex + 1) : grid;

  let map: ColumnMap;
  if (headerIndex >= 0) {
    map = mapByHeader(grid[headerIndex]);
  } else {
    map = mapByContent(grid.slice(0, 200), opts);
    warnings.push('No column headers found, so the columns were read from their contents.');
  }

  if (map.date === undefined) {
    return {
      rows: [],
      warnings: ["Couldn't find a date column in that file — check it's a transaction export."],
      bank,
      mode: 'table',
    };
  }
  if (map.debit === undefined && map.credit === undefined && map.amount === undefined) {
    return {
      rows: [],
      warnings: ["Couldn't find an amount column in that file — check it's a transaction export."],
      bank,
      mode: 'table',
    };
  }

  const rows: WorkingRow[] = [];
  let continuations = 0;
  for (const cells of body) {
    if (isContinuation(cells, map)) {
      continuations += 1;
      const last = rows[rows.length - 1];
      if (last) {
        const extra = cells
          .filter((c) => /[A-Za-z]{2,}/.test(c) && !looksLikeAmount(c))
          .join(' ')
          .trim();
        if (extra) last.description = `${last.description} ${extra}`.replace(/\s+/g, ' ').trim();
      }
      continue;
    }
    const row = buildRow(cells, map, opts);
    if (row) rows.push(row);
  }

  resolveWithBalance(rows);
  // Whatever the balance column couldn't settle — the first row of a file has
  // nothing before it to compare against — falls back to the wording.
  for (const row of rows) {
    if (row.ambiguous) row.direction = guessDirectionFromWords(row.description);
  }

  if (rows.length === 0) {
    warnings.push('Found the columns, but no row had both a date and an amount.');
  } else {
    // Wrapped description rows are absorbed into the row above, so they are
    // not "skipped" in any sense worth reporting.
    const skipped = body.length - rows.length - continuations;
    if (skipped > 0) {
      warnings.push(`${skipped} line${skipped === 1 ? '' : 's'} skipped — no date or no amount.`);
    }
  }
  ambiguityWarning(rows);

  return { rows: strip(rows), warnings, bank, mode: 'table' };
}



export type StatementAsset = {
  name: string;
  uri: string;
  mimeType?: string;
  /** Only ever set on web — see `pdfExtract.ts` for why PDF import is web-only. */
  file?: Blob;
};

export async function parseStatementFile(asset: StatementAsset): Promise<StatementParseResult> {
  const isPdf = asset.name.toLowerCase().endsWith('.pdf') || asset.mimeType === 'application/pdf';

  if (isPdf) {
    if (!asset.file) {
      throw new Error(
        "PDF import isn't available on this device yet — export your statement as a CSV file instead."
      );
    }
    const text = await extractPdfText(asset.file);
    return parseStatement(text);
  }

  return parseStatement(await readText(asset));
}

/**
 * Reads a non-PDF statement. On web the picker hands over a real `File` and
 * this is trivial; on native it hands over a `uri` into the app's own cache,
 * which `fetch` can read but reports failures for in the same words it uses
 * for a dead internet connection ("Network request failed", "Failed to
 * fetch"). Nothing here goes near a network, so that wording would only ever
 * send someone off checking their wifi — it doesn't get to reach the user.
 */
async function readText(asset: StatementAsset): Promise<string> {
  if (asset.file) return asset.file.text();
  try {
    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error(`status ${response.status}`);
    return await response.text();
  } catch {
    throw new Error(
      "Couldn't read that file. Try picking it again, or copy it somewhere " +
        'else on your phone first.'
    );
  }
}
