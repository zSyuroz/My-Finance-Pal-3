import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import type { NavigationAction } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import { useOnce } from '../components/useOnce';
import ConfirmDialog from '../components/ConfirmDialog';
import PlatformDateTimePicker from '../components/PlatformDateTimePicker';
import {
  deleteEvent,
  eventsForDate,
  uid,
  upsertEvent,
  type EventRow,
} from '../db';
import { fmtTime, prettyDate } from '../dateUtils';
import {
  cancelEventReminder,
  reminderDate,
  reminderLabel,
  reminderOptions,
  snapReminder,
  syncEventReminder,
} from '../reminders';
import { useTheme } from '../ThemeContext';
import { EVENT_COLORS, font, radius, type Theme } from '../theme';
import type { CalendarStackParams } from '../navigation';

type Props = NativeStackScreenProps<CalendarStackParams, 'EventEditor'>;

type Fields = {
  title: string;
  notes: string;
  day: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  color: string;
  reminder: number | null;
};

export default function EventEditorScreen({ route, navigation }: Props) {
  const { id, date } = route.params;
  const isNew = !id;

  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [day, setDay] = useState(date);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [color, setColor] = useState(EVENT_COLORS[0]);
  const [reminder, setReminder] = useState<number | null>(null);
  const [picker, setPicker] = useState<null | 'day' | 'start' | 'end' | 'reminder'>(null);
  const [loaded, setLoaded] = useState(isNew);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [discardVisible, setDiscardVisible] = useState(false);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const baseline = useRef<Fields>({
    title: '',
    notes: '',
    day: date,
    allDay: false,
    startTime: '09:00',
    endTime: '10:00',
    color: EVENT_COLORS[0],
    reminder: null,
  });
  const hasChangesRef = useRef(false);
  const leavingRef = useRef(false); // set once we've decided to actually leave
  const pendingLeaveAction = useRef<NavigationAction | null>(null);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const rows = await eventsForDate(date);
      const found = rows.find((r) => r.id === id);
      if (found) {
        setTitle(found.title);
        setNotes(found.notes);
        setDay(found.date);
        setAllDay(!!found.allDay);
        setStartTime(found.startTime ?? '09:00');
        setEndTime(found.endTime ?? '10:00');
        setColor(found.color);
        setReminder(found.reminderMinutes);
        baseline.current = {
          title: found.title,
          notes: found.notes,
          day: found.date,
          allDay: !!found.allDay,
          startTime: found.startTime ?? '09:00',
          endTime: found.endTime ?? '10:00',
          color: found.color,
          reminder: found.reminderMinutes,
        };
      }
      setLoaded(true);
    })();
  }, [id, date, isNew]);

  const hasChanges =
    title !== baseline.current.title ||
    notes !== baseline.current.notes ||
    day !== baseline.current.day ||
    allDay !== baseline.current.allDay ||
    startTime !== baseline.current.startTime ||
    endTime !== baseline.current.endTime ||
    color !== baseline.current.color ||
    reminder !== baseline.current.reminder;

  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);

  // Leaving with unsaved changes — header back arrow, hardware back, or an
  // edge swipe — asks first, same as Notes.
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (leavingRef.current || !hasChangesRef.current) return;
      e.preventDefault();
      pendingLeaveAction.current = e.data.action;
      setDiscardVisible(true);
    });
  }, [navigation]);

  const confirmDiscard = () => {
    setDiscardVisible(false);
    leavingRef.current = true;
    const action = pendingLeaveAction.current;
    if (action) navigation.dispatch(action);
  };

  // One press, one record: each save mints a fresh id, so a second tap
  // during the write would store the same thing twice.
  const save = useOnce(async () => {
    if (saving) return; // a second tap while the first is still writing
    setSaving(true);
    const row: EventRow = {
      id: id ?? uid(),
      title: title.trim(),
      notes: notes.trim(),
      date: day,
      startTime: allDay ? null : startTime,
      endTime: allDay ? null : endTime,
      allDay: allDay ? 1 : 0,
      color,
      reminderMinutes: reminder,
    };

    try {
      await upsertEvent(row);
    } catch (err) {
      // Nothing below this point runs if the write fails, and without a
      // message the screen simply sits there — tapping Save appears to do
      // nothing at all, which is indistinguishable from a dead button.
      setSaving(false);
      setSaveError(
        (err instanceof Error ? err.message : 'Something went wrong while saving.') +
          '\n\nYour event has not been saved. Try again, and if it keeps failing, restart the app.'
      );
      return;
    }

    // The event is saved either way; only the reminder can fail. Saying so
    // beats a silent no-op — a reminder you think is set and isn't is worse
    // than no reminder at all. A failure here must not lose the event, so it
    // is reported without blocking the save.
    let scheduled = false;
    try {
      scheduled = await syncEventReminder(row);
    } catch {
      scheduled = false;
    }
    setSaving(false);

    if (reminder != null && !scheduled) {
      const when = reminderDate(row);
      setReminderNotice(
        Platform.OS === 'web'
          ? 'The event is saved, but reminders only work in the installed app, not in a browser.'
          : when && when.getTime() <= Date.now()
            ? 'The event is saved, but that reminder time has already passed, so no notification was set.'
            : 'The event is saved, but notifications are turned off, so no reminder was set. You can turn them on in Settings.'
      );
      return;
    }

    leavingRef.current = true;
    navigation.goBack();
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isNew ? 'New event' : 'Edit event',
      headerRight: () => (
        <Pressable onPress={save} hitSlop={10}>
          <AppText variant="bodySemi" color={colors.iris}>
            Save
          </AppText>
        </Pressable>
      ),
    });
  });

  const doDelete = async () => {
    setDeleteVisible(false);
    leavingRef.current = true;
    if (id) {
      await deleteEvent(id);
      // A pending reminder for a deleted event would still fire otherwise.
      await cancelEventReminder(id);
    }
    navigation.goBack();
  };

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <View style={styles.row}>
      <AppText variant="bodyMed">{label}</AppText>
      <View>{children}</View>
    </View>
  );

  if (!loaded) return <View style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TextInput
        style={styles.titleInput}
        placeholder="Event title"
        placeholderTextColor={colors.textMuted}
        value={title}
        onChangeText={setTitle}
        autoFocus={isNew}
      />

      <View style={styles.card}>
        <Row label="Date">
          <Pressable onPress={() => setPicker(picker === 'day' ? null : 'day')}>
            <AppText variant="mono" color={colors.iris}>
              {prettyDate(day)}
            </AppText>
          </Pressable>
        </Row>
        {picker === 'day' && (
          <PlatformDateTimePicker
            mode="date"
            value={day}
            onChange={setDay}
            onClose={() => setPicker(null)}
          />
        )}

        <Row label="All day">
          <Switch
            value={allDay}
            onValueChange={(next) => {
              setAllDay(next);
              setReminder((current) => snapReminder(current, next));
            }}
            trackColor={{ true: colors.iris }}
          />
        </Row>

        {!allDay && (
          <>
            <Row label="Starts">
              <Pressable onPress={() => setPicker(picker === 'start' ? null : 'start')}>
                <AppText variant="mono" color={colors.iris}>
                  {fmtTime(startTime)}
                </AppText>
              </Pressable>
            </Row>
            {picker === 'start' && (
              <PlatformDateTimePicker
                mode="time"
                value={startTime}
                onChange={setStartTime}
              />
            )}

            <Row label="Ends">
              <Pressable onPress={() => setPicker(picker === 'end' ? null : 'end')}>
                <AppText variant="mono" color={colors.iris}>
                  {fmtTime(endTime)}
                </AppText>
              </Pressable>
            </Row>
            {picker === 'end' && (
              <PlatformDateTimePicker
                mode="time"
                value={endTime}
                onChange={setEndTime}
              />
            )}
          </>
        )}

        <Row label="Reminder">
          <Pressable onPress={() => setPicker(picker === 'reminder' ? null : 'reminder')}>
            <AppText variant="mono" color={reminder == null ? colors.textMuted : colors.iris}>
              {reminderLabel(reminder, allDay)}
            </AppText>
          </Pressable>
        </Row>
        {picker === 'reminder' && (
          <View style={styles.options}>
            {reminderOptions(allDay).map((option) => {
              const selected = option.minutes === reminder;
              return (
                <Pressable
                  key={String(option.minutes)}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => {
                    setReminder(option.minutes);
                    setPicker(null);
                  }}
                >
                  <AppText variant={selected ? 'bodySemi' : 'body'}>{option.label}</AppText>
                  {selected && (
                    <AppText variant="bodySemi" color={colors.iris}>
                      ✓
                    </AppText>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <AppText variant="label" muted style={styles.sectionLabel}>
        Color
      </AppText>
      <View style={styles.colorRow}>
        {EVENT_COLORS.map((cc) => (
          <Pressable
            key={cc}
            onPress={() => setColor(cc)}
            style={[
              styles.swatch,
              { backgroundColor: cc },
              color === cc && styles.swatchActive,
            ]}
          />
        ))}
      </View>

      <AppText variant="label" muted style={styles.sectionLabel}>
        Notes
      </AppText>
      <TextInput
        style={styles.notesInput}
        placeholder="Add notes"
        placeholderTextColor={colors.textMuted}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      {!isNew && (
        <Pressable style={styles.deleteBtn} onPress={() => setDeleteVisible(true)}>
          <AppText variant="bodySemi" color={colors.danger}>
            Delete event
          </AppText>
        </Pressable>
      )}

      <ConfirmDialog
        visible={discardVisible}
        title={isNew ? 'Discard this event?' : 'Discard your changes?'}
        message={isNew ? "You haven't saved it yet." : "Your edits haven't been saved."}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={confirmDiscard}
        onCancel={() => setDiscardVisible(false)}
      />
      <ConfirmDialog
        visible={deleteVisible}
        title="Delete event"
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={doDelete}
        onCancel={() => setDeleteVisible(false)}
      />
      <ConfirmDialog
        visible={!!saveError}
        title="Couldn't save this event"
        message={saveError ?? ''}
        confirmLabel="OK"
        onConfirm={() => setSaveError(null)}
      />
      <ConfirmDialog
        visible={!!reminderNotice}
        title="Reminder not set"
        message={reminderNotice ?? ''}
        confirmLabel="OK"
        onConfirm={() => {
          setReminderNotice(null);
          leavingRef.current = true;
          navigation.goBack();
        }}
      />
    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 48 },
    titleInput: {
      fontFamily: font.display,
      fontSize: 22,
      color: c.text,
      paddingVertical: 10,
      marginBottom: 14,
      letterSpacing: -0.3,
    },
    card: {
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      paddingHorizontal: 16,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 15,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    options: { paddingBottom: 8 },
    option: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
    },
    optionSelected: { backgroundColor: c.haze },
    sectionLabel: { marginTop: 24, marginBottom: 10, marginLeft: 2 },
    colorRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
    swatch: { width: 34, height: 34, borderRadius: 17 },
    swatchActive: { borderWidth: 3, borderColor: c.text },
    notesInput: {
      fontFamily: font.body,
      minHeight: 110,
      fontSize: 15,
      lineHeight: 22,
      color: c.text,
      backgroundColor: c.mist,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      padding: 14,
      textAlignVertical: 'top',
    },
    deleteBtn: { marginTop: 28, alignItems: 'center', padding: 12 },
  });
}
