import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import UnsavedChangesGuard from '../components/UnsavedChangesGuard';
import { useSaveAndClose } from '../components/useSaveAndClose';
import Avatar from '../components/Avatar';
import AvatarCropper from '../components/AvatarCropper';
import ConfirmDialog from '../components/ConfirmDialog';
import { getProfile, setProfile } from '../db';
import { cropToAvatar, pickImage, type PickedImage } from '../pickAvatar';
import { useTheme } from '../ThemeContext';
import { radius, type Theme } from '../theme';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'Profile'>;

export default function ProfileScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The picture waiting to be framed. Held here rather than saved straight
  // away, so backing out of the cropper leaves the old avatar alone.
  const [framing, setFraming] = useState<PickedImage | null>(null);
  // What was on the profile when the screen opened, to compare against.
  const [initial, setInitial] = useState({ name: '', avatar: null as string | null });
  // Set the instant Save is pressed, so the guard knows this exit is ours.
  const leaving = useRef(false);

  useEffect(() => {
    getProfile().then((p) => {
      setName(p.name);
      setAvatar(p.avatar);
      setInitial({ name: p.name, avatar: p.avatar });
      setLoaded(true);
    });
  }, []);

  const choosePicture = async () => {
    try {
      const picked = await pickImage();
      if (picked) setFraming(picked);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open your photos.');
    }
  };

  const dirty = loaded && (name !== initial.name || avatar !== initial.avatar);

  /** Writes without leaving, so the guard can save and then go itself. */
  const persist = async () => {
    await setProfile({ name, avatar });
    setInitial({ name, avatar });
  };

  const { save, saveFailedDialog } = useSaveAndClose({
    persist,
    leaving,
    goBack: () => navigation.goBack(),
    what: 'your profile',
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={save} hitSlop={10}>
          <AppText variant="bodySemi" color={colors.iris}>
            Save
          </AppText>
        </Pressable>
      ),
    });
  });

  if (!loaded) return <View style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <UnsavedChangesGuard
        dirty={dirty}
        onSave={persist}
        leavingRef={leaving}
        title="Save your profile?"
        message="You've changed your name or picture without saving."
      />
      {saveFailedDialog}

      <Pressable style={styles.avatarWrap} onPress={choosePicture}>
        <Avatar name={name} uri={avatar} size={124} />
        <View style={styles.badge}>
          <AppText variant="bodySemi" color={colors.onAction} style={styles.badgeText}>
            {avatar ? '✎' : '+'}
          </AppText>
        </View>
      </Pressable>

      <AppText variant="label" muted style={styles.sectionLabel}>
        Your name
      </AppText>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
      />

      <AppText variant="body" muted style={styles.note}>
        Your name and picture stay on this device. They're stored with the rest of your data, so
        they travel with an export and never go anywhere else.
      </AppText>

      <AvatarCropper
        image={framing}
        onCancel={() => setFraming(null)}
        onDone={async (box) => {
          const source = framing;
          setFraming(null);
          if (!source) return;
          try {
            setAvatar(await cropToAvatar(source, box));
          } catch {
            setError('That picture could not be saved. Try another one.');
          }
        }}
      />

      <ConfirmDialog
        visible={!!error}
        title="Couldn't use that picture"
        message={error ?? ''}
        confirmLabel="OK"
        onConfirm={() => setError(null)}
      />
    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 24, paddingBottom: 60 },
    avatarWrap: { alignSelf: 'center', marginBottom: 8 },
    badge: {
      position: 'absolute',
      right: 2,
      bottom: 2,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: c.haze,
    },
    badgeText: { fontSize: 16, lineHeight: 20 },
    sectionLabel: { marginTop: 20, marginBottom: 8, marginLeft: 2 },
    input: {
      backgroundColor: c.mist,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: c.text,
      fontFamily: 'Archivo_400Regular',
      fontSize: 16,
    },
    note: { marginTop: 28, textAlign: 'center', lineHeight: 20 },
  });
}
