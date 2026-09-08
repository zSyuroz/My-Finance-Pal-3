import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppText from '../components/AppText';
import Avatar from '../components/Avatar';
import RowIcon from '../components/RowIcon';
import { Chevron, makeSettingsStyles, SettingsRow } from '../components/SettingsRow';
import ConfirmDialog from '../components/ConfirmDialog';
import { getProfile, type Profile } from '../db';
import {
  APP_VERSION,
  FEEDBACK_EMAIL,
  openFeedback,
  openStoreReview,
  PUBLISHED_ON_STORE,
} from '../feedback';
import { useTheme } from '../ThemeContext';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'SettingsHome'>;

/**
 * A hub of categories rather than one long scroll.
 *
 * Everything used to live on this screen, which meant scrolling past four
 * unrelated groups to reach the fifth. Each group is its own screen now, and
 * this page's job is to say what those groups hold — the line under each row
 * carries enough that you rarely have to open one to find out.
 */
export default function SettingsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);

  const [profile, setProfileState] = useState<Profile>({ name: '', avatar: null });
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null);

  // Neither of these is allowed to fail silently: a tap that appears to do
  // nothing reads as a broken app, so an unopenable link becomes a dialog
  // with the address in it.
  const onFeedback = async () => {
    if ((await openFeedback()) === 'unavailable') {
      setDialog({
        title: 'No mail app set up',
        message: `Send anything you like — bugs, ideas, complaints — to ${FEEDBACK_EMAIL}`,
      });
    }
  };

  const onRate = async () => {
    if (!PUBLISHED_ON_STORE) {
      setDialog({
        title: 'Not on the store yet',
        message: `There's no listing to rate while this is still a test build. Anything you would have written in a review is more useful sent to ${FEEDBACK_EMAIL} — it can still change the app.`,
      });
      return;
    }
    if ((await openStoreReview()) === 'unavailable') {
      setDialog({
        title: "Couldn't open the store",
        message: `Search for the app by name in your app store, or send your thoughts to ${FEEDBACK_EMAIL} instead.`,
      });
    }
  };

  useFocusEffect(
    useCallback(() => {
      getProfile().then(setProfileState);
    }, [])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <AppText variant="display">Settings</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Given its own card at the top: a name and face is who the app is
            for, not another preference sitting among the toggles. */}
        <Pressable style={styles.profileCard} onPress={() => navigation.navigate('Profile')}>
          <Avatar name={profile.name} uri={profile.avatar} size={52} />
          <View style={styles.profileText}>
            <AppText variant="title">{profile.name || 'Add your name'}</AppText>
            <AppText variant="body" muted>
              {profile.name ? 'Name and picture' : 'Tap to set up your profile'}
            </AppText>
          </View>
          <RowIcon name="chevron" color={colors.textMuted} size={18} />
        </Pressable>

        <View style={styles.card}>
          <SettingsRow
            icon="theme"
            label="App preferences"
            sub="Theme, notifications, home cards"
            onPress={() => navigation.navigate('AppPreferences')}
            right={<Chevron />}
          />
          <SettingsRow
            icon="coin"
            label="Finances"
            sub="Currency, pay rhythm, accounts, budgets, goals"
            onPress={() => navigation.navigate('MoneySettings')}
            right={<Chevron />}
          />
          <SettingsRow
            icon="export"
            label="Data"
            sub="Export, import, erase everything"
            last
            onPress={() => navigation.navigate('DataSettings')}
            right={<Chevron />}
          />
        </View>

        {/* The same two-line rows as the categories above: a label alone
            reads as a different kind of list, and each of these has something
            worth saying about where it goes. */}
        <View style={[styles.card, styles.cardSpaced]}>
          <SettingsRow
            icon="chat"
            label="Send feedback"
            sub="Bugs, ideas, anything missing"
            onPress={onFeedback}
            right={<Chevron />}
          />
          <SettingsRow
            icon="star"
            label="Rate this app"
            sub="Leave a review on the store"
            onPress={onRate}
            right={<Chevron />}
          />
          <SettingsRow
            icon="shield"
            label="Privacy Policy"
            sub="What the app stores and where"
            onPress={() => navigation.navigate('Legal', { kind: 'privacy' })}
            right={<Chevron />}
          />
          <SettingsRow
            icon="doc"
            label="Terms & Conditions"
            sub="The terms you're using it under"
            last
            onPress={() => navigation.navigate('Legal', { kind: 'terms' })}
            right={<Chevron />}
          />
        </View>

        <AppText variant="mono" muted style={styles.version}>
          Version {APP_VERSION}
        </AppText>
      </ScrollView>

      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        confirmLabel="OK"
        onConfirm={() => setDialog(null)}
      />
    </SafeAreaView>
  );
}
