import * as SQLite from 'expo-sqlite';

import { allocateSavings } from './autoSave';
import { todayKey } from './dateUtils';
import { cents, fromCents } from './money';

export type EventRow = {
  id: string;
  title: string;
  notes: string;
  date: string; // YYYY-MM-DD (start day)
  startTime: string | null; // HH:MM, null when all-day
  endTime: string | null; // HH:MM, null when all-day
  allDay: number; // 0 | 1
  color: string;
  /**
   * Minutes before the event to send a reminder; null for no reminder.
   * All-day events measure the offset from 9am on the day, since midnight
   * would put every "on the day" reminder in the middle of the night.
   */
  reminderMinutes: number | null;
};

/** Someone you split bills with. You yourself are never a row here — see `ME`. */
export type PersonRow = {
  id: string;
  name: string;
  createdAt: number;
};

export type SharedExpenseRow = {
  id: string;
  description: string;
  amount: number; // the whole bill, not your share
  category: string;
  date: string; // YYYY-MM-DD
  paidBy: string; // person id, or ME
  createdAt: number;
  /** 1 when your share is also posted as a personal expense. */
  countsAsMine: number;
  /** id of that personal expense, so it can be updated and removed in step. */
  linkedExpenseId: string | null;
  /** 1 when this bill repeats every month (rent, utilities, subscriptions). */
  repeatsMonthly: number;
  /** Last month (YYYY-MM) a copy was posted for, so it posts once per month. */
  lastPostedMonth: string | null;
  /** How the shares were decided. Only affects editing; the split rows are the truth. */
  splitMode: 'even' | 'exact';
  /** The currency the bill was actually paid in. */
  currency: string;
  /**
   * Units of `homeCurrency` per 1 unit of `currency`, frozen when the bill was
   * entered. Stored rather than looked up so a settlement agreed on Tuesday
   * still adds up on Friday.
   */
  rate: number;
  /** `amount` converted at `rate` — what every split and balance is made of. */
  homeAmount: number;
  /** The app currency at the time, so a later switch can be spotted. */
  homeCurrency: string;
  /**
   * When everyone squared up on this bill, or null while it's outstanding.
   * Settled bills stay in the list as history but drop out of the balances,
   * because the money has already changed hands.
   */
  settledAt: number | null;
};

/**
 * Money actually handed over between two people to clear a debt.
 *
 * Distinct from marking a bill settled: a payment is its own event with its
 * own date and amount, and one payment can clear a slice of many bills at
 * once — which is how people really settle up ("here's $50 for everything").
 */
export type PaymentRow = {
  id: string;
  fromPerson: string; // person id, or ME
  toPerson: string;
  amount: number;
  date: string; // YYYY-MM-DD
  note: string;
  createdAt: number;
};

/** One participant's portion of one shared expense. */
export type SharedSplitRow = {
  id: string;
  sharedId: string;
  personId: string; // person id, or ME
  shareAmount: number;
};

/**
 * Somewhere money sits, or somewhere it is owed.
 *
 * `balance` is always stored positive; whether it counts as an asset or a
 * debt is decided by `kind`. Storing a card balance as a negative number
 * reads fine in a table and terribly in an input, where a user has to
 * remember to type a minus sign or silently invert their net worth.
 */
export type AccountRow = {
  id: string;
  name: string;
  kind: string;
  balance: number;
  note: string;
  /** Annual interest rate as a percentage. Only meaningful for liabilities. */
  apr: number;
  /** The monthly payment being made against it. */
  minPayment: number;
  /**
   * The date the balance was true. Spending recorded after it adjusts the
   * figure; spending before it is already baked in, which is what stops an
   * imported statement being counted twice.
   */
  balanceAsOf: string | null;
  /** 1 on the account day-to-day spending comes out of. At most one. */
  isEveryday: number;
  createdAt: number;
  updatedAt: number;
};

/**
 * What you were worth at the end of one month.
 *
 * Accounts hold a single current balance, which answers "what am I worth" but
 * never "am I getting anywhere". Keeping one row per month turns the figure
 * into a trend without asking the user to record anything.
 */
export type NetWorthSnapshot = {
  month: string; // YYYY-MM
  assets: number;
  liabilities: number;
  net: number;
  capturedAt: number;
};

/** Something being saved for, optionally by a date. */
export type GoalRow = {
  id: string;
  name: string;
  target: number;
  saved: number;
  dueDate: string | null; // YYYY-MM-DD
  createdAt: number;
};

/** A monthly spending limit for one expense category. */
export type BudgetRow = {
  category: string;
  amount: number;
  createdAt: number;
};

export type DocRow = {
  id: string;
  title: string;
  body: string;
  updatedAt: number; // epoch ms
};

export type ExpenseRow = {
  id: string;
  amount: number;
  category: string;
  note: string;
  date: string; // YYYY-MM-DD
  createdAt: number; // epoch ms
  recurringId: string | null; // set when auto-posted from a recurring expense
};

export type RecurringRow = {
  id: string;
  amount: number;
  category: string;
  label: string;
  dayOfMonth: number; // 1-31, clamped to the month's real length
  active: number; // 0 | 1
  createdAt: number; // epoch ms
  /**
   * YYYY-MM of the last month this rule posted, or null before it ever has.
   *
   * Inferring it from whether an expense exists made a deleted bill look like a
   * rule that had never fired, so the next visit to Home posted it again and the
   * row would not stay deleted.
   */
  lastPostedMonth?: string | null;
};

/**
 * A standing income: what arrives, on which day of the month.
 *
 * The twin of RecurringRow. Bills posted themselves and pay did not, so the
 * app could watch three paydays go by and report that nothing had come in.
 * The rule that says "$2,192 on the 9th" is also what the pay cycle is
 * measured from — there is no separate payday setting any more.
 */
export type RecurringIncomeRow = {
  id: string;
  amount: number;
  source: string; // e.g. "Acme Ltd"
  category: string; // one of INCOME_CATEGORIES
  dayOfMonth: number; // 1-31, clamped to the month's real length
  active: number; // 0 | 1
  createdAt: number; // epoch ms
  /**
   * YYYY-MM of the last month this rule posted, or null before it ever has.
   *
   * The rule remembers firing rather than the app inferring it from whether a
   * row happens to exist. Asking "is there income for this month" turned a
   * deleted row into a rule that had never fired, so the next visit to Home
   * posted it again and the row you deleted came back.
   */
  lastPostedMonth?: string | null;
};

