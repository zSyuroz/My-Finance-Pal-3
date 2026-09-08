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
  action: string; // buttons and the add control — the "do this" colour
  onAction: string; // text on action
  sage: string; // today / positive
  onSage: string; // text/icon on sage
  danger: string;
  // lines
  line: string;
};

// Palette ported from a reference dark-fintech design system ("Remainder" —
// a near-black ground with a single accent ramp: emerald → lime → amber,
// plus one coral alert, and nothing else in color). That system has no light
// mode of its own — every light-theme value below is this app's own
// extension of the same four accent roles (iris→lime, gold→amber,
// sage→emerald, danger→warn), darkened only where a color doubles as small
// text and needs to hold contrast on white. `ink` is the one "signature"
// surface — Home's ring card, the Calendar grid, the Shared summary. It used
// to stay near-black in both themes to preserve the reference's identity, but
// a black slab on a light page reads as a rendering fault rather than a
// choice, so it now follows the theme like every other surface. Anything
// drawn on it must use the onInk* tokens rather than a literal light rgba,
// or it inverts to invisible the moment the theme flips.
export const lightTheme: Theme = {
  // Same two-tint idea carried into daylight: the page is a warm off-white,
  // cards are pure white, and `ink` takes a faint green cast so the hero
  // card is still its own material rather than another white rectangle.
  haze: '#EFF2EC',
  mist: '#FFFFFF',
  ink: '#E9EFE7',
  onInk: '#14161A',
  onInkMuted: 'rgba(20,22,26,0.62)',
  onInkTrack: 'rgba(20,22,26,0.13)',
  onInkFaint: 'rgba(20,22,26,0.34)',
  text: '#14161A',
  textMuted: '#6B7069',
  iris: '#4F6B0F',
  gold: '#F2D94E',
  onGold: '#2A1B02',
  action: '#A8E82C',
  onAction: '#0B2E22',
  sage: '#14D98A',
  onSage: '#0B2E22',
  danger: '#C1512A',
  line: '#DDE3DA',
};

export const darkTheme: Theme = {
  // The ground is a green-black rather than a neutral one, and `ink` is a
  // distinctly *greener* slab than the cards beside it. Two surface tints
  // instead of one is what stops a dark screen reading as a flat sheet:
  // the hero card has to look like a different material, not a lighter grey.
  haze: '#070A08',
  mist: '#121614',
  ink: '#16211C',
  onInk: '#F3F6F4',
  onInkMuted: 'rgba(243,246,244,0.65)',
  onInkTrack: 'rgba(243,246,244,0.16)',
  onInkFaint: 'rgba(243,246,244,0.38)',
  text: '#F3F6F4',
  textMuted: '#7E8885',
  iris: '#A8E82C',
  gold: '#F2D94E',
  onGold: '#2A1B02',
  action: '#A8E82C',
  onAction: '#0B2E22',
  sage: '#14D98A',
  onSage: '#0B2E22',
  danger: '#FF8D5A',
  line: '#1F2A25',
};

// Payday / money colors are intentionally theme-stable (a coin is a coin).
export const GOLD = '#F2D94E';

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

export const radius = { sm: 10, md: 14, lg: 22, xl: 28, pill: 999 } as const;

export const space = (n: number) => n * 4;

// The reference relies mostly on a 1px hairline border for panel separation
// on a near-black ground, treating shadow as a faint accent rather than the
// primary depth cue — RN's single-shadow style props approximate that with
// a soft, dark, downward-only shadow instead of the reference's layered
// inset+drop box-shadow, which RN has no way to express directly.
export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  lift: {
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
} as const;

// Event palette — sampled along the same emerald → lime → amber ramp the
// reference uses for every categorical color (its own `rampColor` helper
// does the same linear interpolation), plus the one coral alert at the end
// for a "this one matters" event color. No hue outside that family.
export const EVENT_COLORS = [
  '#14D98A', // emerald
  '#4FDF64',
  '#8AE53F',
  '#B7E533',
  '#D4DF40',
  '#F2D94E', // amber
  '#FF8D5A', // warn — reserved for standout events
];
