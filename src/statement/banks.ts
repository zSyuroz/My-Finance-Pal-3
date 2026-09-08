/**
 * What each bank calls its columns, and how to recognise its export.
 *
 * These are hints, not a schema. The importer maps columns by matching header
 * text against the alias table below, so a bank that renames a label — or one
 * that isn't listed at all — still imports: it falls through to the same
 * matcher, then to content-based detection, then to the manual mapper. Adding
 * a bank means adding aliases, never a new code path.
 *
 * Column roles:
 *   date        the transaction date
 *   valueDate   the value/posting date, kept only as a fallback
 *   description what the row is
 *   debit       money out, in its own column
 *   credit      money in, in its own column
 *   amount      one signed column doing both jobs
 *   balance     running balance, used to infer direction when nothing else can
 *   reference   the bank's own code, folded into the description
 *   category    a category the source already assigned
 *   direction   an in/out column, where the source has one
 */

export type ColumnRole =
  | 'date'
  | 'valueDate'
  | 'description'
  | 'debit'
  | 'credit'
  | 'amount'
  | 'balance'
  | 'reference'
  | 'category'
  | 'direction';

/**
 * Aliases carry both languages on purpose: Maybank, BSN, Bank Islam and
 * Bank Rakyat all print statements in Bahasa Malaysia, and a Malay header is
 * the only thing standing between a valid export and an unreadable one.
 */
export const COLUMN_ALIASES: Record<ColumnRole, string[]> = {
  date: [
    'transaction date', 'txn date', 'trans date', 'date', 'posting date', 'post date',
    'date of transaction', 'entry date', 'booking date', 'statement date',
    // Bahasa Malaysia
    'tarikh', 'tarikh transaksi', 'tarikh urusniaga', 'tarikh catatan',
  ],
  valueDate: ['value date', 'value dt', 'settlement date', 'tarikh nilai'],
  description: [
    'description', 'transaction description', 'particulars', 'details', 'narrative',
    'transaction details', 'transaction ref1', 'remarks', 'merchant', 'payee', 'name',
    'transaction', 'memo', 'item', 'title', 'notes', 'note', 'what', 'expense',
    // Bahasa Malaysia
    'butiran', 'keterangan', 'penerangan', 'urusniaga', 'catatan', 'perihal',
  ],
  debit: [
    'debit amount', 'debit', 'withdrawal', 'withdrawals', 'withdrawal amount',
    'withdrawals (sgd)', 'withdrawal (sgd)', 'withdrawal (myr)', 'money out',
    'paid out', 'dr', 'debit (sgd)', 'debit (myr)', 'debit (rm)', 'out',
    // Bahasa Malaysia
    'keluar', 'wang keluar', 'pengeluaran', 'jumlah keluar', 'debit (rm)',
  ],
  credit: [
    'credit amount', 'credit', 'deposit', 'deposits', 'deposit amount',
    'deposits (sgd)', 'deposit (sgd)', 'deposit (myr)', 'money in', 'paid in',
    'cr', 'credit (sgd)', 'credit (myr)', 'credit (rm)', 'in',
    // Bahasa Malaysia
    'masuk', 'wang masuk', 'kemasukan', 'jumlah masuk', 'kredit',
  ],
  amount: [
    'amount', 'transaction amount', 'amount (sgd)', 'amount (myr)', 'amount (rm)',
    'amount sgd', 'amount myr', 'sgd amount', 'myr amount', 'value',
    'transaction amount (sgd)', 'transaction amount (myr)', 'amt',
    // Bahasa Malaysia
    'jumlah', 'amaun', 'nilai',
  ],
  balance: [
    'balance', 'available balance', 'closing balance', 'ledger balance',
    'running balance', 'balance (sgd)', 'balance (myr)', 'balance (rm)',
    // Bahasa Malaysia
    'baki', 'baki akhir', 'baki semasa',
  ],
  reference: [
    'reference', 'ref', 'transaction ref2', 'transaction ref3', 'cheque', 'cheque no',
    'reference no', 'transaction reference', 'rujukan', 'no rujukan', 'no. rujukan',
  ],
  category: ['category', 'categories', 'tag', 'tags', 'bucket', 'group', 'label', 'kategori'],
  direction: [
    'type', 'kind', 'direction', 'in/out', 'flow', 'debit/credit', 'dr/cr',
    'transaction type', 'jenis', 'jenis urusniaga',
  ],
};

export type BankProfile = {
  id: string;
  name: string;
  country: 'SG' | 'MY' | 'SG/MY';
  signature: RegExp[];
  weakSignature?: RegExp[];
  hints?: { dayFirst?: boolean; continuationRows?: boolean; yearFromPeriod?: boolean };
  note?: string;
};

