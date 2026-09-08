import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import ConfirmDialog from '../components/ConfirmDialog';
import PlatformDateTimePicker from '../components/PlatformDateTimePicker';
import UnsavedChangesGuard from '../components/UnsavedChangesGuard';
import { deleteGoal, getGoal, uid, upsertGoal, type GoalRow } from '../db';
import { prettyDate, todayKey } from '../dateUtils';
import { goalStatus } from '../goals';
import { fmtMoney } from '../spending';
import { useTheme } from '../ThemeContext';
import { radius, type Theme } from '../theme';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'GoalEditor'>;

/**
 * One goal, on its own screen.
 *
 * The form used to unfold below the list, so tapping a goal put its fields
 * under the very cards you were reading and pushed the goal itself off the
 * top. Pushing a screen keeps the thing you tapped in front of you and gives
 * the back arrow something to mean.
 */
export default function GoalEditorScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const id = route.params?.id;
  const isNew = !id;

  const [existing, setExisting] = useState<GoalRow | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  // Set when we leave on purpose, so the guard does not question our own exit.
  const leaving = useRef(false);

  useEffect(() => {
    navigation.setOptions({ title: isNew ? 'Add a goal' : 'Edit goal' });
  }, [navigation, isNew]);

  useEffect(() => {
    if (!id) return;
    getGoal(id).then((row) => {
      if (row) {
        setExisting(row);
        setName(row.name);
        setTarget(String(row.target));
        setSaved(String(row.saved));
        setDue(row.dueDate);
      }
      setLoaded(true);
    });
  }, [id]);

  const num = (v: string) => Math.abs(Number(v.replace(/[^0-9.]/g, '')) || 0);

  // What the deadline actually asks of you, updated as you type — the whole
  // point of putting a date on a target is seeing the monthly number it implies.
  const preview = (() => {
    const t = num(target);
    if (!(t > 0)) return null;
    return goalStatus(
      { id: id ?? '', name: name.trim(), target: t, saved: num(saved), dueDate: due, createdAt: 0 },
      todayKey()
    ).summary(fmtMoney);
  })();

  const canSave = !!name.trim();
  const dirty =
    loaded &&
    canSave &&
    (isNew ||
      name !== (existing?.name ?? '') ||
      num(target) !== (existing?.target ?? 0) ||
      num(saved) !== (existing?.saved ?? 0) ||
      due !== (existing?.dueDate ?? null));

  const persist = async () => {
    if (!canSave) return;
    await upsertGoal({
      id: id || uid(),
      name: name.trim(),
      target: num(target),
      saved: num(saved),
      dueDate: due,
      createdAt: existing?.createdAt || Date.now(),
    });
  };

  const save = async () => {
    await persist();
    leaving.current = true;
    navigation.goBack();
  };

  if (!loaded) return <View style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <UnsavedChangesGuard
        dirty={dirty}
        onSave={persist}
        leavingRef={leaving}
        title="Save this goal?"
        message="You've filled in a goal without saving it."
      />

      <AppText variant="label" muted style={styles.fieldLabel}>
        What for
      </AppText>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Emergency fund"
        placeholderTextColor={colors.textMuted}
        autoFocus={isNew}
      />

      <View style={styles.pairRow}>
        <View style={styles.pairField}>
          <AppText variant="label" muted style={styles.fieldLabel}>
            Target
          </AppText>
          <TextInput
            style={styles.input}
            value={target}
            onChangeText={setTarget}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.pairField}>
          <AppText variant="label" muted style={styles.fieldLabel}>
            Saved so far
          </AppText>
          <TextInput
            style={styles.input}
            value={saved}
            onChangeText={setSaved}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
          />
        </View>
      </View>

      <AppText variant="label" muted style={[styles.fieldLabel, styles.spaced]}>
        By when
      </AppText>
      <Pressable style={styles.dateRow} onPress={() => setShowDate((v) => !v)}>
        <AppText variant="mono" color={due ? colors.iris : colors.textMuted}>
          {due ? prettyDate(due) : 'No deadline'}
        </AppText>
        {!!due && (
          <Pressable onPress={() => setDue(null)} hitSlop={8}>
            <AppText variant="mono" muted>
              clear
            </AppText>
          </Pressable>
        )}
      </Pressable>
      {showDate && (
        <PlatformDateTimePicker
          mode="date"
          value={due ?? todayKey()}
          onChange={setDue}
          onClose={() => setShowDate(false)}
        />
      )}

      {!!preview && (
        <AppText variant="mono" muted style={styles.hint}>
          {preview}
        </AppText>
      )}

      <Pressable style={styles.saveBtn} onPress={save} disabled={!canSave}>
        <AppText variant="bodySemi" color={canSave ? colors.onAction : colors.textMuted}>
          {isNew ? 'Add goal' : 'Save'}
        </AppText>
      </Pressable>

      {!isNew && (
        <Pressable style={styles.deleteBtn} onPress={() => setDeleteVisible(true)}>
          <AppText variant="bodySemi" color={colors.danger}>
            Delete this goal
          </AppText>
        </Pressable>
      )}

      <ConfirmDialog
        visible={deleteVisible}
        title={`Delete ${existing?.name ?? 'this goal'}?`}
        message="The goal goes; any money you actually set aside is unaffected."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={async () => {
          setDeleteVisible(false);
          leaving.current = true;
          if (id) await deleteGoal(id);
          navigation.goBack();
        }}
        onCancel={() => setDeleteVisible(false)}
      />
    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 60 },
    fieldLabel: { marginBottom: 8, marginLeft: 2 },
    spaced: { marginTop: 18 },
    input: {
      backgroundColor: c.mist,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      height: 48,
      color: c.text,
      fontFamily: 'Archivo_400Regular',
      fontSize: 16,
    },
    hint: { marginTop: 12, fontSize: 11, lineHeight: 16 },
    pairRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
    pairField: { flex: 1 },
    dateRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.mist,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      height: 48,
    },
    saveBtn: {
      height: 50,
      borderRadius: radius.md,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 26,
    },
    deleteBtn: { alignItems: 'center', paddingTop: 20, paddingBottom: 4 },
  });
}