export type IncomeRow = {
  id: string;
  amount: number;
  source: string; // free text label, e.g. "Paycheck from Acme"
  category: string; // one of INCOME_CATEGORIES
  note: string;
  date: string; // YYYY-MM-DD
  createdAt: number; // epoch ms
  recurringId?: string | null; // set when auto-posted from a recurring income
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    // A failed open must not stay cached. Holding on to a rejected promise
    // means one transient failure poisons every read and write for the rest
    // of the session — and since screens render empty on error, the app just
    // looks like it lost your data. Clearing it lets the next call retry.
    dbPromise = openDb().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

function openDb() {
  return SQLite.openDatabaseAsync('planner.db').then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          date TEXT NOT NULL,
          startTime TEXT,
          endTime TEXT,
          allDay INTEGER NOT NULL DEFAULT 0,
          color TEXT NOT NULL DEFAULT '#2563eb',
          reminderMinutes INTEGER
        );
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          updatedAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY NOT NULL,
          amount REAL NOT NULL,
          category TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          date TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          recurringId TEXT
        );
        CREATE TABLE IF NOT EXISTS recurring_expenses (
          id TEXT PRIMARY KEY NOT NULL,
          amount REAL NOT NULL,
          category TEXT NOT NULL,
          label TEXT NOT NULL DEFAULT '',
          dayOfMonth INTEGER NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          createdAt INTEGER NOT NULL,
          lastPostedMonth TEXT
        );
        CREATE TABLE IF NOT EXISTS recurring_income (
          id TEXT PRIMARY KEY NOT NULL,
          amount REAL NOT NULL,
          source TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT 'salary',
          dayOfMonth INTEGER NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          createdAt INTEGER NOT NULL,
          lastPostedMonth TEXT
        );
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          kind TEXT NOT NULL,
          balance REAL NOT NULL DEFAULT 0,
          note TEXT NOT NULL DEFAULT '',
          apr REAL NOT NULL DEFAULT 0,
          minPayment REAL NOT NULL DEFAULT 0,
          balanceAsOf TEXT,
          isEveryday INTEGER NOT NULL DEFAULT 0,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS net_worth_snapshots (
          month TEXT PRIMARY KEY NOT NULL,
          assets REAL NOT NULL,
          liabilities REAL NOT NULL,
          net REAL NOT NULL,
          capturedAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS goals (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          target REAL NOT NULL DEFAULT 0,
          saved REAL NOT NULL DEFAULT 0,
          dueDate TEXT,
          createdAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS budgets (
          category TEXT PRIMARY KEY NOT NULL,
          amount REAL NOT NULL,
          createdAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS people (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          createdAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS shared_expenses (
          id TEXT PRIMARY KEY NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          amount REAL NOT NULL,
          category TEXT NOT NULL DEFAULT 'other',
          date TEXT NOT NULL,
          paidBy TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          countsAsMine INTEGER NOT NULL DEFAULT 0,
          linkedExpenseId TEXT,
          splitMode TEXT NOT NULL DEFAULT 'even',
          settledAt INTEGER,
          currency TEXT NOT NULL DEFAULT '',
          rate REAL NOT NULL DEFAULT 1,
          homeAmount REAL,
          homeCurrency TEXT NOT NULL DEFAULT '',
          repeatsMonthly INTEGER NOT NULL DEFAULT 0,
          lastPostedMonth TEXT
        );
        CREATE TABLE IF NOT EXISTS payments (
          id TEXT PRIMARY KEY NOT NULL,
          fromPerson TEXT NOT NULL,
          toPerson TEXT NOT NULL,
          amount REAL NOT NULL,
          date TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          createdAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS shared_splits (
          id TEXT PRIMARY KEY NOT NULL,
          sharedId TEXT NOT NULL,
          personId TEXT NOT NULL,
          shareAmount REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_shared_splits_shared ON shared_splits(sharedId);
        CREATE TABLE IF NOT EXISTS income (
          id TEXT PRIMARY KEY NOT NULL,
          amount REAL NOT NULL,
          source TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT 'other',
          note TEXT NOT NULL DEFAULT '',
          date TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          recurringId TEXT
        );
        -- Every dated query in the app filters or sorts on these, and they are
        -- the only tables that grow without bound: one statement import adds
        -- hundreds of rows. Without them SQLite scans and sorts the whole
        -- table for Home, History, budgets and the category breakdown alike.
        CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date DESC, createdAt DESC);
        CREATE INDEX IF NOT EXISTS idx_income_date ON income(date DESC, createdAt DESC);
        CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
        CREATE INDEX IF NOT EXISTS idx_shared_expenses_date ON shared_expenses(date DESC, createdAt DESC);
        CREATE INDEX IF NOT EXISTS idx_expenses_recurring ON expenses(recurringId);
      `);
      // Upgrade paths for tables created before a column existed. Each one
      // throws harmlessly once the column is already there.
      try {
        await db.execAsync('ALTER TABLE income ADD COLUMN recurringId TEXT');
      } catch {
        // Already there.
      }
      try {
        await db.execAsync('ALTER TABLE recurring_income ADD COLUMN lastPostedMonth TEXT');
      } catch {
        // Already there.
      }
      try {
        await db.execAsync('ALTER TABLE recurring_expenses ADD COLUMN lastPostedMonth TEXT');
      } catch {
        // Already there.
      }
      try {
        await db.execAsync('ALTER TABLE expenses ADD COLUMN recurringId TEXT');
      } catch {
        // column already exists
      }
      try {
        await db.execAsync('ALTER TABLE events ADD COLUMN reminderMinutes INTEGER');
      } catch {
        // column already exists
      }
      try {
        await db.execAsync(
          "ALTER TABLE shared_expenses ADD COLUMN splitMode TEXT NOT NULL DEFAULT 'even'"
        );
      } catch {
        // column already exists
      }
      try {
        await db.execAsync('ALTER TABLE shared_expenses ADD COLUMN settledAt INTEGER');
      } catch {
        // column already exists
      }
      try {
        await db.execAsync(
          "ALTER TABLE income ADD COLUMN category TEXT NOT NULL DEFAULT 'other'"
        );
      } catch {
        // column already exists
      }
      try {
        await db.execAsync(
          'ALTER TABLE shared_expenses ADD COLUMN repeatsMonthly INTEGER NOT NULL DEFAULT 0'
        );
      } catch {
        // column already exists
      }
      try {
        await db.execAsync('ALTER TABLE shared_expenses ADD COLUMN lastPostedMonth TEXT');
      } catch {
        // column already exists
      }
      // Bills entered before multi-currency were in whatever the app currency
      // was, at parity with itself. An empty code means "the app's own", which
      // is what `sharedCurrency` resolves at read time.
      try {
        await db.execAsync("ALTER TABLE shared_expenses ADD COLUMN currency TEXT NOT NULL DEFAULT ''");
      } catch {
        // column already exists
      }
      try {
        await db.execAsync('ALTER TABLE shared_expenses ADD COLUMN rate REAL NOT NULL DEFAULT 1');
      } catch {
        // column already exists
      }
      try {
        await db.execAsync('ALTER TABLE shared_expenses ADD COLUMN homeAmount REAL');
      } catch {
        // column already exists
      }
      try {
        await db.execAsync("ALTER TABLE shared_expenses ADD COLUMN homeCurrency TEXT NOT NULL DEFAULT ''");
      } catch {
        // column already exists
      }
      try {
        await db.execAsync('ALTER TABLE accounts ADD COLUMN apr REAL NOT NULL DEFAULT 0');
      } catch {
        // column already exists
      }
      try {
        await db.execAsync('ALTER TABLE accounts ADD COLUMN minPayment REAL NOT NULL DEFAULT 0');
      } catch {
        // column already exists
      }
      try {
        await db.execAsync('ALTER TABLE accounts ADD COLUMN balanceAsOf TEXT');
      } catch {
        // column already exists
      }
      try {
        await db.execAsync('ALTER TABLE accounts ADD COLUMN isEveryday INTEGER NOT NULL DEFAULT 0');
      } catch {
        // column already exists
      }
      // Indexes on columns that only exist after the upgrades above. Creating
      // them in the batch that makes the tables would abort it on an older
      // database, where the column does not arrive until the ALTER runs.
      await db.execAsync(
        'CREATE INDEX IF NOT EXISTS idx_income_recurring ON income(recurringId);'
      );

      // Confirm the schema is really there before handing the connection out.
      // A connection can open successfully and still have no tables behind it
      // — if the underlying file is replaced while the app holds it open, for
      // instance — and without this check that surfaces much later as a bare
      // "no such table" from whichever screen happens to write first.
      const table = await db.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'expenses'"
      );
      if (!table) {
        throw new Error('The database could not be set up. Restart the app and try again.');
      }
      return db;
    });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Events ----------

export async function listEvents(): Promise<EventRow[]> {
  const db = await getDb();
  return db.getAllAsync<EventRow>(
    'SELECT * FROM events ORDER BY date ASC, (startTime IS NULL) DESC, startTime ASC'
  );
}

export async function eventsForDate(date: string): Promise<EventRow[]> {
  const db = await getDb();
  return db.getAllAsync<EventRow>(
    'SELECT * FROM events WHERE date = ? ORDER BY (startTime IS NULL) DESC, startTime ASC',
    [date]
  );
}

/**
 * Events from a day onwards, soonest first.
 *
 * The calendar's list used to show one day at a time, which meant an empty
 * panel on every day nothing happened — most of them. What people want under
 * a calendar is what is coming, not what a particular square holds.
 */
export async function eventsFrom(startDate: string, limit = 25): Promise<EventRow[]> {
  const db = await getDb();
  return db.getAllAsync<EventRow>(
    `SELECT * FROM events WHERE date >= ?
     ORDER BY date ASC, (startTime IS NULL) DESC, startTime ASC
     LIMIT ?`,
    [startDate, limit]
  );
}

export async function upsertEvent(e: EventRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO events (id, title, notes, date, startTime, endTime, allDay, color, reminderMinutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title, notes=excluded.notes, date=excluded.date,
       startTime=excluded.startTime, endTime=excluded.endTime,
       allDay=excluded.allDay, color=excluded.color,
       reminderMinutes=excluded.reminderMinutes`,
    // `?? null` because backups written before reminders existed have no such
    // field, and binding undefined is an error rather than a null.
    [
      e.id,
      e.title,
      e.notes,
      e.date,
      e.startTime,
      e.endTime,
      e.allDay,
      e.color,
      e.reminderMinutes ?? null,
    ]
  );
}

export async function deleteEvent(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM events WHERE id = ?', [id]);
}

// ---------- Shared expenses ----------

export async function listPeople(): Promise<PersonRow[]> {
  const db = await getDb();
  return db.getAllAsync<PersonRow>('SELECT * FROM people ORDER BY name COLLATE NOCASE ASC');
}

export async function upsertPerson(p: PersonRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO people (id, name, createdAt) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name`,
    [p.id, p.name, p.createdAt]
  );
}

/**
 * Removes someone and every trace of them from the ledger.
 *
 * Their splits go too: leaving orphaned splits behind would keep charging a
 * person who is no longer listed, and the balances would never reconcile.
 * Bills they *paid* are deleted outright, because a shared expense with no
 * payer cannot be split or settled meaningfully.
 */
export async function deletePerson(id: string): Promise<void> {
  const db = await getDb();
  const paid = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM shared_expenses WHERE paidBy = ?',
    [id]
  );
  for (const row of paid) await deleteSharedExpense(row.id);
  await db.runAsync('DELETE FROM payments WHERE fromPerson = ? OR toPerson = ?', [id, id]);
  await db.runAsync('DELETE FROM shared_splits WHERE personId = ?', [id]);
  await db.runAsync('DELETE FROM people WHERE id = ?', [id]);
}

export async function listPayments(): Promise<PaymentRow[]> {
  const db = await getDb();
  return db.getAllAsync<PaymentRow>('SELECT * FROM payments ORDER BY date DESC, createdAt DESC');
}

export async function upsertPayment(p: PaymentRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO payments (id, fromPerson, toPerson, amount, date, note, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       fromPerson=excluded.fromPerson, toPerson=excluded.toPerson,
       amount=excluded.amount, date=excluded.date, note=excluded.note`,
    [p.id, p.fromPerson, p.toPerson, p.amount, p.date, p.note, p.createdAt]
  );
}

export async function deletePayment(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM payments WHERE id = ?', [id]);
}

export async function listSharedExpenses(): Promise<SharedExpenseRow[]> {
  const db = await getDb();
  return db.getAllAsync<SharedExpenseRow>(
    'SELECT * FROM shared_expenses ORDER BY date DESC, createdAt DESC'
  );
}

export async function getSharedExpense(id: string): Promise<SharedExpenseRow | null> {
  const db = await getDb();
  return db.getFirstAsync<SharedExpenseRow>('SELECT * FROM shared_expenses WHERE id = ?', [id]);
}

export async function listSplits(): Promise<SharedSplitRow[]> {
  const db = await getDb();
  return db.getAllAsync<SharedSplitRow>('SELECT * FROM shared_splits');
}

export async function splitsFor(sharedId: string): Promise<SharedSplitRow[]> {
  const db = await getDb();
  return db.getAllAsync<SharedSplitRow>('SELECT * FROM shared_splits WHERE sharedId = ?', [
    sharedId,
  ]);
}

/** Writes the expense and replaces its splits wholesale, as one unit. */
export async function upsertSharedExpense(
  e: SharedExpenseRow,
  splits: SharedSplitRow[]
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO shared_expenses
       (id, description, amount, category, date, paidBy, createdAt, countsAsMine,
        linkedExpenseId, splitMode, settledAt, repeatsMonthly, lastPostedMonth,
        currency, rate, homeAmount, homeCurrency)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       description=excluded.description, amount=excluded.amount,
       category=excluded.category, date=excluded.date, paidBy=excluded.paidBy,
       countsAsMine=excluded.countsAsMine, linkedExpenseId=excluded.linkedExpenseId,
       splitMode=excluded.splitMode, settledAt=excluded.settledAt,
       repeatsMonthly=excluded.repeatsMonthly, lastPostedMonth=excluded.lastPostedMonth,
       currency=excluded.currency, rate=excluded.rate,
       homeAmount=excluded.homeAmount, homeCurrency=excluded.homeCurrency`,
    [
      e.id,
      e.description,
      e.amount,
      e.category,
      e.date,
      e.paidBy,
      e.createdAt,
      e.countsAsMine,
      e.linkedExpenseId ?? null,
      e.splitMode ?? 'even',
      e.settledAt ?? null,
      e.repeatsMonthly ?? 0,
      e.lastPostedMonth ?? null,
      e.currency ?? '',
      e.rate ?? 1,
      // Null rather than a guess: a row written before conversion existed is
      // read back as its own amount, which is what it was.
      e.homeAmount ?? null,
      e.homeCurrency ?? '',
    ]
  );
  // Replaced rather than merged: an edit can drop participants, and a stale
  // split left behind would keep them owing money on a bill they're off.
  await db.runAsync('DELETE FROM shared_splits WHERE sharedId = ?', [e.id]);
  for (const s of splits) {
    await db.runAsync(
      'INSERT INTO shared_splits (id, sharedId, personId, shareAmount) VALUES (?, ?, ?, ?)',
      [s.id, s.sharedId, s.personId, s.shareAmount]
    );
  }
}

/** Marks one bill as squared up, or reopens it. */
export async function setSharedSettled(id: string, settled: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE shared_expenses SET settledAt = ? WHERE id = ?', [
    settled ? Date.now() : null,
    id,
  ]);
}

export async function deleteSharedExpense(id: string): Promise<void> {
  const db = await getDb();
  const row = await getSharedExpense(id);
  // The personal expense mirroring your share has to go with it, or deleting a
  // shared bill would leave phantom spending in your own totals forever.
  if (row?.linkedExpenseId) await deleteExpense(row.linkedExpenseId);
  await db.runAsync('DELETE FROM shared_splits WHERE sharedId = ?', [id]);
  await db.runAsync('DELETE FROM shared_expenses WHERE id = ?', [id]);
}

// ---------- Documents ----------

export async function listDocs(): Promise<DocRow[]> {
  const db = await getDb();
  return db.getAllAsync<DocRow>('SELECT * FROM documents ORDER BY updatedAt DESC');
}

export async function getDoc(id: string): Promise<DocRow | null> {
  const db = await getDb();
  return db.getFirstAsync<DocRow>('SELECT * FROM documents WHERE id = ?', [id]);
}

export async function createDoc(): Promise<DocRow> {
  const db = await getDb();
  const doc: DocRow = { id: uid(), title: '', body: '', updatedAt: Date.now() };
  await db.runAsync(
    'INSERT INTO documents (id, title, body, updatedAt) VALUES (?, ?, ?, ?)',
    [doc.id, doc.title, doc.body, doc.updatedAt]
  );
  return doc;
}

export async function saveDoc(id: string, title: string, body: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE documents SET title = ?, body = ?, updatedAt = ? WHERE id = ?',
    [title, body, Date.now(), id]
  );
}

export async function deleteDoc(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM documents WHERE id = ?', [id]);
}

export async function upsertDoc(d: DocRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO documents (id, title, body, updatedAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title, body=excluded.body, updatedAt=excluded.updatedAt`,
    [d.id, d.title, d.body, d.updatedAt]
  );
}

// ---------- Settings (key/value) ----------

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM settings WHERE key = ?', [key]);
}