/**
 * Bank profiles for Singapore and Malaysia. `signature` names the source and
 * supplies parsing hints; nothing here gates whether a file can import, and
 * an unlisted bank is not a failure case.
 *
 * Every bank in both countries writes dates day-first, so `dayFirst` is the
 * default rather than a per-bank flag — it is only spelled out where a note
 * explains the layout.
 */
export const BANKS: BankProfile[] = [
  // ---- Singapore ----
  {
    id: 'dbs',
    name: 'DBS / POSB',
    country: 'SG',
    signature: [/\bdbs\b/i, /\bposb\b/i],
    weakSignature: [/account details for/i, /transaction ref1/i],
    note: 'Transaction Date, Reference, Debit Amount, Credit Amount, Transaction Ref1–3. Dates read 11 Dec 2019.',
  },
  {
    id: 'ocbc',
    name: 'OCBC',
    country: 'SG/MY',
    signature: [/\bocbc\b/i, /oversea-chinese banking/i],
    weakSignature: [/withdrawals?\s*\(sgd\)/i, /deposits?\s*\(sgd\)/i],
    hints: { continuationRows: true },
    note: 'Transaction date, Value date, Description, Withdrawals, Deposits. Long descriptions continue on rows with no date.',
  },
  {
    id: 'uob',
    name: 'UOB',
    country: 'SG/MY',
    signature: [/\buob\b/i, /united overseas bank/i],
    weakSignature: [/available balance/i],
    note: 'Transaction Date, Description, Withdrawal, Deposit, Available Balance.',
  },
  {
    id: 'scb',
    name: 'Standard Chartered',
    country: 'SG/MY',
    signature: [/standard chartered/i, /\bscb\b/i],
    note: 'Date, Description, Amount — credits carry a CR suffix rather than a sign.',
  },
  { id: 'citi', name: 'Citibank', country: 'SG', signature: [/\bciti(bank)?\b/i] },
  {
    id: 'trust',
    name: 'Trust Bank',
    country: 'SG',
    signature: [/trust bank/i],
    hints: { yearFromPeriod: true },
    note: 'Dates often omit the year; it is taken from the statement period.',
  },
  { id: 'gxs', name: 'GXS Bank', country: 'SG', signature: [/\bgxs\b/i] },
  { id: 'maribank', name: 'MariBank', country: 'SG', signature: [/maribank/i] },
  { id: 'boc', name: 'Bank of China', country: 'SG', signature: [/bank of china/i] },
  { id: 'icbc', name: 'ICBC', country: 'SG', signature: [/\bicbc\b/i] },
  { id: 'sc-revolut', name: 'Revolut', country: 'SG', signature: [/revolut/i] },
  { id: 'wise', name: 'Wise', country: 'SG', signature: [/transferwise/i, /\bwise\b\s+(?:business|account|statement)/i] },
  { id: 'youtrip', name: 'YouTrip', country: 'SG', signature: [/youtrip/i] },
  { id: 'amex', name: 'American Express', country: 'SG/MY', signature: [/american express/i, /\bamex\b/i] },

  // ---- Malaysia ----
  {
    id: 'maybank',
    name: 'Maybank',
    country: 'SG/MY',
    signature: [/maybank/i, /malayan banking/i, /\bm2u\b/i],
    weakSignature: [/butiran/i, /\bmae\b/i],
    note: 'Tarikh / Butiran / Debit / Kredit / Baki on Malay statements; the same columns in English on M2U exports.',
  },
  {
    id: 'cimb',
    name: 'CIMB Bank',
    country: 'SG/MY',
    signature: [/\bcimb\b/i],
    weakSignature: [/cimb clicks/i, /octo/i],
  },
  {
    id: 'publicbank',
    name: 'Public Bank',
    country: 'MY',
    signature: [/public bank/i, /pbebank/i, /\bpbb\b/i],
  },
  { id: 'rhb', name: 'RHB Bank', country: 'SG/MY', signature: [/\brhb\b/i] },
  {
    id: 'hongleong',
    name: 'Hong Leong Bank',
    country: 'MY',
    signature: [/hong leong/i, /hlbconnect/i, /\bhlb\b/i],
  },
  { id: 'ambank', name: 'AmBank', country: 'MY', signature: [/\bambank\b/i, /\bamonline\b/i] },
  { id: 'bankislam', name: 'Bank Islam', country: 'MY', signature: [/bank islam/i, /\bbimb\b/i] },
  { id: 'bsn', name: 'Bank Simpanan Nasional', country: 'MY', signature: [/bank simpanan/i, /\bbsn\b/i] },
  { id: 'affin', name: 'Affin Bank', country: 'MY', signature: [/affin/i] },
  { id: 'alliance', name: 'Alliance Bank', country: 'MY', signature: [/alliance bank/i, /allianceonline/i] },
  { id: 'bankrakyat', name: 'Bank Rakyat', country: 'MY', signature: [/bank rakyat/i] },
  { id: 'mbsb', name: 'MBSB Bank', country: 'MY', signature: [/\bmbsb\b/i] },
  { id: 'agrobank', name: 'Agrobank', country: 'MY', signature: [/agrobank/i] },
  { id: 'muamalat', name: 'Bank Muamalat', country: 'MY', signature: [/muamalat/i] },
  { id: 'alrajhi', name: 'Al Rajhi Bank', country: 'MY', signature: [/al\s*rajhi/i] },
  { id: 'hsbc', name: 'HSBC', country: 'SG/MY', signature: [/\bhsbc\b/i] },
  { id: 'gxbank', name: 'GXBank', country: 'MY', signature: [/\bgx\s*bank\b/i, /\bgxbank\b/i] },
  { id: 'boostbank', name: 'Boost Bank', country: 'MY', signature: [/boost bank/i] },
  { id: 'aeonbank', name: 'AEON Bank', country: 'MY', signature: [/aeon bank/i] },
  { id: 'rytbank', name: 'Ryt Bank', country: 'MY', signature: [/\bryt bank\b/i] },
  {
    id: 'tng',
    name: "Touch 'n Go eWallet",
    country: 'MY',
    signature: [/touch\s*'?\s*n\s*'?\s*go/i, /\btngd\b/i, /tng ewallet/i],
    note: 'Wallet exports list a single signed amount column rather than debit/credit.',
  },
  { id: 'bigpay', name: 'BigPay', country: 'MY', signature: [/bigpay/i] },
  { id: 'grabpay', name: 'GrabPay', country: 'SG/MY', signature: [/grabpay/i, /grab pay/i] },
];

