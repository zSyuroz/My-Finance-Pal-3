# planner-app — visual design

## Subject

A personal planner that is aware of your **pay rhythm**. You schedule your month,
write documents, and the app always knows how many days stand between today and
your next payday. Audience: someone who wants one calm place for their time and
their money cadence. The app's job: show my month and my pay rhythm at a glance,
and let me write.

Inspired by the "Finance App" dribbble shot (indigo + orange, rounded floating
cards, playful geometry) but deliberately not a copy — see departures below.

## Tokens

### Color (v3 — ported 2026-09-05 from a reference design system, "Remainder")
| name    | light      | dark       | role |
|---------|------------|------------|------|
| ink     | `#101214`  | `#15181A`  | the one signature dark surface (Home ring, Calendar grid) — near-black in **both** themes on purpose |
| haze    | `#F1F1EC`  | `#08090A`  | page background |
| mist    | `#FFFFFF`  | `#101214`  | card surface |
| iris    | `#4F6B0F`  | `#A8E82C`  | selection, focus, links — lime in dark mode, darkened to hold contrast on white in light mode |
| gold    | `#F2D94E`  | `#F2D94E`  | the money thread: primary action, payday marker, runway fill — theme-stable amber |
| sage    | `#14D98A`  | `#14D98A`  | "today", positive confirmations — theme-stable emerald |
| danger  | `#C1512A`  | `#FF8D5A`  | destructive actions, overspend — coral, not red |
| line    | `#E2E4DE`  | `#1E2225`  | hairlines / borders |

v3 change: the user supplied the full source of a reference app ("Remainder", a
CPF-aware Singapore finance tracker built in React/Vite) — its design-token
doc, compiled CSS, and component source — and asked for its design, theme, and
type treatment. That reference is a **near-black dashboard with exactly one
accent family** (emerald → lime → amber, plus a single coral alert) reserved
for data marks, never for prose; every reading glyph stays achromatic. Ported
faithfully: `iris`→lime (the reference's own "interaction hue"), `gold`→amber,
`sage`→emerald, `danger`→its coral `warn`, each keeping this app's *existing*
four-role split (the reference itself collapses interactive-vs-primary-action
into one hue; this app keeps them distinct, which the ramp still accommodates).
`gold`/`sage` are theme-stable exactly as `GOLD`/`SAGE` already were pre-v3 — a
coin is a coin regardless of light/dark. `ink` is now *also* effectively
theme-stable (near-black in both themes) rather than just "dark" in light mode
and "slightly-raised" in dark mode: the reference's whole identity is a
near-black ground, so the one place this app already had a dark surface is
where that identity gets to persist even with the light theme on. `EVENT_COLORS`
and `spending.ts` `CATEGORIES` now sample the same emerald→lime→amber ramp
(the reference's own `rampColor()` helper does an identical linear
interpolation for its categorical donut) instead of the old jewel-tone set —
color-as-data-mark is the reference's central discipline, and category dots are
exactly that.

**A real bug the port surfaced, not introduced**: `SpendRing`'s amount/caption
text used the default (non-`onInk`) text color, which happened to equal `ink`
itself in the *old* light theme (`#14151C` both) — silently invisible white-on-
black-on-white-card text that nobody had caught because this app's testing
this session ran almost entirely in dark mode. Fixed by passing `colors.onInk`
explicitly, matching the pattern every *other* ink-card consumer (`PayRhythmScreen`,
`CalendarDay`, `CalendarScreen`'s month header) already used correctly.

Departure from the v1/v2 principle "warm accent leads, blue is purely
structural" (both kept in v3): there is no blue left anywhere in the app now —
the reference has none, and the whole point of porting it faithfully was not to
keep a hue it deliberately excludes. Gold-as-primary-action survives instead as
"amber is the money hue and the ramp's own top stop", which is the same
through-line by a different mechanism.

### Type — Archivo throughout, mono kept for tabular data
- **Display / UI** — Archivo (400 / 500 / 600 / 700), replacing Space
  Grotesk + Inter as of v3: the reference runs one grotesque across every
  weight rather than pairing a display face with a separate body face, using
  600 as a stand-in for its own fractional "560 house semibold" (Expo's font
  packages only ship fixed static weights, so there's no way to hit 560
  exactly — 600 is the closest real weight and is used everywhere the
  reference uses 560, not just at its own literal 600 spots).
- **Data / money** — Space Mono (400 / 700), **kept, not ported**: the
  reference gets tabular-aligned figures from `font-variant-numeric:
  tabular-nums` on Archivo itself, a CSS feature React Native has no reliable
  cross-platform way to trigger via a style prop. A real monospace face is
  this app's RN-native equivalent of that same rule — every number still
  aligns in a column, just via a different, platform-appropriate mechanism.

### Layout
Rounded cards floating on a pale haze ground. Per screen the brand/header block
is an **ink** card with light-on-dark content; lists sit below on haze as mist
cards. Radius 20 for cards, 12 for controls, full for pills. Soft low shadow.

### Signature — the pay-cycle runway
A slim horizontal meter under the month title showing how far through the current
pay cycle you are, with **"12d to payday"** in Space Mono. Same idea as an arc on
the Settings pay card and the Onboarding hero. Payday itself is a filled **gold
coin-pill** on the calendar grid (not a dot). Everything else stays quiet:
neutral cards, iris only for the selected day, Inter body throughout.

Onboarding hero: a thin **orbit** motif (concentric arcs) with one gold coin-dot
on the ring and a few scattered low-opacity geometric marks (+, ○, △). Says: the
app orbits your payday. Not the reference's plant-and-coins illustration.

## Rejected defaults
- No cream/serif/terracotta; no near-black + acid; no broadsheet hairlines.
- Hero is **not** a big balance number ("Total balance $13,250" is the shot's
  template answer) — the calendar hero is month + runway; onboarding hero is the
  orbit.
- No 01/02/03 numbering — no sequence content to encode.

## Log
- v1 build: tokens + Space Grotesk/Inter/Space Mono via @expo-google-fonts,
  loaded in `App.tsx` with a splash-screen gate. `AppText` primitive carries the
  type scale. `src/payCycle.ts` computes the cycle; `RunwayBar` (calendar),
  `CycleRing` (settings), `OrbitHero` (onboarding) are the three signature
  expressions. Calendar grid renders on an ink card via a custom `CalendarDay`
  (gold coin = payday, iris ring = selected, sage dot = today). `TabBarIcon`
  gives line-drawn tab glyphs instead of emoji.
- Screens restyled: Calendar, Notes, NoteEditor (Write/Preview segmented pill),
  Settings (radio list + ink pay-rhythm summary card), EventEditor, Onboarding.
- react-native-svg added for the signature SVGs + icons.
- v3 retheme (2026-09-05): `@expo-google-fonts/archivo` added, `space-grotesk`
  and `inter` packages removed entirely (nothing else referenced them);
  `theme.ts` colors/font tokens/radius/shadow/`EVENT_COLORS` rewritten,
  `spending.ts` `CATEGORIES` recolored — see the Color/Type sections above for
  the full rationale. `radius` tightened (`sm:8, md:10, lg:18, xl:24`, `pill`
  unchanged) to match the reference's control/panel radii exactly; since every
  call site references the named token rather than a literal number, this was
  a one-file change with no call-site edits needed. Verified live in the
  browser in both themes — dark theme first (closest to the reference), then
  light theme, which is where the `SpendRing` contrast bug above was actually
  caught.