export async function listAllSettings(): Promise<{ key: string; value: string }[]> {
  const db = await getDb();
  return db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
}

// ---------- Payday / onboarding ----------

export const KEYS = {
  onboardingComplete: 'onboardingComplete',
  salaryAmount: 'salaryAmount',
  salaryDay: 'salaryDay',
  notificationsEnabled: 'notificationsEnabled',
  profileName: 'profileName',
  profileAvatar: 'profileAvatar',
  homeCardOrder: 'homeCardOrder',
  cycleDay: 'cycleDay',
  fxRates: 'fxRates',
  savingsPerCycle: 'savingsPerCycle',
  /** The cycle most recently credited, so a cycle is never credited twice. */
  savingsCreditedFor: 'savingsCreditedFor',
} as const;

export type Profile = {
  name: string;
  /**
   * The picture itself as a data URI, not a path to it.
   *
   * A file:// path would break the moment the OS cleared its cache, and would
   * be meaningless in a backup restored on another phone — the picture has to
   * travel with the data. Avatars are small and the picker downscales, so the
   * cost of inlining is a few tens of KB.
   */
  avatar: string | null;
};

export async function getProfile(): Promise<Profile> {
  const [name, avatar] = await Promise.all([
    getSetting(KEYS.profileName),
    getSetting(KEYS.profileAvatar),
  ]);
  return { name: name ?? '', avatar: avatar || null };
}

