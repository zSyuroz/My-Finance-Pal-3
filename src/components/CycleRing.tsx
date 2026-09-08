import Svg, { Circle } from 'react-native-svg';
import { View } from 'react-native';

import AppText from './AppText';
import { GOLD } from '../theme';

type Props = {
  fraction: number;
  daysUntil: number;
  trackColor: string;
  textColor: string;
  size?: number;
};

export default function CycleRing({
  fraction,
  daysUntil,
  trackColor,
  textColor,
  size = 68,
}: Props) {
  const sw = 6;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0.02, Math.min(1, fraction)));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={sw} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={GOLD}
          strokeWidth={sw}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <AppText variant="monoBold" color={textColor} style={{ fontSize: 16 }}>
        {daysUntil <= 0 ? 'now' : `${daysUntil}d`}
      </AppText>
    </View>
  );
}
