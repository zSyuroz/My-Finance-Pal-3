import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppText from '../components/AppText';
import Avatar from '../components/Avatar';
import AvatarCropper from '../components/AvatarCropper';
import ConfirmDialog from '../components/ConfirmDialog';
import OrbitHero from '../components/OrbitHero';
import PaydayFields from '../components/PaydayFields';
import { markOnboardingComplete, setPayday, setProfile } from '../db';
import { cropToAvatar, pickImage, type PickedImage } from '../pickAvatar';
import { useTheme } from '../ThemeContext';
import { radius, shadow, type Theme } from '../theme';

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Two steps rather than two screens: onboarding is mounted directly by the
  // app root, outside any navigator, so a local step counter keeps the whole
  // flow self-contained instead of introducing a stack just for first run.
  const [step, setStep] = useState<0 | 1>(0);

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  // The picture waiting to be framed; nothing is kept until the frame is set.
  const [framing, setFraming] = useState<PickedImage | null>(null);

  const [amount, setAmount] = useState('');
  const [day, setDay] = useState<number | null>(null);

  const choosePicture = async () => {
    try {
      const picked = await pickImage();
      if (picked) setFraming(picked);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Could not open your photos.');
    }
  };

  const finishProfile = async (save: boolean) => {
    // Saved on the way past rather than at the very end, so a name entered
    // here survives even if the app is closed on the pay rhythm step.
    if (save) await setProfile({ name, avatar });
    setStep(1);
  };

  const finish = async (save: boolean) => {
    if (save) {
      const num = amount.trim() === '' ? null : Number(amount);
      await setPayday(num, day);
    }
    await markOnboardingComplete();
    onDone();
  };

  const canSave = amount.trim() !== '' || day != null;
  const canContinueProfile = name.trim() !== '' || avatar != null;
  const canContinue = step === 0 ? canContinueProfile : canSave;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          // The layout below is sized to fit on one screen without
          // scrolling on typical phones — this only kicks in as a fallback
          // (a very small device, or larger accessibility font sizes).
          showsVerticalScrollIndicator={false}
        >
          {step === 0 ? (
            <View style={styles.step}>
              <Pressable style={styles.avatarWrap} onPress={choosePicture}>
                <Avatar name={name} uri={avatar} size={124} />
                <View style={styles.avatarBadge}>
                  <AppText variant="bodySemi" color={colors.onAction} style={styles.avatarBadgeText}>
                    {avatar ? '✎' : '+'}
                  </AppText>
                </View>
              </Pressable>

              <AppText variant="displaySm" center style={styles.title}>
                Hello — who are you?
              </AppText>
              <AppText variant="body" muted center style={styles.subtitle}>
                Just for this device. Optional — skip it and set it later in Settings.
              </AppText>

              <View style={styles.form}>
                <AppText variant="label" muted style={styles.fieldLabel}>
                  Your name
                </AppText>
                <TextInput
                  style={styles.nameInput}
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => finishProfile(canContinueProfile)}
                />
              </View>
            </View>
          ) : (
          <View style={styles.step}>
          <View style={styles.hero}>
            <OrbitHero size={128} />
          </View>

          <AppText variant="displaySm" center style={styles.title}>
            Set your pay rhythm
          </AppText>
          <AppText variant="body" muted center style={styles.subtitle}>
            Tell the app when you're paid. Optional — skip it and set it later
            in Settings.
          </AppText>

          <View style={styles.form}>
            <PaydayFields
              amount={amount}
              day={day}
              onChangeAmount={setAmount}
              onChangeDay={setDay}
              compact
            />
          </View>
          </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.progress}>
            {/* Dots alone say "there is more" but not how much. Naming the step
                turns an ambiguous indicator into an actual answer. */}
            <View style={styles.dots}>
              {[0, 1].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === step ? styles.dotActive : null,
                    { backgroundColor: i === step ? colors.gold : colors.line },
                  ]}
                />
              ))}
            </View>
            <AppText variant="mono" muted style={styles.progressLabel}>
              Step {step + 1} of 2
            </AppText>
          </View>

          <Pressable
            style={[styles.primaryBtn, !canContinue && styles.primaryBtnDisabled]}
            disabled={!canContinue}
            onPress={() => (step === 0 ? finishProfile(true) : finish(true))}
          >
            <AppText variant="bodySemi" color={canContinue ? colors.onGold : colors.textMuted}>
              Continue
            </AppText>
          </Pressable>
          <Pressable
            style={styles.skipBtn}
            onPress={() => (step === 0 ? finishProfile(false) : finish(false))}
          >
            <AppText variant="bodySemi" muted>
              Skip for now
            </AppText>
          </Pressable>
        </View>

        <ConfirmDialog
          visible={!!pickError}
          title="Couldn't use that picture"
          message={pickError ?? ''}
          confirmLabel="OK"
          onConfirm={() => setPickError(null)}
        />

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
              setPickError('That picture could not be saved. Try another one.');
            }
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.haze },
    flex: { flex: 1 },
    // Centred rather than top-aligned: with only a heading and one field, a
    // top-hugging layout leaves a large dead area beneath and reads as
    // unfinished. flexGrow keeps it scrollable if the keyboard or a large
    // accessibility font makes the block taller than the screen.
    content: {
      paddingHorizontal: 24,
      paddingVertical: 24,
      flexGrow: 1,
      justifyContent: 'center',
    },
    // Both steps share one skeleton — visual, title, subtitle, card — so
    // moving between them feels like one flow rather than two screens.
    step: { alignItems: 'stretch' },
    hero: { alignItems: 'center', marginBottom: 20 },
    title: { marginBottom: 10 },
    // Capped so the sentence breaks into comfortable lines instead of running
    // the full width of a large phone.
    subtitle: { marginBottom: 28, paddingHorizontal: 8, maxWidth: 340, alignSelf: 'center' },
    form: {
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      padding: 18,
      ...shadow.card,
    },
    footer: {
      paddingHorizontal: 24,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 8,
    },
    primaryBtn: {
      height: 52,
      borderRadius: radius.md,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // A translucent gold button reads as broken and drops the label's contrast
    // well below legible. A flat muted surface says "not yet" while staying
    // readable.
    primaryBtnDisabled: { backgroundColor: c.mist, borderWidth: 1, borderColor: c.line },
    // 48pt clears the 44pt minimum touch target on its own, without relying on
    // hitSlop that nothing visually indicates.
    skipBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
    progress: { alignItems: 'center', marginBottom: 16, gap: 8 },
    progressLabel: { fontSize: 12 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    // The current step is a stadium, not a dot — position is readable at a
    // glance without counting.
    dotActive: { width: 20 },
    avatarWrap: { alignSelf: 'center', marginBottom: 20 },
    avatarBadge: {
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
    avatarBadgeText: { fontSize: 16, lineHeight: 20 },
    // Left-aligned to match the pay rhythm card's fields: the page is centred,
    // the form's contents are not — centred labels are harder to scan and the
    // two steps would disagree with each other.
    fieldLabel: { marginBottom: 10, marginLeft: 2 },
    nameInput: {
      backgroundColor: c.haze,
      borderRadius: radius.md,
      paddingHorizontal: 16,
      height: 52,
      color: c.text,
      fontFamily: 'Archivo_400Regular',
      fontSize: 16,
    },
  });
}
