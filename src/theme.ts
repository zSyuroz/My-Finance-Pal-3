export type Theme = {
  // surfaces
  haze: string; // page background
  mist: string; // card surface
  ink: string; // the signature "hero" surface — Home's ring card, the Calendar grid
  onInk: string; // primary text on ink
  onInkMuted: string; // secondary text on ink
  onInkTrack: string; // rings and slider tracks on ink
  onInkFaint: string; // disabled / inactive marks on ink
  // text
  text: string;
  textMuted: string;
  // accents
  iris: string; // selection / focus / links
  gold: string; // the money thread: payday, runway, what you owe
  onGold: string; // text on gold
  onGoldMuted: string; // secondary text on gold
  action: string; // buttons and the add control — the "do this" colour
  onAction: string; // text on action
  sage: string; // today / positive
  onSage: string; // text/icon on sage
  danger: string;
  // lines
  line: string;
};

/*
 * A violet dark system: a near-black ground with a purple cast, panels lifted
 * a step or two out of it, and a violet-to-magenta accent pair carrying the
 * whole interface.
 *
 * Three things carry the look, and all three live in this file — no screen
 * names a colour of its own, which is why the palette can be swapped without
 * touching a single figure the app calculates:
 *
 *   Two surface tints, not one. `mist` is the panel and `ink` is a distinctly
 *   more violet, lighter slab for the hero surfaces. A dark screen with one
 *   surface colour reads as a flat sheet; the hero has to look like a
 *   different material rather than a lighter grey.
 *
 *   Hairlines over shadows. `line` at low contrast is what separates panels;
 *   the shadow below is a faint bloom, not the depth cue.
 *
 *   Two accents and two signals. Violet is "live" — actions, selection, the
 *   rings. Magenta is the money thread and nothing else, so payday never blurs
 *   into a button. Mint means positive and rose means trouble: those two are
 *   the one place a hue outside the family earns its keep, because a person
 *   has to tell gain from loss at a glance and violet-against-magenta cannot
 *   carry that.
 */
export const lightTheme: Theme = {
  // The same two-tint idea in daylight: a cool off-white page, white cards, and
  // an `ink` that keeps a faint violet cast so the hero surface is still its
  // own material rather than another white rectangle.
  haze: '#F3F0F8',
  mist: '#FFFFFF',
  ink: '#EBE5F5',
  onInk: '#160F22',
  onInkMuted: 'rgba(22,15,34,0.62)',
  onInkTrack: 'rgba(22,15,34,0.13)',
  onInkFaint: 'rgba(22,15,34,0.34)',
  text: '#160F22',
  textMuted: '#665C79',
  // Darkened wherever a colour doubles as small text and has to hold contrast
  // on white — the dark theme's violet and magenta are unreadable at body size.
  iris: '#7E22CE',
  gold: '#A21CAF',
  onGold: '#FFFFFF',
  onGoldMuted: 'rgba(255,255,255,0.78)',
  action: '#7E22CE',
  onAction: '#FFFFFF',
  sage: '#047857',
  onSage: '#FFFFFF',
  danger: '#BE123C',
  line: '#DED6EC',
};

export const darkTheme: Theme = {
  haze: '#0A0711', // near-black, with just enough violet to not read as grey
  mist: '#16121F', // panel, one step out of the ground
  ink: '#1C1729', // hero slab — more violet and lighter again
  onInk: '#F2EEFA',
  onInkMuted: 'rgba(242,238,250,0.66)',
  onInkTrack: 'rgba(242,238,250,0.14)',
  onInkFaint: 'rgba(242,238,250,0.36)',
  text: '#F2EEFA',
  textMuted: '#9A93AD',
  iris: '#C084FC',
  // Fuchsia rather than a rose pink: the money thread sits next to the danger
  // colour constantly — payday above a bill, a credit beside a debit — and a
  // rose money thread put them ~18° apart in hue, so arriving and leaving read
  // as the same event. Pushed round to ~292° they cannot be confused.
  gold: '#D946EF',
  onGold: '#2A0733',
  onGoldMuted: 'rgba(42,7,51,0.72)',
  action: '#A855F7',
  onAction: '#FFFFFF',
  sage: '#3DDC97',
  onSage: '#07231A',
  danger: '#FB5E7E',
  line: '#2A2338',
};

/**
 * The accent the rings and the orbit illustration draw with, since those are
 * SVG strokes rather than themed styles.
 *
 * Theme-stable on purpose: they are the app's signature marks and should read
 * the same in either mode, the way a brand colour does.
 */
export const ACCENT = '#A855F7';

export const font = {
  // The reference's type ramp leans on a single grotesque (Archivo) worked
  // across weight, using 560 as "the house semibold" everywhere. Expo's font
  // packages only ship fixed static weights, so 600 stands in for that 560
  // throughout — display, titles, and labels all resolve to the same
  // SemiBold face rather than a heavier Bold, matching the reference's
  // restraint (weight carries emphasis, not extra darkness).
  display: 'Archivo_600SemiBold',
  displaySemi: 'Archivo_600SemiBold',
  body: 'Archivo_400Regular',
  bodyMedium: 'Archivo_500Medium',
  bodySemi: 'Archivo_600SemiBold',
  bodyBold: 'Archivo_700Bold',
  // Kept as a real monospace face rather than switching to Archivo's own
  // tabular-lining figures: React Native has no reliable, cross-platform way
  // to turn on font-variant-numeric/OpenType features via a style prop, so a
  // dedicated mono face is the RN-native way to get the reference's "every
  // figure aligns in a column" rule.
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
} as const;

// Softer corners than the old system: glass panels read as panes of material,
// and a tight radius makes them look like buttons instead.
export const radius = { sm: 12, md: 16, lg: 24, xl: 30, pill: 999 } as const;

export const space = (n: number) => n * 4;

// Glass wants a bloom, not a drop shadow: a wide, low-opacity spread tinted
// toward the ground's own blue, so a panel looks lit from behind rather than
// stuck on top of the page. The hairline border does the actual separating.
export const shadow = {
  card: {
    shadowColor: '#05020A',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  lift: {
    shadowColor: '#05020A',
    shadowOpacity: 0.6,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
} as const;

// Event palette — one ramp through the family, mint → violet → magenta, with
// the rose alert at the end for a "this one matters" event. No hue outside it,
// for the same reason the accents have none: a categorical colour that is not
// part of the system reads as an accident.
export const EVENT_COLORS = [
  '#3DDC97', // mint
  '#5EEAD4',
  '#818CF8',
  '#A855F7', // violet
  '#C084FC',
  '#D946EF', // fuchsia
  '#FB5E7E', // rose — reserved for standout events
];
