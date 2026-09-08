import { useLayoutEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import { useTheme } from '../ThemeContext';
import { type Theme } from '../theme';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'Legal'>;

type Section = { heading: string; body: string };

const PRIVACY: Section[] = [
  {
    heading: 'What stays on your device',
    body: 'Everything: your calendar events, notes, expenses, recurring expenses, and payday details are stored in a local database on your phone. There is no account and no server — this app has nowhere else to send your data.',
  },
  {
    heading: 'What we collect',
    body: "Nothing. There's no analytics, no tracking, no ads, and nothing is shared with anyone, including us.",
  },
  {
    heading: 'Notifications',
    body: 'If you turn notifications on, reminders (like a payday alert) are scheduled locally on your device by the operating system. Enabling them sends nothing off the device.',
  },
  {
    heading: 'Deleting your data',
    body: "Uninstalling the app, or clearing its storage in your phone's settings, permanently deletes everything it stored. There is no backup copy anywhere else — see Terms below.",
  },
];

const TERMS: Section[] = [
  {
    heading: 'A personal tool',
    body: 'This app is a personal planner and expense tracker, provided as-is with no warranty. It is not a bank, a financial institution, or licensed financial advice — the numbers it shows (spending, saved, payday) are for your own reference only.',
  },
  {
    heading: 'Your data, your backup',
    body: "All data lives only on this device — there is no cloud sync. Use Settings → Export data to save a backup file, and Import data to load it on a new phone. If the device is lost, reset, or the app is uninstalled without exporting first, that data is gone.",
  },
  {
    heading: 'No liability',
    body: "We aren't liable for missed reminders, lost data, or decisions made based on figures shown in the app. Use your own judgment, especially for anything financial.",
  },
  {
    heading: 'Changes',
    body: 'These terms may change as the app changes. Continuing to use the app means you accept the current version.',
  },
];

export default function LegalScreen({ route, navigation }: Props) {
  const { kind } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const sections = kind === 'privacy' ? PRIVACY : TERMS;
  const title = kind === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions';

  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppText variant="mono" muted style={styles.updated}>
        Last updated September 2026
      </AppText>
      {sections.map((s) => (
        <View key={s.heading} style={styles.section}>
          <AppText variant="title" style={styles.heading}>
            {s.heading}
          </AppText>
          <AppText variant="body" muted>
            {s.body}
          </AppText>
        </View>
      ))}
    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 48 },
    updated: { marginBottom: 20 },
    section: { marginBottom: 22 },
    heading: { marginBottom: 6 },
  });
}
