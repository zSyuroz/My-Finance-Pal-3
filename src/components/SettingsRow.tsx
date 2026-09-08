import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import AppText from './AppText';
import RowIcon, { type RowIconName } from './RowIcon';
import { useTheme } from '../ThemeContext';
import { radius, shadow, type Theme } from '../theme';

/**
 * The shared furniture of every settings screen.
 *
 * Settings is a hub of category screens now, and each one draws the same card
 * of icon-and-label rows. Without this they would be five copies of the same
 * forty lines, drifting apart one padding value at a time.
 */

export function makeSettingsStyles(c: Theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.haze },
    header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
    content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      padding: 16,
      marginBottom: 18,
    },
    profileText: { flex: 1 },
    card: {
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      overflow: 'hidden',
      ...shadow.card,
    },
    cardSpaced: { marginTop: 18 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 60,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    rowLast: { borderBottomWidth: 0 },
    iconWrap: { width: 28, alignItems: 'center' },
    rowBody: { flex: 1, marginLeft: 12 },
    rowLabel: { fontSize: 16 },
    rowSub: { marginTop: 2, fontSize: 11 },
    dim: { opacity: 0.4 },
    valueGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    hint: { marginTop: 10, marginHorizontal: 2, lineHeight: 18 },
    version: { textAlign: 'center', marginTop: 22, fontSize: 11 },
  });
}

export type SettingsStyles = ReturnType<typeof makeSettingsStyles>;

export function SettingsRow({
  icon,
  label,
  /** Second line under the label, for a count or current value. */
  sub,
  right,
  onPress,
  dim,
  last,
  destructive,
}: {
  icon: RowIconName;
  label: string;
  sub?: string;
  right?: ReactNode;
  onPress?: () => void;
  dim?: boolean;
  last?: boolean;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);

  return (
    <Pressable
      style={[styles.row, last && styles.rowLast]}
      onPress={onPress}
      disabled={!onPress}
      android_ripple={onPress ? { color: colors.line } : undefined}
    >
      <View style={[styles.iconWrap, dim && styles.dim]}>
        <RowIcon name={icon} color={destructive ? colors.danger : colors.text} />
      </View>
      <View style={[styles.rowBody, dim && styles.dim]}>
        <AppText variant="bodyMed" color={destructive ? colors.danger : undefined} style={styles.rowLabel}>
          {label}
        </AppText>
        {!!sub && (
          <AppText variant="mono" muted style={styles.rowSub}>
            {sub}
          </AppText>
        )}
      </View>
      {right}
    </Pressable>
  );
}

/** The affordance on every row that leads somewhere. */
export function Chevron() {
  const { colors } = useTheme();
  return <RowIcon name="chevron" color={colors.textMuted} size={18} />;
}

/** A current value sitting beside the chevron. */
export function RowValue({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  return (
    <View style={styles.valueGroup}>
      <AppText variant="mono" muted>
        {children}
      </AppText>
      <Chevron />
    </View>
  );
}
