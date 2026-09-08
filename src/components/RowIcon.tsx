import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type RowIconName =
  | 'theme'
  | 'moon'
  | 'wallet'
  | 'repeat'
  | 'bell'
  | 'shield'
  | 'doc'
  | 'chevron'
  | 'export'
  | 'import'
  | 'trash'
  | 'coin'
  | 'chart'
  | 'bank'
  | 'target'
  | 'cards'
  | 'trend'
  | 'chat'
  | 'star'
  | 'camera'
  | 'people'
  | 'share';



export default function RowIcon({
  name,
  color,
  size = 22,
}: {
  name: RowIconName;
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'theme' && (
        <>
          <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={1.8} />
          <Path
            d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </>
      )}
      {name === 'moon' && (
        <Path
          d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
          stroke={color}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      )}
      {name === 'wallet' && (
        <>
          <Rect x={3.5} y={6} width={17} height={13} rx={3} stroke={color} strokeWidth={1.8} />
          <Path d="M3.5 10.5h11.5a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H3.5" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
          <Circle cx={15.3} cy={12.5} r={1.1} fill={color} />
        </>
      )}
      {name === 'repeat' && (
        <>
          <Path
            d="M4 11a8 8 0 0 1 13.66-5.66L20 7.5"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <Path d="M20 4v3.5h-3.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <Path
            d="M20 13a8 8 0 0 1-13.66 5.66L4 16.5"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <Path d="M4 20v-3.5h3.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {name === 'bell' && (
        <>
          <Path
            d="M6 10a6 6 0 1 1 12 0c0 3.2 1 4.8 1.6 5.6a.8.8 0 0 1-.6 1.4H5a.8.8 0 0 1-.6-1.4C5 14.8 6 13.2 6 10Z"
            stroke={color}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <Path d="M9.5 19.5a2.5 2.5 0 0 0 5 0" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
      {name === 'shield' && (
        <Path
          d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-2.5Z"
          stroke={color}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      )}
      {name === 'doc' && (
        <>
          <Path
            d="M6.5 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5Z"
            stroke={color}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <Path d="M13.5 3.5V8h4" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
          <Path d="M8 13h8M8 16.5h5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
      {name === 'chevron' && (
        <Path
          d="m9 6 6 6-6 6"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {name === 'export' && (
        <>
          <Path d="M12 15V4M8 8l4-4 4 4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M4.5 14.5V18a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {name === 'import' && (
        <>
          <Path d="M12 4v11M8 11l4 4 4-4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M4.5 14.5V18a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {name === 'trash' && (
        <>
          <Path d="M4 6.5h16" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
          <Path
            d="M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.5"
            stroke={color}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <Path
            d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5"
            stroke={color}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        </>
      )}
      {name === 'target' && (
        <>
          <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={1.8} />
          <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={1.8} />
          <Circle cx={12} cy={12} r={1.4} fill={color} />
        </>
      )}
      {name === 'bank' && (
        <>
          <Path d="M3.5 9.5 12 4.5l8.5 5" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
          <Path d="M6 11.5v6M10 11.5v6M14 11.5v6M18 11.5v6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
          <Path d="M4 19.5h16" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
      {name === 'chart' && (
        <>
          <Path d="M4 19.5h16" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
          <Path d="M7 19.5V12M12 19.5V6M17 19.5v-5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
      {name === 'cards' && (
        <>
          <Rect x={3} y={7.5} width={13} height={11} rx={2.6} stroke={color} strokeWidth={1.8} />
          <Path d="M7.5 5h11a2.5 2.5 0 0 1 2.5 2.5v8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
      {name === 'chat' && (
        <>
          <Path
            d="M20.5 12.2c0 3.7-3.6 6.7-8 6.7-1 0-2-.15-2.9-.43L4.5 20l1.35-3.3C4.5 15.5 3.5 14 3.5 12.2c0-3.7 3.6-6.7 8-6.7s9 3 9 6.7Z"
            stroke={color}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        </>
      )}
      {name === 'star' && (
        <>
          <Path
            d="M12 4.5l2.35 4.76 5.25.77-3.8 3.7.9 5.23L12 16.49l-4.7 2.47.9-5.23-3.8-3.7 5.25-.77L12 4.5Z"
            stroke={color}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        </>
      )}
      {name === 'trend' && (
        <>
          <Path
            d="M4 15.5 9.5 10l3.5 3.5L20 7"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path d="M15 7h5v5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {name === 'coin' && (
        <>
          <Circle cx={12} cy={12} r={8.2} stroke={color} strokeWidth={1.8} />
          <Path
            d="M14.4 9.3c-.5-.6-1.4-1-2.4-1-1.5 0-2.5.8-2.5 1.9 0 2.4 5 1.2 5 3.6 0 1.1-1.1 1.9-2.6 1.9-1 0-1.9-.4-2.4-1"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <Path d="M12 7v10" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
      {name === 'camera' && (
        <>
          <Path
            d="M4.5 8.5h3l1.3-2.2a1.5 1.5 0 0 1 1.3-.8h3.8a1.5 1.5 0 0 1 1.3.8l1.3 2.2h3A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-8a1.5 1.5 0 0 1 1.5-1.5Z"
            stroke={color}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <Circle cx={12} cy={13.5} r={3.4} stroke={color} strokeWidth={1.8} />
        </>
      )}
      {name === 'people' && (
        <>
          <Circle cx={9.5} cy={8.5} r={3.2} stroke={color} strokeWidth={1.8} />
          <Path
            d="M3.5 19.5c0-3 2.7-5 6-5s6 2 6 5"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <Path
            d="M16.2 6.2a3.2 3.2 0 0 1 0 6M17.5 14.9c2 .6 3.5 2.3 3.5 4.6"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </>
      )}
      {name === 'share' && (
        <>
          <Circle cx={17.5} cy={6} r={2.6} stroke={color} strokeWidth={1.8} />
          <Circle cx={6.5} cy={12} r={2.6} stroke={color} strokeWidth={1.8} />
          <Circle cx={17.5} cy={18} r={2.6} stroke={color} strokeWidth={1.8} />
          <Path d="m8.9 10.8 6.2-3.4M8.9 13.2l6.2 3.4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}
