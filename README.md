# planner-app

A mobile app with four tabs (**Home** is the one you land on):

- **🏠 Home** — the dashboard, and the first thing you see on open: a spending ring (today's spend, and as a share of your salary once it's set) that **swipes sideways to your total savings** — everything earned minus everything spent, with the ring showing how much of what you've earned has gone, "this cycle" / "saved so far" stat tiles (**saved so far** is cumulative — every dollar of income on record minus every dollar of expense, so an imported statement moves it), an **income this cycle** tile once you have any, insight tiles (spend trend vs yesterday, top category), and a Recent list mixing expenses and income from the **last 14 days**, each row colour-coded by category — expenses by where the money went, income by where it came from — or, when that window holds fewer than 15, simply the **latest 15 transactions** whenever they happened, so the list is never bare while there is data to show. Scroll it, and tap the count at the bottom to open History. Tap **+** to log an expense (amount, category, date, optional note) — from there you can also **import a bank statement** or log income instead; tap a recent item to edit or delete it. Tap **History** next to Recent to see everything, with no date limit — nothing is ever deleted when it drops off Recent, it just moves there. Anything Recent does not show is counted at the foot of the list, and the insight tiles say "see History" rather than "no expenses yet" — an imported statement from a previous month should never make the app look empty.
- **📅 Calendar** — month view with colored event dots, tap a day to see its events, add/edit/delete events (title, date, all-day or start/end time, color, notes, **reminder**). A reminder fires a local notification ahead of the event — at the time of the event, or 5/10/30 minutes, 1/2 hours, 1/2 days or a week before. All-day events get day-scale choices only, anchored to 9am, since "10 minutes before" an event with no time is meaningless.
- **📝 Notes** — a list of documents with a full-screen Markdown editor (headings, lists, checkboxes, bold/italic, quotes) and a Write/Preview toggle.
  - Nothing is saved until you tap the green **✓** at the bottom right — same rule whether you're writing a brand-new note or editing one that already exists. The **✓** only appears once there's something to save; otherwise it's a gold **+** that opens a fresh new note on top (so you can keep separate documents going without detouring through the list).
  - Leaving before confirming (back arrow, hardware back, swipe) discards silently if nothing changed, or asks first ("Discard this note?" / "Discard your changes?") if it did.
