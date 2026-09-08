import { createElement, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View } from 'react-native';

import AppText from './AppText';
import { useTheme } from '../ThemeContext';
import { type Theme } from '../theme';

type Props = {
  day: number | null;
  onChange: (d: number | null) => void;
  activeColor?: string; // defaults to gold
  compact?: boolean; // smaller track for space-constrained screens (onboarding)
};

const MIN_DAY = 1;
const MAX_DAY = 31;

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function dayFromRatio(ratio: number): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  return MIN_DAY + Math.round(clamped * (MAX_DAY - MIN_DAY));
}

/** A 1–31 day-of-month slider with a live "the Nth of each month" hint. */
export default function DayOfMonthGrid({ day, onChange, activeColor, compact }: Props) {
  const { colors } = useTheme();
  const thumbSize = compact ? 26 : 34;
  const styles = useMemo(() => makeStyles(colors, !!compact, thumbSize), [colors, compact]);
  const active = activeColor ?? colors.gold;
  const isSet = day != null;
  const shownDay = day ?? MIN_DAY;

  const header = (
    <View style={styles.headerRow}>
      <AppText variant="mono" muted>
        {isSet ? `the ${ordinal(shownDay)} of each month` : 'pick a day'}
      </AppText>
      {isSet && (
        <View style={[styles.badge, { backgroundColor: active }]}>
          <AppText variant="monoBold" color={colors.onGold} style={styles.badgeText}>
            {shownDay}
          </AppText>
        </View>
      )}
    </View>
  );

  const endsRow = (
    <View style={styles.endsRow}>
      <AppText variant="mono" muted style={styles.endLabel}>
        1
      </AppText>
      <AppText variant="mono" muted style={styles.endLabel}>
        31
      </AppText>
    </View>
  );

  // The web build uses a real <input type="range"> — a custom PanResponder
  // drag surface is a native-touch idiom that's inconsistently picked up by
  // browser mouse emulation, whereas a native range input gets correct
  // mouse, touch and keyboard behaviour for free.
  if (Platform.OS === 'web') {
    return (
      <View>
        {header}
        {createElement('input', {
          type: 'range',
          min: MIN_DAY,
          max: MAX_DAY,
          step: 1,
          value: shownDay,
          onChange: (e: any) => onChange(Number(e.target.value)),
          style: {
            width: '100%',
            height: thumbSize,
            accentColor: isSet ? active : colors.textMuted,
            cursor: 'pointer',
          },
        })}
        {endsRow}
      </View>
    );
  }

  return <NativeSlider {...{ day, onChange, styles, active, colors, thumbSize, compact }} header={header} endsRow={endsRow} />;
}

function NativeSlider({
  day,
  onChange,
  styles,
  active,
  colors,
  thumbSize,
  compact,
  header,
  endsRow,
}: {
  day: number | null;
  onChange: (d: number | null) => void;
  styles: ReturnType<typeof makeStyles>;
  active: string;
  colors: Theme;
  thumbSize: number;
  compact?: boolean;
  header: React.ReactNode;
  endsRow: React.ReactNode;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const isSet = day != null;
  const shownDay = day ?? MIN_DAY;
  const ratio = (shownDay - MIN_DAY) / (MAX_DAY - MIN_DAY);

  // The responder is created once and kept for the life of the component, so
  // anything it reads has to come from a ref. Reading state directly here
  // captured the values from the very first render — when the track had not
  // been measured and its width was still 0 — which made every drag exit
  // early and the slider silently do nothing on a device.
  const widthRef = useRef(0);
  const leftRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const areaRef = useRef<View>(null);

  const measure = () => {
    areaRef.current?.measureInWindow((x, _y, w) => {
      leftRef.current = x;
      if (w > 0) {
        widthRef.current = w;
        setTrackWidth(w);
      }
    });
  };

  /**
   * Positions are taken from the gesture's page coordinates rather than the
   * event's `locationX`. On Android `locationX` is measured against whichever
   * view the touch landed on and is unreliable once a drag is moving, so a
   * slow drag across the track reports positions that jump about.
   */
  const setFromPageX = (pageX: number) => {
    const width = widthRef.current;
    if (width <= 0) return;
    onChangeRef.current(dayFromRatio((pageX - leftRef.current) / width));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Claim the gesture so a parent ScrollView doesn't steal the drag.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_e, g) => setFromPageX(g.x0),
      onPanResponderMove: (_e, g) => setFromPageX(g.moveX),
    })
  ).current;

  // Thumb travels between its own half-width and (trackWidth - half-width)
  // so it never spills past the ends of the track.
  const usable = Math.max(0, trackWidth - thumbSize);
  const thumbLeft = ratio * usable;
  const fillWidth = thumbLeft + thumbSize / 2;
  const trackHeight = compact ? 6 : 8;

  return (
    <View>
      {header}

      <View
        ref={areaRef}
        style={styles.touchArea}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          widthRef.current = w;
          setTrackWidth(w);
          // Also needs the track's position on screen, which layout does not
          // give — measured after the frame so the value is settled.
          requestAnimationFrame(measure);
        }}
        {...panResponder.panHandlers}
      >
        <View
          pointerEvents="none"
          style={[styles.track, { height: trackHeight, borderRadius: trackHeight }]}
        >
          {trackWidth > 0 && (
            <View
              style={[
                styles.fill,
                {
                  width: fillWidth,
                  height: trackHeight,
                  borderRadius: trackHeight,
                  backgroundColor: isSet ? active : colors.line,
                },
              ]}
            />
          )}
        </View>
        {trackWidth > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                width: thumbSize,
                height: thumbSize,
                borderRadius: thumbSize / 2,
                left: thumbLeft,
                backgroundColor: isSet ? active : colors.mist,
                borderColor: isSet ? active : colors.line,
              },
            ]}
          />
        )}
      </View>

      {endsRow}
    </View>
  );
}

function makeStyles(c: Theme, compact: boolean, thumbSize: number) {
  return StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: compact ? 10 : 14,
    },
    badge: {
      minWidth: compact ? 26 : 30,
      height: compact ? 22 : 26,
      borderRadius: compact ? 11 : 13,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: { fontSize: compact ? 12 : 13 },
    touchArea: {
      height: thumbSize + 8,
      justifyContent: 'center',
    },
    track: {
      backgroundColor: c.line,
      overflow: 'hidden',
    },
    fill: { position: 'absolute', left: 0, top: 0 },
    thumb: {
      position: 'absolute',
      borderWidth: 2,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    endsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    endLabel: { fontSize: compact ? 11 : 12, opacity: 0.7 },
  });
}
