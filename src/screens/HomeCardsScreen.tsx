import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import { KEYS, getSetting, setSetting } from '../db';
import {
  HOME_CARDS,
  moveHomeCard,
  parseHomeCardOrder,
  serializeHomeCardOrder,
  type HomeCardKey,
} from '../homeCards';
import { useTheme } from '../ThemeContext';
import { radius, type Theme } from '../theme';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'HomeCards'>;

export default function HomeCardsScreen({}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [order, setOrder] = useState<HomeCardKey[]>([]);

  useFocusEffect(
    useCallback(() => {
      getSetting(KEYS.homeCardOrder).then((raw) => setOrder(parseHomeCardOrder(raw)));
    }, [])
  );

  // Saved on every move rather than behind a Save button: there is nothing to
  // get half-right, and going back without saving would silently discard it.
  const apply = (next: HomeCardKey[]) => {
    setOrder(next);
    setSetting(KEYS.homeCardOrder, serializeHomeCardOrder(next));
  };

  const card = (key: HomeCardKey) => HOME_CARDS.find((c) => c.key === key)!;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppText variant="body" muted style={styles.intro}>
        The top card is the one Home opens on. Swipe between them as usual — this only sets where
        the swipe starts.
      </AppText>

      <View style={styles.card}>
        {order.map((key, i) => {
          const meta = card(key);
          const first = i === 0;
          const last = i === order.length - 1;
          return (
            <View key={key} style={[styles.row, last && styles.rowLast]}>
              <View style={styles.rowBody}>
                <View style={styles.rowTitle}>
                  <AppText variant="bodySemi">{meta.label}</AppText>
                  {first && (
                    <View style={styles.badge}>
                      <AppText variant="mono" color={colors.onSage} style={styles.badgeText}>
                        SHOWN FIRST
                      </AppText>
                    </View>
                  )}
                </View>
                <AppText variant="mono" muted style={styles.rowSub}>
                  {meta.hint}
                </AppText>
              </View>

              <View style={styles.arrows}>
                <Pressable
                  style={[styles.arrow, first && styles.arrowOff]}
                  disabled={first}
                  onPress={() => apply(moveHomeCard(order, key, -1))}
                >
                  <AppText variant="bodySemi" color={first ? colors.textMuted : colors.text}>
                    ↑
                  </AppText>
                </Pressable>
                <Pressable
                  style={[styles.arrow, last && styles.arrowOff]}
                  disabled={last}
                  onPress={() => apply(moveHomeCard(order, key, 1))}
                >
                  <AppText variant="bodySemi" color={last ? colors.textMuted : colors.text}>
                    ↓
                  </AppText>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    content: { padding: 20, paddingBottom: 60 },
    intro: { lineHeight: 21, marginBottom: 18 },
    card: { backgroundColor: c.mist, borderRadius: radius.lg, paddingHorizontal: 16 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    rowLast: { borderBottomWidth: 0 },
    rowBody: { flex: 1 },
    rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowSub: { marginTop: 4, fontSize: 11, lineHeight: 16 },
    badge: {
      backgroundColor: c.sage,
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    badgeText: { fontSize: 9, letterSpacing: 0.6 },
    arrows: { flexDirection: 'row', gap: 8 },
    arrow: {
      width: 38,
      height: 38,
      borderRadius: radius.md,
      backgroundColor: c.haze,
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrowOff: { opacity: 0.4 },
  });
}