- **👥 Shared** — a split-the-bill tracker for expenses you share with other people. Add the people you split with, log a shared expense (what it was, the total, who paid, who it's split between, category), and it works out everyone's position: **balances** (what each person paid vs what they owe) and **settle up** — the shortest set of payments that clears the group, rather than everyone paying everyone. Split **Evenly** — even to the cent, so $10 between three is $3.34/$3.33/$3.33 and never loses the odd penny — or **Exact**, typing each person's amount yourself when the bill wasn't shared equally; exact shares have to add up to the total before it will save, since parts that disagree with the total would quietly corrupt every balance downstream. Any bill can be **marked settled** once everyone has squared up on it: it stays in the list as history but drops out of the balances. A bill can also **repeat every month** — rent, utilities, subscriptions — posting a fresh copy with the same people and split on the same day each month (clamped to the month's length, so a bill dated the 31st still posts in February). When someone actually pays you back, tap their row under **Settle up** to record the payment: it clears that much of the balance without touching any bill, appears under **Payments**, and can be undone in one tap. Each shared expense has a **Count my share in my spending** toggle: on, your share (not the whole bill) is mirrored into your personal expenses so it flows into Home's spending and savings; off, it stays purely a group record. Turning it off later removes the mirrored expense again, and deleting the shared expense takes it with it. **Scan** photographs a receipt and reads it: line items, quantities, subtotal, service charge, tax and rounding, all recognised on the device with ML Kit so the photo never leaves the phone. Tick who had what per line and it splits accordingly — service and tax apportioned in proportion to what each person ordered rather than evenly, so the person who had the $40 steak carries more of the 10% than the one who had a $4 coffee. Tap **Split all evenly** to put everyone on every line instead. Scanning needs a development build (it uses native code) and is unavailable in a browser. **Share** hands the whole thing to your group chat as plain text — every bill, each person's position, and the settle-up list — through the OS share sheet on a phone, or the clipboard in a browser.
- **⚙️ Settings** — a flat list of rows (icon + label + control), one screen per concern: **Use device theme** / **Dark mode** / **Notifications** toggles, a **Pay rhythm** row (salary amount + payday), and a **Recurring expenses** row for permanent monthly costs. A **Data** group below that has **Export data** / **Import data**, for moving everything to a new phone. Below that, an **About** group with **Privacy Policy** and **Terms & Conditions**.

**Recurring expenses** (Settings → Recurring expenses) — set up rent, subscriptions, or bills once (label, amount, category, day of the month, on/off), and each one auto-posts as a real expense the moment its day arrives — no manual logging. It shows up in Home's spending totals, trend, top category and Recent list exactly like anything you log by hand. Turning one off just pauses future posts; turning a rule off or deleting it never touches charges it already posted.

**Bank statement import** (Home → **+** → Import bank statement) — pick a CSV export from your bank, or a PDF statement (web only). Built for **Malaysian and Singaporean banks**: see the section below for what that covers. Nothing is saved right away: you land on a review screen listing every transaction found — headed by the bank it recognised — each row with a guessed category (or "Income" for deposits/payroll/refunds; tap the pill to cycle through categories and back to Income), an editable description, and a checkbox to include or exclude it. **Import N** then writes the checked rows as real expenses and income entries in one go.

### What it reads

Nothing is hardcoded per bank. The importer finds the header row *wherever it sits under the preamble*, matches each column against an alias table, and normalises — so a bank that renames a label, or one that isn't listed at all, still imports. Where a file has no headers, the columns are identified by what they contain instead.

- **Column names in English and Bahasa Malaysia** — `Tarikh` / `Butiran` / `Debit` / `Kredit` / `Baki` read exactly like their English equivalents, because Maybank, BSN, Bank Islam and Bank Rakyat all print statements in Malay.
- **Both amount conventions** — one signed column, or separate debit/credit columns. `RM1,234.56`, `SGD 1,234.56`, `1.234,56`, `(45.00)`, `28.50DR`, `3,500.00CR` and `45.00-` all parse.
- **All four date formats in circulation** — `11 Dec 2019`, `30/06/2018`, ISO, and dates with the year omitted (taken from the statement period). **Day-first throughout**, which is correct for both countries: `03/04/2026` is 3 April, never 4 March.
- **Delimiter sniffed** — comma, semicolon, tab or pipe, chosen by which yields the most consistent column count rather than by counting characters.
- **Wrapped description rows** — OCBC and UOB continue long descriptions on a row with no date; those are folded into the row above rather than counted as transactions.
- **Direction resolved in order of reliability** — an explicit type column, then debit/credit columns, then a sign or CR/DR marker, then the *running balance* (comparing each row's balance to the previous row's, which works regardless of which column the figure sat in), and only then the wording. Rows nothing could settle are flagged in a warning above the list.
- **Local merchants** — categories are guessed from ~250 Malaysian and Singaporean merchant names (99 Speedmart, NTUC FairPrice, Tenaga Nasional, SP Services, Touch 'n Go, SimplyGo, Astro, Maxis, Singtel, ZUS, Grab…), longest match winning so `grabfood` lands in Food rather than being caught by `grab` in Transport.

Banks recognised by name — for the review screen's label and for parsing hints, never as a gate on whether a file imports: **Malaysia** — Maybank, CIMB, Public Bank, RHB, Hong Leong, AmBank, Bank Islam, BSN, Affin, Alliance, Bank Rakyat, MBSB, Agrobank, Bank Muamalat, Al Rajhi, plus GXBank, Boost Bank, AEON Bank, Ryt Bank, Touch 'n Go eWallet and BigPay. **Singapore** — DBS/POSB, OCBC, UOB, Standard Chartered, Citibank, Trust, GXS, MariBank, Bank of China, ICBC, HSBC, Revolut, Wise, YouTrip and Amex.

PDF statements take a different route, since a PDF's text layer has no columns: they go through a running-balance ledger reader verified against a real multi-page OCBC statement (45/45 transactions, totals matching the statement's own). Layouts vary a lot bank to bank, so PDF results may still need correction. Parsing lives in `src/statementImport.ts` with its knowledge split into `src/statement/`; PDF text extraction (`src/pdfExtract.web.ts`, via `pdfjs-dist`) only runs on web — native points you at CSV instead, see the file-splitting note below.

You can also log income by hand — Home → **+** → **or log income instead** — with just an amount, a free-text source ("Paycheck", "Refund", …), a date, and an optional note.

**Notifications** (Settings → Notifications toggle) — turning it on asks for the OS permission, then schedules local, on-device reminders for payday and for any calendar events you've set one on (no permission = the switch won't turn on, with an explainer). While on, a recurring expense auto-posting also fires an immediate local notification. Everything is scheduled with `expo-notifications`; nothing is sent anywhere — there's no push server. No-ops gracefully on web, where local notifications aren't available.

On first launch the app shows a two-step **welcome flow**. Step one asks who you are — a name and an optional profile picture, cropped square and stored inline so it travels with a backup rather than pointing at a cache file that may not survive. Step two asks for salary amount and payday. Both steps are skippable, and both are editable later in Settings (**Profile** sits at the top). Once set, your name and picture greet you on Home. It's optional — there's a **Skip for now** button, and it can be set later in Settings. When a payday is set, it drives the app's signature: a pay-cycle **runway** on the calendar, a **cycle ring** in Settings, and a gold coin marker on payday itself.

**Moving to a new phone** (Settings → Export data / Import data) — all data lives only in local SQLite, so switching phones means moving it yourself: **Export data** writes everything (events, notes, expenses, recurring rules, settings) to one `planner-backup-YYYY-MM-DD.json` file and hands it to the OS share sheet on native (AirDrop, Files, email, etc.) or downloads it in the browser on web; **Import data** picks a `.json` file and merges its rows in — events, notes, expenses, income, recurring rules, people, shared expenses and payments — anything with an identical id overwrites the existing row, everything else is added alongside what's already there. Built on `src/backup.ts`.

All data is stored locally on the device in SQLite (`expo-sqlite`). Nothing leaves the phone unless you export it yourself, and no part of the app needs a network to work — statement import included: the PDF reader (`pdfjs`) is bundled rather than fetched, so importing a statement works on a plane, and the file you pick is never uploaded anywhere.

## Design

See [DESIGN.md](DESIGN.md) for the full rationale. In short: a near-black
ground with one accent ramp — emerald, lime, and amber, plus a coral alert —
reserved for data marks (category dots, the spend ring, state colors), never
for prose; **Archivo** throughout for type, **Space Mono** for every number.
The pay cycle is the identity — the calendar grid renders light-on-dark on an
ink card, payday is an amber coin, and the runway/ring show how far you are
through the current cycle.

Tokens live in `src/theme.ts` (light + dark). `src/ThemeContext.tsx` exposes
`useTheme()` (persisted via the `settings` table); screens build styles with a
`makeStyles(colors)` factory. `src/components/AppText.tsx` carries the type scale.

## Run it on your PC (browser)

```bash
npx expo start --web
```

Opens at `http://localhost:8081` (it prints the exact URL). The app runs in a
centered phone-width column; SQLite runs as WebAssembly and persists in the
browser. Use a Chromium browser (Chrome/Edge) — the cross-origin-isolation
headers `metro.config.js` sets for `wa-sqlite` are needed for storage.

## Run it on your phone

1. Install **Expo Go** (iOS App Store / Google Play).
2. Phone and computer on the same Wi-Fi.
3. `npx expo start`, then scan the QR code — iPhone: Camera app; Android: scan
   inside Expo Go. Use `npx expo start --tunnel` if the devices aren't on the
   same network.

## Project structure

```
App.tsx                     font loading + tab / stack navigation
src/db.ts                   SQLite schema + CRUD (events, documents, expenses, recurring expenses, income, settings)
src/backup.ts               export/import all data as one JSON file (move to a new phone)
src/statementImport.ts      bank statement import: header detection, column mapping, row building
src/statement/banks.ts      column aliases (EN + Malay) + MY/SG bank profiles and detection
src/statement/fields.ts     date and money parsing (day-first, RM/SGD, CR/DR, parentheses)
src/statement/csv.ts        delimiter sniffing + RFC4180-lenient parsing
src/statement/merchants.ts  MY/SG merchant → category keywords, income detection + income category
src/statement/duplicates.ts already-imported detection (date + amount + description)
src/pickAvatar.ts            photo library → square, downscaled data URI
src/transactions.ts         shared expense+income merge/sort (Home's Recent + History)
src/sharing.ts               bill splitting, group balances, settle-up (all cent-exact)
src/receipt/parseReceipt.ts  receipt OCR text → items + charges, and per-item allocation
src/receipt/ocr.ts           on-device text recognition (ML Kit); .web.ts explains its absence
src/shareText.ts             sends a block of text to the OS share sheet, clipboard as fallback
src/pdfExtract.ts           PDF text extraction — native stub (see file comment for why this is split)
src/pdfExtract.web.ts       PDF text extraction — real implementation, via pdfjs-dist, web only
src/dateUtils.ts            date/time formatting helpers
src/payCycle.ts             pay-cycle math (days until payday, cycle fraction)
src/spending.ts             expense categories + money/trend math
src/notifications.ts         permission + scheduling primitives for local notifications
src/reminders.ts             event reminder offsets, fire times, and whole-schedule resync
src/theme.ts                design tokens: colors, fonts, radii, shadow
src/navigation.ts           navigation param types
src/ThemeContext.tsx        useTheme() hook + persistence
src/screens/
  HomeScreen.tsx             spending ring, stat tiles, insights, recent list (14 days, min 15 items)
  ProfileScreen.tsx          name + picture, editable after onboarding
  HistoryScreen.tsx          every expense + income ever logged, no date limit
  SharedScreen.tsx           group balances, settle-up, shared expense list
  SharedExpenseEditorScreen.tsx  one shared bill: payer, split, category, Home mirror
  PeopleScreen.tsx           the people you split bills with, and what each is owed
  AddExpenseScreen.tsx       create / edit / delete an expense; entry point for statement import + income
  IncomeEditorScreen.tsx     create / edit / delete an income entry
  BankImportScreen.tsx       pick a statement file, review parsed transactions, bulk-import
  CalendarScreen.tsx        ink month card + runway + day agenda
  EventEditorScreen.tsx     create / edit / delete an event
  NotesScreen.tsx           document list
  NoteEditorScreen.tsx      Markdown editor (Write / Preview)
  SettingsScreen.tsx        flat row list: theme toggles, pay rhythm, recurring
  PayRhythmScreen.tsx       salary amount + payday, opened from Settings
  RecurringExpensesScreen.tsx   list of recurring rules, opened from Settings
  RecurringExpenseEditorScreen.tsx  create / edit / delete a recurring rule
  LegalScreen.tsx            Privacy Policy / Terms & Conditions (static, local content)
  OnboardingScreen.tsx      one-time welcome (salary + payday, skippable)
src/components/
  AppText.tsx               typographic scale (Space Grotesk / Inter / Space Mono)
  RunwayBar.tsx             pay-cycle progress bar (calendar)
  CycleRing.tsx             pay-cycle progress ring (pay rhythm screen)
  SpendRing.tsx              spend-vs-salary progress ring (Home)
  OrbitHero.tsx             onboarding orbit mark
  CalendarDay.tsx           custom calendar cell (gold payday, iris selection)
  PaydayFields.tsx          shared salary amount + day-of-month picker
  DayOfMonthGrid.tsx         shared 1–31 day slider (payday + recurring) — a real <input type="range"> on web, a custom PanResponder slider on native
  RowIcon.tsx                line icons for settings rows
  TabBarIcon.tsx            line-drawn tab icons
  PlatformDateTimePicker.tsx native picker on device, <input> on web
  WebFrame.tsx               phone-width column when running on web
  Pager.tsx                  horizontal paged strip with dots — Home's swipeable summary card
  TransactionRow.tsx         one expense/income row — shared by Home's Recent list and History
```

Onboarding + payday values live in the `settings` table (`onboardingComplete`, `salaryAmount`, `salaryDay`) via helpers in `src/db.ts`. To see the welcome screen again during testing, delete the app in Expo Go and re-scan, or temporarily run `setSetting('onboardingComplete','false')`.

## Notes / next steps

- `metro.config.js` aliases `punycode` to the userland package (`markdown-it` needs it), registers `.wasm` as an asset, and sends COOP/COEP headers so `expo-sqlite` works on web.
- `src/components/PlatformDateTimePicker.tsx` uses the native wheel picker on iOS/Android and a plain `<input type="date|time">` on web.
- `src/components/ConfirmDialog.tsx` — every confirmation (delete event/expense/recurring/note, discard an unsaved note, notifications-blocked) uses this instead of RN's `Alert.alert`, because `react-native-web` ships `Alert.alert` as a complete no-op — it would otherwise silently never appear (and never fire its callback) when running in a browser.
- `src/components/WebFrame.tsx` centers the app in a phone-width column on web only.
- `src/pdfExtract.ts` / `src/pdfExtract.web.ts` are split into two files on purpose, not just styled after `PlatformDateTimePicker`'s inline `Platform.OS` branching: `pdfjs-dist` reaches for Node builtins Metro can't resolve for a native bundle, and a dynamic `import()` behind a runtime check still gets statically resolved into the native bundle graph — only Metro's own per-platform file resolution (`.web.ts` vs the bare file) keeps that dependency out of native entirely. Don't merge these back into one file.
- Ideas to build next: recurring events, week/day calendar views, search in notes, cloud sync, real Google Calendar integration, duplicate detection when re-importing a bank statement.
