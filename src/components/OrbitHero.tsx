import Svg, {
  Circle,
  G,
  Line,
  Path,
  Polygon,
} from 'react-native-svg';

import { useTheme } from '../ThemeContext';
import { GOLD } from '../theme';

/**
 * The onboarding mark: a thin orbit with a single gold coin on the ring.
 * The app orbits your payday. Static — no motion needed to carry the idea.
 */
export default function OrbitHero({ size = 240 }: { size?: number }) {
  const { colors } = useTheme();
  const cx = 130;
  const cy = 118;

  // coin position on the middle ring (about 1 o'clock)
  const angle = -Math.PI / 5;
  const ringR = 66;
  const coinX = cx + Math.cos(angle) * ringR;
  const coinY = cy + Math.sin(angle) * ringR;

  return (
    <Svg width={size} height={size * (220 / 260)} viewBox="0 0 260 220">
      {/* orbits */}
      <Circle cx={cx} cy={cy} r={40} stroke={colors.line} strokeWidth={1.5} fill="none" />
      <Circle cx={cx} cy={cy} r={ringR} stroke={colors.iris} strokeWidth={1.5} fill="none" opacity={0.5} />
      <Circle cx={cx} cy={cy} r={92} stroke={colors.line} strokeWidth={1.5} fill="none" />

      {/* the runway arc — from "now" round to the coin */}
      <Path
        d={`M ${cx - ringR} ${cy} A ${ringR} ${ringR} 0 0 1 ${coinX} ${coinY}`}
        stroke={GOLD}
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />

      {/* the coin */}
      <Circle cx={coinX} cy={coinY} r={11} fill={GOLD} />
      <Circle cx={coinX} cy={coinY} r={11} stroke="#FFF7EA" strokeWidth={2} fill="none" />

      {/* "now" marker */}
      <Circle cx={cx - ringR} cy={cy} r={4} fill={colors.iris} />

      {/* scattered marks */}
      <G opacity={0.55}>
        <Line x1={44} y1={40} x2={44} y2={56} stroke={colors.iris} strokeWidth={2} strokeLinecap="round" />
        <Line x1={36} y1={48} x2={52} y2={48} stroke={colors.iris} strokeWidth={2} strokeLinecap="round" />
        <Circle cx={220} cy={60} r={6} stroke={GOLD} strokeWidth={2} fill="none" />
        <Polygon points="214,168 226,168 220,156" fill={colors.sage} />
        <Circle cx={40} cy={182} r={3} fill={GOLD} />
        <Circle cx={198} cy={30} r={2.5} fill={colors.textMuted} />
      </G>
    </Svg>
  );
}
