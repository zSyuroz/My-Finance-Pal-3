import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import AppText from './AppText';
import { useTheme } from '../ThemeContext';
import { radius, shadow, type Theme } from '../theme';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string; // default 'OK'
  cancelLabel?: string; // omit for a single-button, informational dialog
  destructive?: boolean; // red confirm button, for irreversible actions
  /**
   * A word the user must type before the confirm button does anything.
   *
   * For the small class of actions where a mis-tap is unrecoverable. Two taps
   * on a dialog is muscle memory; typing a word is not, and that is the whole
   * point — it costs three seconds and buys back the one case where somebody
   * wipes a year of records by reflex.
   */
  requireText?: string;
  onConfirm: () => void;
  onCancel?: () => void; // defaults to onConfirm when there's no cancel button
  /**
   * Tapping outside the card. Without this a dialog offering two real
   * choices treats a dismissal as picking the second one.
   */
  onDismiss?: () => void;
};

/**
 * A themed replacement for RN's Alert.alert — which react-native-web does
 * not implement (it's a silent no-op there), so any Alert.alert-based
 * confirmation simply never appears, and its callback never fires, when the
 * app is running in a browser. This renders identically on every platform.
 */
export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel,
  destructive,
  requireText,
  onConfirm,
  onCancel,
  onDismiss,
}: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const dismiss = onDismiss ?? onCancel ?? onConfirm;

  const [typed, setTyped] = useState('');
  // Cleared whenever the dialog opens, so a previous attempt never leaves the
  // gate already unlocked.
  useEffect(() => {
    if (visible) setTyped('');
  }, [visible]);

  // Case and stray spaces are not the point — intent is. Someone who types
  // "confirm" meant it just as much as someone who found the shift key.
  const unlocked =
    !requireText || typed.trim().toUpperCase() === requireText.trim().toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Pressable style={styles.card} onPress={() => {}}>
          <AppText variant="title">{title}</AppText>
          {!!message && (
            <AppText variant="body" muted style={styles.message}>
              {message}
            </AppText>
          )}
          {!!requireText && (
            <View style={styles.gate}>
              <AppText variant="mono" muted style={styles.gateLabel}>
                Type {requireText} to continue
              </AppText>
              <TextInput
                style={styles.gateInput}
                value={typed}
                onChangeText={setTyped}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={requireText}
                placeholderTextColor={colors.textMuted}
              />
            </View>
          )}

          <View style={styles.actions}>
            {cancelLabel && (
              <Pressable style={styles.btnGhost} onPress={onCancel}>
                <AppText variant="bodySemi">{cancelLabel}</AppText>
              </Pressable>
            )}
            <Pressable
              style={[
                styles.btn,
                { backgroundColor: destructive ? colors.danger : colors.iris },
                !unlocked && styles.btnLocked,
              ]}
              disabled={!unlocked}
              onPress={onConfirm}
            >
              <AppText variant="bodySemi" color="#fff">
                {confirmLabel}
              </AppText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(10,10,20,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      padding: 20,
      ...shadow.lift,
    },
    message: { marginTop: 8 },
    gate: { marginTop: 18 },
    gateLabel: { marginBottom: 8, marginLeft: 2, fontSize: 11 },
    gateInput: {
      backgroundColor: c.haze,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      paddingHorizontal: 14,
      height: 46,
      color: c.text,
      fontFamily: 'Archivo_400Regular',
      fontSize: 16,
      letterSpacing: 1,
    },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
    btnGhost: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.md,
    },
    btn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radius.md,
    },
    btnLocked: { opacity: 0.4 },
  });
}
