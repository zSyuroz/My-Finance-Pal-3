import Svg, { Circle, Path } from 'react-native-svg';
import { View } from 'react-native';

/**
 * A bare trend line — no axes, no labels, no grid.
 *
 * It sits beside a figure that already states the exact value, so its only
 * job is the shape: rising, falling, or flat. Anything more would compete
 * with the number for attention and lose.
 */
export default function Sparkline({
  values,
  color,
  width = 120,
  height = 28,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  // Two points is the minimum that can show a direction; one is just a dot
  // implying a trend that hasn't been observed yet.
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = 3;
  const usableH = height - pad * 2;

  const point = (v: number, i: number) => {
    const x = (i / (values.length - 1)) * width;
    // A flat run has no span to scale by; drawing it through the middle is
    // truthful, where dividing by zero would not be.
    const y = span === 0 ? height / 2 : pad + (1 - (v - min) / span) * usableH;
    return { x, y };
  };

  const points = values.map(point);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={last.x} cy={last.y} r={2.8} fill={color} />
      </Svg>
    </View>
  );
}
