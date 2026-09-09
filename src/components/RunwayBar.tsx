import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../ThemeContext';
import { type Theme } from '../theme';

type Props = {
  fraction: number; // 0..1 progress through the pay cycle
  onInk?: boolean; // rendered on a dark ink surface
  height?: number;
};

/**
 * The pay-cycle runway: how far through the current cycle you are.
 * A quiet track with a gold fill and a coin-knob at the leading edge.
 */
export default function RunwayBar({ fraction, onInk = false, height = 8 }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pct = `${Math.max(2, Math.min(100, fraction * 100))}%` as const;

  return (
    <View style={[styles.track, { height, borderRadius: height }, onInk && styles.trackOnInk]}>
      <View
        style={[
          styles.fill,
          { width: pct, borderRadius: height },
        ]}
      />
      <View style={[styles.knob, { left: pct, width: height + 6, height: height + 6 }]} />
    </View>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    track: {
      backgroundColor: c.line,
      overflow: 'visible',
      justifyContent: 'center',
    },
    trackOnInk: { backgroundColor: 'rgba(255,255,255,0.16)' },
    fill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: c.gold,
    },
    knob: {
      position: 'absolute',
      marginLeft: -8,
      borderRadius: 999,
      backgroundColor: c.gold,
      borderWidth: 2,
      borderColor: '#EAF1FB',
    },
  });
}