/** Names the source when it can, for the review screen's own label. Detection is cosmetic plus a parsing hint — never a gate. */
export function detectBank(text: string): BankProfile | null {
  const head = String(text).slice(0, 4000);

  /** Earliest character offset at which any of these patterns matches. */
  const earliest = (patterns: RegExp[]): number => {
    let at = Infinity;
    for (const re of patterns) {
      const i = head.search(re);
      if (i >= 0 && i < at) at = i;
    }
    return at;
  };

  let best: { bank: BankProfile; at: number; weak: number } | null = null;
  let fallback: { bank: BankProfile; weak: number; at: number } | null = null;

  for (const bank of BANKS) {
    const weak = (bank.weakSignature || []).filter((re) => re.test(head)).length;
    // Whoever is named *first* is the issuer. A bank's name turns up inside
    // transaction rows constantly — a Touch 'n Go export whose first row
    // reads "Reload from Maybank" is still a Touch 'n Go export, and the
    // giveaway is that "Touch 'n Go" sits in the letterhead above it.
    const at = earliest(bank.signature);

    if (at !== Infinity) {
      if (!best || at < best.at || (at === best.at && weak > best.weak)) {
        best = { bank, at, weak };
      }
      continue;
    }

    // No name anywhere, but the layout still gives it away: a DBS CSV export
    // often never writes "DBS", and is recognised by its own column wording
    // ("Transaction Ref1") instead. Only consulted when nothing was named.
    if (weak > 0) {
      const weakAt = earliest(bank.weakSignature || []);
      if (!fallback || weak > fallback.weak || (weak === fallback.weak && weakAt < fallback.at)) {
        fallback = { bank, weak, at: weakAt };
      }
    }
  }

  return best ? best.bank : fallback ? fallback.bank : null;
}

/** A statement period stated in the preamble, for exports whose rows omit the year. */
export function detectPeriodYear(text: string): number | null {
  const head = String(text).slice(0, 4000);
  const years = [...head.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  if (!years.length) return null;
  const now = new Date().getFullYear();
  const usable = years.filter((y) => y >= 2000 && y <= now + 1);
  return usable.length ? Math.max(...usable) : null;
}

const normalise = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Score how well a header cell matches a role. Exact beats prefix beats
 * contains, so "Debit Amount" can never be claimed by the "amount" role.
 */
export function scoreHeader(cell: string, role: ColumnRole): number {
  const value = normalise(cell);
  if (!value) return 0;
  let best = 0;
  for (const alias of COLUMN_ALIASES[role] || []) {
    if (value === alias) best = Math.max(best, 100);
    else if (value.startsWith(alias) || value.endsWith(alias)) best = Math.max(best, 70);
    else if (value.includes(alias)) best = Math.max(best, 50);
  }
  return best;
}

export const ROLES = Object.keys(COLUMN_ALIASES) as ColumnRole[];
