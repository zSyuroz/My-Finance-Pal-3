import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

type Name = 'home' | 'calendar' | 'shared' | 'settings';

export default function TabBarIcon({
  name,
  color,
  focused,
}: {
  name: Name;
  color: string;
  focused: boolean;
}) {
  const sw = focused ? 2.4 : 1.9;
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      {name === 'home' && (
        <>
          <Path
            d="M4 11.5 12 4l8 7.5"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M6 10v8.5A1.5 1.5 0 0 0 7.5 20H10v-4.5a2 2 0 0 1 4 0V20h2.5a1.5 1.5 0 0 0 1.5-1.5V10"
            stroke={color}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </>
      )}
      {name === 'calendar' && (
        <>
          <Rect x={3} y={5} width={18} height={16} rx={4} stroke={color} strokeWidth={sw} />
          <Line x1={3} y1={10} x2={21} y2={10} stroke={color} strokeWidth={sw} />
          <Line x1={8} y1={3} x2={8} y2={7} stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1={16} y1={3} x2={16} y2={7} stroke={color} strokeWidth={sw} strokeLinecap="round" />
          {focused && <Circle cx={16} cy={15} r={2.4} fill={color} />}
        </>
      )}
      {name === 'shared' && (
        // Two people side by side — the smaller one behind, so the pair reads
        // as a group at 24px rather than as one indistinct blob.
        <>
          <Circle cx={9.5} cy={8} r={3.4} stroke={color} strokeWidth={sw} />
          <Path
            d="M3.5 19.5c0-3 2.7-5 6-5s6 2 6 5"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
          />
          <Path
            d="M16.5 5.2a3 3 0 0 1 0 5.6M18 14.9c1.6.7 2.6 2.1 2.6 4.1"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        </>
      )}
      {name === 'settings' && (
        <>
          <Circle cx={12} cy={12} r={3.2} stroke={color} strokeWidth={sw} />
          <Path
            d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4M17.8 17.8l-1.4-1.4M7.6 7.6 6.2 6.2"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        </>
      )}
    </Svg>
  );
}