export async function setProfile(profile: Profile): Promise<void> {
  await setSetting(KEYS.profileName, profile.name.trim());
  await setSetting(KEYS.profileAvatar, profile.avatar ?? '');
}

export type Payday = { amount: number | null; day: number | null };

/**
 * The pay cycle, read off the recurring income rules.
 *
 * There used to be a separate "pay rhythm" holding an amount and a day that
 * did nothing but draw a countdown — you told the app when you were paid and
 * it still never recorded being paid. Now one rule does both: it posts the
 * money and it says where the cycle turns.
 *
 * The amount is everything expected in a cycle, since that is what a cycle's
 * spending is measured against. The day belongs to the largest rule, because
 * a cycle turns on the payslip, not on a small dividend that happens to land
 * earlier.
 */
export async function getPayday(): Promise<Payday> {
  const rules = (await listRecurringIncome()).filter((r) => r.active);
  if (rules.length === 0) return { amount: null, day: null };

  const total = rules.reduce((sum, r) => sum + cents(r.amount), 0) / 100;
  const main = rules.reduce((biggest, r) => (r.amount > biggest.amount ? r : biggest));
  return { amount: total > 0 ? total : null, day: main.dayOfMonth };
}

/**
 * Carries a pre-rules pay rhythm into a rule, once.
 *
 * Anyone who had already entered a salary and a payday would otherwise open
 * the app to an empty cycle and a Home screen that had forgotten their money.
 * The old settings are cleared as they are converted, so this cannot run
 * twice, and it stays out of the way of anyone who has already made a rule.
 */
