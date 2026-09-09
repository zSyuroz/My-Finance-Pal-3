import Svg, { Circle } from 'react-native-svg';
import { View } from 'react-native';

import AppText from './AppText';
import { useTheme } from '../ThemeContext';
import { ACCENT } from '../theme';

type Props = {
  fraction: number | null; // spent / salary this cycle, or null when no salary is set
  amountLabel: string; // formatted amount, e.g. "£41.60"
  caption: string; // e.g. "spent today"
  trackColor: string;
  size?: number;
};

export default function SpendRing({
  fraction,
  amountLabel,
  caption,
  trackColor,
  size = 176,
}: Props) {
  const { colors } = useTheme();
  const sw = 12;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const f = fraction == null ? 0 : Math.max(0.02, Math.min(1, fraction));
  const offset = c * (1 - f);
  const over = fraction != null && fraction > 1;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={sw} fill="none" />
        {fraction != null && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={over ? colors.danger : ACCENT}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      {/* A day's spending fits at 30px; a lifetime total does not, and at six
          figures it runs straight through the ring. Step the size down by
          length so the number always sits inside the circle. */}
      <AppText
        variant="monoBold"
        color={colors.onInk}
        style={{ fontSize: amountLabel.length > 10 ? 22 : amountLabel.length > 8 ? 26 : 30 }}
      >
        {amountLabel}
      </AppText>
      <AppText variant="mono" color={colors.onInkMuted} style={{ marginTop: 2 }}>
        {caption}
      </AppText>
    </View>
  );
}
