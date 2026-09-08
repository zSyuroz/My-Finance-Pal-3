import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import ConfirmDialog from '../components/ConfirmDialog';
import {
  Chevron,
  makeSettingsStyles,
  RowValue,
  SettingsRow,
} from '../components/SettingsRow';
import {
  getNotificationsEnabled,
  getPayday,
  getSetting,
  KEYS,
  setNotificationsEnabled,
} from '../db';
import { HOME_CARDS, parseHomeCardOrder, type HomeCardKey } from '../homeCards';
import { requestNotificationPermission } from '../notifications';
import { syncScheduledNotifications } from '../reminders';
import { useTheme } from '../ThemeContext';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'AppPreferences'>;

export default function AppPreferencesScreen({ navigation }: Props) {
  const { mode, scheme, colors, setMode } = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);

  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifBlockedVisible, setNotifBlockedVisible] = useState(false);
  const [paydayDay, setPaydayDay] = useState<number | null>(null);
  const [firstCard, setFirstCard] = useState<HomeCardKey | null>(null);

  useFocusEffect(
    useCallback(() => {
      getNotificationsEnabled().then(setNotifEnabled);
      getPayday().then((p) => setPaydayDay(p.day));
      getSetting(KEYS.homeCardOrder).then((raw) => setFirstCard(parseHomeCardOrder(raw)[0]));
    }, [])
  );

  const useDevice = mode === 'system';
  const isDark = scheme === 'dark';

  const onToggleNotifications = async (next: boolean) => {
    if (next) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        setNotifBlockedVisible(true);
        return;
      }
    }
    setNotifEnabled(next);
    await setNotificationsEnabled(next);
    await syncScheduledNotifications(next, paydayDay);
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <SettingsRow
          icon="theme"
          label="Use device theme"
          right={
            <Switch
              value={useDevice}
              onValueChange={(v) => setMode(v ? 'system' : scheme)}
              trackColor={{ true: colors.iris, false: colors.line }}
              thumbColor="#fff"
            />
          }
        />
        <SettingsRow
          icon="moon"
          label="Dark mode"
          dim={useDevice}
          right={
            <Switch
              value={isDark}
              disabled={useDevice}
              onValueChange={(v) => setMode(v ? 'dark' : 'light')}
              trackColor={{ true: colors.iris, false: colors.line }}
              thumbColor="#fff"
            />
          }
        />
        <SettingsRow
          icon="bell"
          label="Notifications"
          right={
            <Switch
              value={notifEnabled}
              onValueChange={onToggleNotifications}
              trackColor={{ true: colors.iris, false: colors.line }}
              thumbColor="#fff"
            />
          }
        />
        <SettingsRow
          icon="cards"
          label="Home cards"
          last
          onPress={() => navigation.navigate('HomeCards')}
          right={
            firstCard ? (
              <RowValue>{HOME_CARDS.find((c) => c.key === firstCard)?.label ?? ''}</RowValue>
            ) : (
              <Chevron />
            )
          }
        />
      </View>

      <ConfirmDialog
        visible={notifBlockedVisible}
        title="Notifications blocked"
        message="Turn them on for this app in your phone's system Settings, then try again here."
        confirmLabel="OK"
        onConfirm={() => setNotifBlockedVisible(false)}
      />
    </ScrollView>
  );
}