export function migratePaydayToRule(): Promise<void> {
  // Reads the old settings, checks no rule exists, then writes one — the same
  // check-then-act the posters had, and the same race: two Home focuses could
  // both find nothing and both convert. It shares their lock.
  return serialised(convertPaydaySetting);
}

async function convertPaydaySetting(): Promise<void> {
  const [amount, day] = await Promise.all([
    getSetting(KEYS.salaryAmount),
    getSetting(KEYS.salaryDay),
  ]);
  if (amount == null && day == null) return;

  const value = amount != null && amount !== '' ? Number(amount) : 0;
  const dayOfMonth = day != null && day !== '' ? Number(day) : 0;
  const existing = await listRecurringIncome();
  if (existing.length === 0 && value > 0 && dayOfMonth >= 1 && dayOfMonth <= 31) {
    await upsertRecurringIncome({
      id: uid(),
      amount: value,
      source: 'Salary',
      category: 'salary',
      dayOfMonth,
      active: 1,
      createdAt: Date.now(),
    });
  }
  await deleteSetting(KEYS.salaryAmount);
  await deleteSetting(KEYS.salaryDay);
}

export async function getNotificationsEnabled(): Promise<boolean> {
  return (await getSetting(KEYS.notificationsEnabled)) === 'true';
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await setSetting(KEYS.notificationsEnabled, enabled ? 'true' : 'false');
}

// ---------- Expenses ----------

export async function listAllExpenses(): Promise<ExpenseRow[]> {
  const db = await getDb();
  return db.getAllAsync<ExpenseRow>('SELECT * FROM expenses ORDER BY date DESC, createdAt DESC');
}

/**
 * Dated rows from a day onwards, for the live-balance adjustment.
 *
 * That adjustment only ever looks at what happened after the balance was
 * stated, but it used to be handed every expense and every income row in the
 * database and left to filter them in JavaScript — the whole table read into
 * memory on every visit to Home, growing with each statement import. The
 * filter belongs in the query.
 */
export async function expensesSince(date: string): Promise<ExpenseRow[]> {
  const db = await getDb();
  return db.getAllAsync<ExpenseRow>('SELECT * FROM expenses WHERE date >= ?', [date]);
}

export async function incomeSince(date: string): Promise<IncomeRow[]> {
  const db = await getDb();
  return db.getAllAsync<IncomeRow>('SELECT * FROM income WHERE date >= ?', [date]);
}

export async function expensesBetween(startDate: string, endDate: string): Promise<ExpenseRow[]> {
  const db = await getDb();
  return db.getAllAsync<ExpenseRow>(
    'SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date DESC, createdAt DESC',
    [startDate, endDate]
  );
}

/**
 * Total number of transactions on record, expenses and income together.
 *
 * Home's panels are all windowed — today, this pay cycle, the last 14 days —
 * so without knowing the overall total it cannot tell "you have no data" apart
 * from "your data is older than the window", and it used to report the second
 * as the first. Comparing this against what's actually on screen is also how
 * it works out how many transactions are left over in History.
 */
/**
 * Everything earned and everything spent, over all time.
 *
 * "Saved so far" is deliberately cumulative rather than tied to the current
 * pay cycle: the point of importing a statement is that the history you bring
 * in counts, and a cycle-scoped figure silently ignores anything dated before
 * this month.
 */
export async function lifetimeTotals(): Promise<{ income: number; expenses: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ income: number; expenses: number }>(
    `SELECT
       (SELECT COALESCE(SUM(amount), 0) FROM income)   AS income,
       (SELECT COALESCE(SUM(amount), 0) FROM expenses) AS expenses`
  );
  return { income: row?.income ?? 0, expenses: row?.expenses ?? 0 };
}

export async function countTransactions(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM expenses) + (SELECT COUNT(*) FROM income) AS n`
  );
  return row?.n ?? 0;
}

export async function recentExpenses(limit = 5): Promise<ExpenseRow[]> {
  const db = await getDb();
  return db.getAllAsync<ExpenseRow>(
    'SELECT * FROM expenses ORDER BY date DESC, createdAt DESC LIMIT ?',
    [limit]
  );
}

export async function getExpense(id: string): Promise<ExpenseRow | null> {
  const db = await getDb();
  return db.getFirstAsync<ExpenseRow>('SELECT * FROM expenses WHERE id = ?', [id]);
}

export async function upsertExpense(e: ExpenseRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO expenses (id, amount, category, note, date, createdAt, recurringId)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       amount=excluded.amount, category=excluded.category,
       note=excluded.note, date=excluded.date`,
    [e.id, e.amount, e.category, e.note, e.date, e.createdAt, e.recurringId]
  );
}

export async function deleteExpense(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
}

// ---------- Recurring expenses ----------
// A recurring rule auto-posts a real expense row once its day-of-month
// arrives, so it flows through the normal spending totals, trends and Recent
// list with no special-casing anywhere else.

export async function listRecurring(): Promise<RecurringRow[]> {
  const db = await getDb();
  return db.getAllAsync<RecurringRow>(
    'SELECT * FROM recurring_expenses ORDER BY dayOfMonth ASC'
  );
}

export async function getRecurring(id: string): Promise<RecurringRow | null> {
  const db = await getDb();
  return db.getFirstAsync<RecurringRow>(
    'SELECT * FROM recurring_expenses WHERE id = ?',
    [id]
  );
}

