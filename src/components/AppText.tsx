import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '../ThemeContext';
import { font } from '../theme';

type Variant =
  | 'display' // Space Grotesk 700 — big screen titles
  | 'displaySm' // Space Grotesk 700 — smaller headings
  | 'title' // Space Grotesk 600 — card / row titles
  | 'body' // Inter 400
  | 'bodyMed' // Inter 500
  | 'bodySemi' // Inter 600
  | 'label' // Inter 600 uppercase caption
  | 'mono' // Space Mono 400 — data
  | 'monoBold'; // Space Mono 700 — headline numbers

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: font.display, fontSize: 30, letterSpacing: -0.5 },
  displaySm: { fontFamily: font.display, fontSize: 22, letterSpacing: -0.3 },
  title: { fontFamily: font.displaySemi, fontSize: 17, letterSpacing: -0.2 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  bodyMed: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 22 },
  bodySemi: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 22 },
  label: {
    fontFamily: font.bodySemi,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  mono: { fontFamily: font.mono, fontSize: 13 },
  monoBold: { fontFamily: font.monoBold, fontSize: 15 },
};

type Props = TextProps & {
  variant?: Variant;
  color?: string;
  muted?: boolean;
  center?: boolean;
};

export default function AppText({
  variant = 'body',
  color,
  muted,
  center,
  style,
  ...rest
}: Props) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        VARIANTS[variant],
        { color: color ?? (muted ? colors.textMuted : colors.text) },
        center && { textAlign: 'center' },
        style,
      ]}
    />
  );
}
