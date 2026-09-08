import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import AppText from './AppText';
import { useTheme } from '../ThemeContext';
import { font, radius, type Theme } from '../theme';
import { toKey, fromKey, prettyDate, todayKey } from '../dateUtils';

type Props = {
  /**
   * Called once the picker is finished with. Date mode fires it as soon as a
   * day is chosen — a calendar that stays open after you have picked reads as
   * a control that did not hear you. Time mode never does: the steppers are
   * pressed several times to reach a value.
   */
  onClose?: () => void;
} & (
  | { mode: 'date'; value: string; onChange: (key: string) => void } // value/return: YYYY-MM-DD
  | { mode: 'time'; value: string; onChange: (hhmm: string) => void } // value/return: HH:MM
);

/**
 * The one date and time control in the app.
 *
 * It used to hand the web build a bare <input type="date">, which arrived as a
 * white box in the middle of a dark screen and asked people to type
 * "08/09/2026" by hand. Both modes are drawn here now, in the app's own
 * colours and on every platform, so a date is picked off a calendar you can
 * see and a time is nudged with a thumb. Every date field in the app goes
 * through this component, so they all change together.
 */
export default function PlatformDateTimePicker(props: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (props.mode === 'time') {
    return <TimePicker value={props.value} onChange={props.onChange} />;
  }

  const { value, onChange } = props;
  const today = todayKey();

  /** One day picked, by chip or by grid, is the whole job of this control. */
  const choose = (key: string) => {
    onChange(key);
    props.onClose?.();
  };

  // Named days first: most dates people enter are today or the next day or
  // two, and finding those on a grid is work the app can save them.
  const shortcuts = [
    { label: 'Today', key: today },
    { label: 'Tomorrow', key: shiftDays(today, 1) },
    { label: 'Next week', key: shiftDays(today, 7) },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.shortcuts}>
        {shortcuts.map((s) => {
          const on = value === s.key;
          return (
            <Pressable
              key={s.label}
              onPress={() => choose(s.key)}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <AppText
                variant={on ? 'bodySemi' : 'body'}
                color={on ? colors.onAction : undefined}
                style={styles.chipText}
              >
                {s.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <Calendar
        current={value || today}
        onDayPress={(d) => choose(d.dateString)}
        markedDates={{ [value]: { selected: true } }}
        enableSwipeMonths
        hideExtraDays
        firstDay={1}
        theme={{
          calendarBackground: 'transparent',
          monthTextColor: colors.text,
          textMonthFontFamily: font.displaySemi,
          textMonthFontSize: 16,
          arrowColor: colors.iris,
          textSectionTitleColor: colors.textMuted,
          textDayHeaderFontFamily: font.bodySemi,
          textDayHeaderFontSize: 11,
          dayTextColor: colors.text,
          textDayFontFamily: font.body,
          textDayFontSize: 14,
          todayTextColor: colors.sage,
          selectedDayBackgroundColor: colors.action,
          selectedDayTextColor: colors.onAction,
          textDisabledColor: colors.textMuted,
          weekVerticalMargin: 5,
        }}
        style={styles.calendar}
      />

      <AppText variant="mono" muted style={styles.readout}>
        {value ? prettyDate(value) : 'Pick a day'}
      </AppText>
    </View>
  );
}

/**
 * Hours and minutes on steppers.
 *
 * A wheel is lovely on a phone and unavailable on the web, and this is the one
 * shape that behaves the same in both places. Minutes move in fives, which is
 * the resolution anyone actually schedules at.
 */
function TimePicker({ value, onChange }: { value: string; onChange: (hhmm: string) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [h, m] = parseHHMM(value);
  const set = (hh: number, mm: number) =>
    onChange(
      `${String(((hh % 24) + 24) % 24).padStart(2, '0')}:${String(((mm % 60) + 60) % 60).padStart(2, '0')}`
    );

  const bumpMinute = (by: number) => {
    const wrapped = (((h * 60 + m + by) % 1440) + 1440) % 1440;
    set(Math.floor(wrapped / 60), wrapped % 60);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.timeRow}>
        <Unit
          label="Hour"
          value={String(h).padStart(2, '0')}
          onDown={() => set(h - 1, m)}
          onUp={() => set(h + 1, m)}
        />
        <AppText variant="monoBold" style={styles.colon}>
          :
        </AppText>
        <Unit
          label="Minute"
          value={String(m).padStart(2, '0')}
          onDown={() => bumpMinute(-5)}
          onUp={() => bumpMinute(5)}
        />
      </View>

      <View style={styles.shortcuts}>
        {['09:00', '12:00', '18:00', '20:00'].map((t) => {
          const on = value === t;
          return (
            <Pressable
              key={t}
              onPress={() => onChange(t)}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <AppText variant="mono" color={on ? colors.onAction : colors.textMuted} style={styles.chipText}>
                {t}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Unit({
  label,
  value,
  onUp,
  onDown,
}: {
  label: string;
  value: string;
  onUp: () => void;
  onDown: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.unit}>
      <AppText variant="label" muted style={styles.unitLabel}>
        {label}
      </AppText>
      <View style={styles.stepper}>
        <Pressable onPress={onDown} style={styles.stepBtn} hitSlop={6} accessibilityLabel={`${label} down`}>
          <AppText variant="bodySemi" color={colors.iris}>
            −
          </AppText>
        </Pressable>
        <AppText variant="monoBold" style={styles.unitValue}>
          {value}
        </AppText>
        <Pressable onPress={onUp} style={styles.stepBtn} hitSlop={6} accessibilityLabel={`${label} up`}>
          <AppText variant="bodySemi" color={colors.iris}>
            +
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

/** Tolerates a blank or malformed value rather than rendering NaN. */
function parseHHMM(v: string): [number, number] {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(v ?? '');
  if (!match) return [9, 0];
  return [Math.min(23, Number(match[1])), Math.min(59, Number(match[2]))];
}

function shiftDays(key: string, by: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + by);
  return toKey(d);
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    wrap: {
      marginTop: 10,
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      paddingVertical: 12,
      paddingHorizontal: 8,
    },
    shortcuts: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 6,
      paddingBottom: 4,
    },
    chip: {
      backgroundColor: c.haze,
      borderRadius: radius.pill,
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: c.line,
    },
    chipOn: { backgroundColor: c.action, borderColor: c.action },
    chipText: { fontSize: 13 },
    calendar: { backgroundColor: 'transparent' },
    readout: { textAlign: 'center', fontSize: 11, paddingBottom: 4 },

    timeRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: 6,
      paddingBottom: 14,
    },
    unit: { alignItems: 'center' },
    unitLabel: { marginBottom: 6 },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.haze,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
    },
    stepBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
    unitValue: { fontSize: 20, minWidth: 34, textAlign: 'center' },
    colon: { fontSize: 20, paddingBottom: 12 },
  });
}