export async function upsertRecurring(r: RecurringRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO recurring_expenses
       (id, amount, category, label, dayOfMonth, active, createdAt, lastPostedMonth)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       amount=excluded.amount, category=excluded.category, label=excluded.label,
       dayOfMonth=excluded.dayOfMonth, active=excluded.active`,
    [
      r.id, r.amount, r.category, r.label, r.dayOfMonth, r.active, r.createdAt,
      r.lastPostedMonth ?? null,
    ]
  );
}

export async function deleteRecurring(id: string): Promise<void> {
  const db = await getDb();
  // The rule is removed; expenses it already posted stay as real history.
  await db.runAsync('DELETE FROM recurring_expenses WHERE id = ?', [id]);
}

/**
 * Posts one expense for every active recurring rule whose day-of-month has
 * arrived and hasn't already been posted this month. Safe to call often —
 * it's a no-op once a rule is caught up for the month. Returns the rules that
 * were newly posted (each paired with the expense it created), so callers
 * can notify about them.
 */
export function applyDueRecurring(): Promise<{ rule: RecurringRow; expense: ExpenseRow }[]> {
  return serialised(postDueRecurring);
}

async function postDueRecurring(): Promise<
  { rule: RecurringRow; expense: ExpenseRow }[]
> {
  const db = await getDb();
  const today = todayKey();
  const [y, m, d] = today.split('-').map(Number);
  const month = `${y}-${String(m).padStart(2, '0')}`;
  const lastDayOfMonth = new Date(y, m, 0).getDate();

  const posted: { rule: RecurringRow; expense: ExpenseRow }[] = [];
  const rules = await listRecurring();
  for (const r of rules) {
    if (!r.active) continue;
    const dueDay = Math.min(r.dayOfMonth, lastDayOfMonth);
    if (d < dueDay) continue;
    if (r.lastPostedMonth === month) continue;

    // Rules made before the rule remembered anything: look for the row once, so
    // an upgrade does not post this month a second time.
    if (r.lastPostedMonth == null) {
      const already = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM expenses WHERE recurringId = ? AND date >= ? AND date <= ?',
        [r.id, `${month}-01`, today]
      );
      if (already) {
        await db.runAsync('UPDATE recurring_expenses SET lastPostedMonth = ? WHERE id = ?', [
          month,
          r.id,
        ]);
        continue;
      }
    }

    const dueDate = `${month}-${String(dueDay).padStart(2, '0')}`;
    const expense: ExpenseRow = {
      id: uid(),
      amount: r.amount,
      category: r.category,
      note: r.label,
      date: dueDate,
      createdAt: Date.now(),
      recurringId: r.id,
    };
    await db.runAsync(
      `INSERT INTO expenses (id, amount, category, note, date, createdAt, recurringId)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [expense.id, expense.amount, expense.category, expense.note, expense.date, expense.createdAt, expense.recurringId]
    );
    // Marked straight after the row lands, so a crash between the two costs at
    // worst one duplicate rather than a rule that never posts again.
    await db.runAsync('UPDATE recurring_expenses SET lastPostedMonth = ? WHERE id = ?', [
      month,
      r.id,
    ]);
    posted.push({ rule: r, expense });
  }
  return posted;
}

// ---------- Recurring income ----------
// The mirror of recurring expenses: a rule posts a real income row once its
// day arrives, so pay flows through the same totals, trends and Recent list
// as anything typed by hand.

export async function listRecurringIncome(): Promise<RecurringIncomeRow[]> {
  const db = await getDb();
  return db.getAllAsync<RecurringIncomeRow>(
    'SELECT * FROM recurring_income ORDER BY dayOfMonth ASC'
  );
}

export async function getRecurringIncome(id: string): Promise<RecurringIncomeRow | null> {
  const db = await getDb();
  return db.getFirstAsync<RecurringIncomeRow>(
    'SELECT * FROM recurring_income WHERE id = ?',
    [id]
  );
}

export async function upsertRecurringIncome(r: RecurringIncomeRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO recurring_income
       (id, amount, source, category, dayOfMonth, active, createdAt, lastPostedMonth)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       amount=excluded.amount, source=excluded.source, category=excluded.category,
       dayOfMonth=excluded.dayOfMonth, active=excluded.active`,
    [
      r.id, r.amount, r.source, r.category, r.dayOfMonth, r.active, r.createdAt,
      r.lastPostedMonth ?? null,
    ]
  );
}

export async function deleteRecurringIncome(id: string): Promise<void> {
  const db = await getDb();
  // The rule goes; income it already posted stays as real history.
  await db.runAsync('DELETE FROM recurring_income WHERE id = ?', [id]);
}

/**
 * Posts one income row for every active rule whose day has arrived this month
 * and which has not already posted. The expense poster's logic exactly — the
 * asymmetry between the two was the bug this fixes.
 */
/**
 * Serialises the auto-posting so two runs cannot interleave.
 *
 * Every one of these is a check followed by a write, and Home fires them on
 * focus: two focuses in quick succession had both runs read "nothing posted
 * yet" before either wrote, and the same pay landed twice. Chaining them means
 * the second run reads what the first one did.
 */
let duePosting: Promise<unknown> = Promise.resolve();
function serialised<T>(work: () => Promise<T>): Promise<T> {
  const next = duePosting.then(work, work);
  duePosting = next.catch(() => undefined);
  return next;
}

export function applyDueIncome(): Promise<{ rule: RecurringIncomeRow; income: IncomeRow }[]> {
  return serialised(postDueIncome);
}

async function postDueIncome(): Promise<{ rule: RecurringIncomeRow; income: IncomeRow }[]> {
  const db = await getDb();
  const today = todayKey();
  const [y, m, d] = today.split('-').map(Number);
  const month = `${y}-${String(m).padStart(2, '0')}`;
  const lastDayOfMonth = new Date(y, m, 0).getDate();

  const posted: { rule: RecurringIncomeRow; income: IncomeRow }[] = [];
  for (const r of await listRecurringIncome()) {
    if (!r.active) continue;
    const dueDay = Math.min(r.dayOfMonth, lastDayOfMonth);
    if (d < dueDay) continue;
    if (r.lastPostedMonth === month) continue;

    // Rules made before the rule remembered anything: fall back to looking for
    // the row once, so an upgrade does not post this month a second time.
    if (r.lastPostedMonth == null) {
      const already = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM income WHERE recurringId = ? AND date >= ? AND date <= ?',
        [r.id, `${month}-01`, today]
      );
      if (already) {
        await db.runAsync('UPDATE recurring_income SET lastPostedMonth = ? WHERE id = ?', [
          month,
          r.id,
        ]);
        continue;
      }
    }

    const income: IncomeRow = {
      id: uid(),
      amount: r.amount,
      source: r.source,
      category: r.category,
      note: '',
      date: `${month}-${String(dueDay).padStart(2, '0')}`,
      createdAt: Date.now(),
      recurringId: r.id,
    };
    await upsertIncome(income);
    // Marked immediately after the row lands, so a crash between the two costs
    // at worst one duplicate rather than a rule that never posts again.
    await db.runAsync('UPDATE recurring_income SET lastPostedMonth = ? WHERE id = ?', [month, r.id]);
    posted.push({ rule: r, income });
  }
  return posted;
}

// ---------- Income ----------

export async function listAllIncome(): Promise<IncomeRow[]> {
  const db = await getDb();
  return db.getAllAsync<IncomeRow>('SELECT * FROM income ORDER BY date DESC, createdAt DESC');
}

export async function incomeBetween(startDate: string, endDate: string): Promise<IncomeRow[]> {
  const db = await getDb();
  return db.getAllAsync<IncomeRow>(
    'SELECT * FROM income WHERE date >= ? AND date <= ? ORDER BY date DESC, createdAt DESC',
    [startDate, endDate]
  );
}

export async function recentIncome(limit = 5): Promise<IncomeRow[]> {
  const db = await getDb();
  return db.getAllAsync<IncomeRow>(
    'SELECT * FROM income ORDER BY date DESC, createdAt DESC LIMIT ?',
    [limit]
  );
}

export async function getIncome(id: string): Promise<IncomeRow | null> {
  const db = await getDb();
  return db.getFirstAsync<IncomeRow>('SELECT * FROM income WHERE id = ?', [id]);
}

export async function upsertIncome(i: IncomeRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO income (id, amount, source, category, note, date, createdAt, recurringId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       amount=excluded.amount, source=excluded.source, category=excluded.category,
       note=excluded.note, date=excluded.date`,
    // `?? 'other'` because backups written before income had categories carry
    // no such field, and binding undefined is an error rather than a default.
    [i.id, i.amount, i.source, i.category ?? 'other', i.note, i.date, i.createdAt, i.recurringId ?? null]
  );
}

export async function deleteIncome(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM income WHERE id = ?', [id]);
}

export async function isOnboardingComplete(): Promise<boolean> {
  return (await getSetting(KEYS.onboardingComplete)) === 'true';
}

export async function markOnboardingComplete(): Promise<void> {
  await setSetting(KEYS.onboardingComplete, 'true');
}

/**
 * Posts a fresh copy of every monthly shared bill whose month has come round.
 *
 * Rent and utilities are the most-split bills there are, and re-entering them
 * with the same four people every month is exactly the sort of chore an app
 * should absorb. The original row acts as the template: it keeps
 * `repeatsMonthly`, and each copy is an ordinary one-off bill so it can be
 * edited or settled without disturbing the schedule.
 *
 * `lastPostedMonth` makes this safe to call as often as you like — opening the
 * tab five times in a day posts nothing extra. Catch-up is bounded to a year
 * so an app left closed for a long time doesn't produce an endless backlog.
 */
export async function applyDueSharedRecurring(): Promise<SharedExpenseRow[]> {
  const db = await getDb();
  const templates = await db.getAllAsync<SharedExpenseRow>(
    'SELECT * FROM shared_expenses WHERE repeatsMonthly = 1'
  );
  const today = todayKey();
  const [thisYear, thisMonth] = today.split('-').map(Number);
  const posted: SharedExpenseRow[] = [];

  for (const template of templates) {
    const [sy, sm, sd] = template.date.split('-').map(Number);
    const from = template.lastPostedMonth
      ? template.lastPostedMonth.split('-').map(Number)
      : [sy, sm];
    let [y, m] = from;
    let guard = 0;

    while (guard++ < 12) {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      if (y > thisYear || (y === thisYear && m > thisMonth)) break;

      // Clamp to the month's real length so a bill dated the 31st still posts
      // in February rather than silently rolling into March.
      const lastDay = new Date(y, m, 0).getDate();
      const day = Math.min(sd, lastDay);
      const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const splits = await splitsFor(template.id);
      const cloneId = uid();
      const clone: SharedExpenseRow = {
        ...template,
        id: cloneId,
        date,
        createdAt: Date.now(),
        settledAt: null,
        repeatsMonthly: 0,
        lastPostedMonth: null,
        // A fresh copy needs its own mirrored personal expense, not the
        // template's — sharing one id would overwrite last month's figure.
        linkedExpenseId: null,
      };
      await upsertSharedExpense(
        clone,
        splits.map((s) => ({ ...s, id: uid(), sharedId: cloneId }))
      );

      if (template.countsAsMine) {
        const mine = splits.find((s) => s.personId === 'me');
        if (mine && mine.shareAmount > 0) {
          const expenseId = uid();
          await upsertExpense({
            id: expenseId,
            amount: mine.shareAmount,
            category: template.category,
            note: template.description || 'Shared expense',
            date,
            createdAt: Date.now(),
            recurringId: null,
          });
          await db.runAsync('UPDATE shared_expenses SET linkedExpenseId = ? WHERE id = ?', [
            expenseId,
            cloneId,
          ]);
        }
      }

      await db.runAsync('UPDATE shared_expenses SET lastPostedMonth = ? WHERE id = ?', [
        `${y}-${String(m).padStart(2, '0')}`,
        template.id,
      ]);
      posted.push(clone);
    }
  }
  return posted;
}

/**
 * Clears the shared ledger — every bill, split and payment — for a fresh start
 * once a trip or a month is settled.
 *
 * Deliberately leaves your own expenses alone. Deleting a single shared bill
 * removes the personal expense mirroring your share, because that was a
 * mistake being undone. A reset is different: the group is finished, but you
 * really did spend your share, and wiping it would rewrite your own spending
 * history and move the savings figure on Home.
 *
 * People are kept by default — you tend to split with the same flatmates next
 * month — and can be removed individually under People.
 */
export async function resetSharedLedger(alsoPeople = false): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM shared_splits');
  await db.runAsync('DELETE FROM shared_expenses');
  await db.runAsync('DELETE FROM payments');
  if (alsoPeople) await db.runAsync('DELETE FROM people');
}

/**
 * Wipes every table and returns the app to its first-run state.
 *
 * Deliberately empties the tables rather than deleting the database file: the
 * connection stays valid, so no screen has to cope with the database vanishing
 * underneath it. The schema is left in place for the same reason.
 *
 * The onboarding flag goes too, so the app genuinely starts over rather than
 * landing on an empty dashboard.
 */
export async function eraseAllData(): Promise<void> {
  const db = await getDb();
  for (const table of [
    'events',
    'documents',
    'expenses',
    'recurring_expenses',
    'budgets',
    'accounts',
    'goals',
    'net_worth_snapshots',
    'income',
    'people',
    'shared_expenses',
    'shared_splits',
    'payments',
    'settings',
  ]) {
    await db.runAsync(`DELETE FROM ${table}`);
  }
}

// ---------- Budgets ----------

export async function listBudgets(): Promise<BudgetRow[]> {
  const db = await getDb();
  return db.getAllAsync<BudgetRow>('SELECT * FROM budgets');
}

/** Writes a limit, or clears it when the amount is zero or less. */
export async function setBudget(category: string, amount: number): Promise<void> {
  const db = await getDb();
  if (!(amount > 0)) {
    await db.runAsync('DELETE FROM budgets WHERE category = ?', [category]);
    return;
  }
  await db.runAsync(
    `INSERT INTO budgets (category, amount, createdAt) VALUES (?, ?, ?)
     ON CONFLICT(category) DO UPDATE SET amount=excluded.amount`,
    [category, amount, Date.now()]
  );
}

// ---------- Accounts ----------

export async function listAccounts(): Promise<AccountRow[]> {
  const db = await getDb();
  return db.getAllAsync<AccountRow>('SELECT * FROM accounts ORDER BY createdAt ASC');
}

export async function getAccount(id: string): Promise<AccountRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<AccountRow>('SELECT * FROM accounts WHERE id = ?', [id]);
  return row ?? null;
}

export async function upsertAccount(a: AccountRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO accounts
       (id, name, kind, balance, note, apr, minPayment, balanceAsOf, isEveryday, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, kind=excluded.kind, balance=excluded.balance,
       note=excluded.note, apr=excluded.apr, minPayment=excluded.minPayment,
       balanceAsOf=excluded.balanceAsOf, isEveryday=excluded.isEveryday,
       updatedAt=excluded.updatedAt`,
    // `?? 0` because a backup written before debt tracking carries neither
    // field, and binding undefined is an error rather than a default.
    [
      a.id,
      a.name,
      a.kind,
      a.balance,
      a.note,
      a.apr ?? 0,
      a.minPayment ?? 0,
      a.balanceAsOf ?? null,
      a.isEveryday ?? 0,
      a.createdAt,
      a.updatedAt,
    ]
  );
}

export async function deleteAccount(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM accounts WHERE id = ?', [id]);
}

// ---------- Goals ----------

export async function listGoals(): Promise<GoalRow[]> {
  const db = await getDb();
  return db.getAllAsync<GoalRow>('SELECT * FROM goals ORDER BY createdAt ASC');
}

export async function getGoal(id: string): Promise<GoalRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<GoalRow>('SELECT * FROM goals WHERE id = ?', [id]);
  return row ?? null;
}

export async function upsertGoal(g: GoalRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO goals (id, name, target, saved, dueDate, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, target=excluded.target,
       saved=excluded.saved, dueDate=excluded.dueDate`,
    [g.id, g.name, g.target, g.saved, g.dueDate ?? null, g.createdAt]
  );
}

export async function deleteGoal(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM goals WHERE id = ?', [id]);
}

// ---------- Net worth history ----------

export async function listNetWorthSnapshots(): Promise<NetWorthSnapshot[]> {
  const db = await getDb();
  return db.getAllAsync<NetWorthSnapshot>(
    'SELECT * FROM net_worth_snapshots ORDER BY month ASC'
  );
}

/**
 * Records where net worth stands for the month given.
 *
 * The current month is overwritten every time, so it always reflects today's
 * balances; earlier months were written when they *were* current and are left
 * alone. That means the history is honest about the past without going stale
 * about the present.
 */
export async function captureNetWorth(
  month: string,
  assets: number,
  liabilities: number
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO net_worth_snapshots (month, assets, liabilities, net, capturedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(month) DO UPDATE SET
       assets=excluded.assets, liabilities=excluded.liabilities,
       net=excluded.net, capturedAt=excluded.capturedAt`,
    [month, assets, liabilities, assets - liabilities, Date.now()]
  );
}

/** Only one account can be the everyday one, so setting it clears the rest. */
export async function setEverydayAccount(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE accounts SET isEveryday = 0');
  await db.runAsync('UPDATE accounts SET isEveryday = 1 WHERE id = ?', [id]);
}

/**
 * The day of the month the spending cycle restarts on.
 *
 * Payday is the obvious default and stays the default, but the two are not
 * always the same thing: people paid on the 25th often still think in calendar
 * months, and anyone paid weekly or irregularly needs a fixed reset day that
 * has nothing to do with when the money lands. Stored separately so changing
 * one never quietly changes the other.
 *
 * Null means "follow payday", and if there is no payday either, callers fall
 * back to the calendar month.
 */
export async function getCycleDayOverride(): Promise<number | null> {
  const raw = await getSetting(KEYS.cycleDay);
  if (raw == null || raw === '') return null;
  const day = Number(raw);
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null;
}

export async function setCycleDayOverride(day: number | null): Promise<void> {
  if (day == null) await deleteSetting(KEYS.cycleDay);
  else await setSetting(KEYS.cycleDay, String(day));
}

/** What the user says they set aside each cycle. Null when switched off. */
export async function getSavingsPerCycle(): Promise<number | null> {
  const raw = await getSetting(KEYS.savingsPerCycle);
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function setSavingsPerCycle(amount: number | null): Promise<void> {
  if (amount == null || !(amount > 0)) await deleteSetting(KEYS.savingsPerCycle);
  else await setSetting(KEYS.savingsPerCycle, String(amount));
}

/**
 * Credits this cycle's saving across the goals, once.
 *
 * Keyed on the cycle's start date rather than a timestamp: opening the app
 * five times in a month must not put the money in five times, and the cycle
 * a person is in is the thing that decides whether they have been paid yet.
 *
 * Missed cycles are not back-filled. Someone who did not open the app all
 * summer did not thereby save three months of money, and inventing it would
 * put a goal past its target on the strength of nothing.
 */
export function applyDueSavings(cycleStart: string): Promise<{ goal: GoalRow; add: number }[]> {
  return serialised(() => creditDueSavings(cycleStart));
}

/**
 * Credits a cycle of saving, once that cycle has actually passed.
 *
 * It used to pay out the moment you named an amount, which claimed progress
 * you had not made yet: say "$500 a cycle" on day one and the goals moved
 * before a single day of it had gone by. Saving happens over a cycle, so the
 * money lands when the cycle turns.
 *
 * The marker is the cycle the goals are paid up to. Setting it without paying
 * anything is how a new arrangement starts: it records where you are, and the
 * first credit comes at the next rollover.
 */
async function creditDueSavings(
  cycleStart: string
): Promise<{ goal: GoalRow; add: number }[]> {
  const amount = await getSavingsPerCycle();
  if (amount == null) return [];

  const paidUpTo = await getSetting(KEYS.savingsCreditedFor);
  if (paidUpTo == null) {
    await setSetting(KEYS.savingsCreditedFor, cycleStart);
    return [];
  }
  if (paidUpTo === cycleStart) return [];

  const allocations = allocateSavings(amount, await listGoals());
  for (const { goal, add } of allocations) {
    await upsertGoal({ ...goal, saved: fromCents(cents(goal.saved) + cents(add)) });
  }
  // Advanced whether or not anything took the money: the cycle has passed
  // either way, and a cycle with no goals in it is not one to pay twice.
  await setSetting(KEYS.savingsCreditedFor, cycleStart);
  return allocations;
}

/** The day cycles actually reset on: the override if set, else payday. */
export async function getCycleDay(): Promise<number | null> {
  const override = await getCycleDayOverride();
  if (override != null) return override;
  return (await getPayday()).day;
}
