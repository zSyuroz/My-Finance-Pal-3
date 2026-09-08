import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import AppText from './AppText';
import { searchCurrencies, type Currency } from '../currency';
import { useTheme } from '../ThemeContext';
import { radius, type Theme } from '../theme';

type Props = {
  visible: boolean;
  /** The code currently chosen, ticked in the list. */
  selected: string;
  onSelect: (code: string) => void;
  onClose: () => void;
};

/**
 * Picks a currency for one bill, without leaving the bill.
 *
 * A pushed screen would unmount the editor and lose everything typed so far,
 * so this is a modal over it. Same search and same ordering as the Settings
 * picker — the codes people know are the codes they will type here too.
 */
export default function CurrencyPickerModal({ visible, selected, onSelect, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState('');

  // A–Z, matching the Settings picker. An unlabelled block of eight
  // "popular" codes above the alphabet just reads as a broken sort.
  const items: Currency[] = useMemo(() => [...searchCurrencies(query)], [query]);

  const choose = (code: string) => {
    setQuery('');
    onSelect(code);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <AppText variant="title">Bill currency</AppText>
            <Pressable onPress={onClose} hitSlop={10}>
              <AppText variant="bodySemi" color={colors.iris}>
                Close
              </AppText>
            </Pressable>
          </View>

          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by code or country"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="characters"
          />

          <FlatList
            data={items}
            keyExtractor={(c) => c.code}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <AppText variant="body" muted style={styles.empty}>
                Nothing matches that.
              </AppText>
            }
            renderItem={({ item }) => (
              <Pressable
                style={[styles.row, item.code === selected && styles.rowActive]}
                onPress={() => choose(item.code)}
              >
                <View style={styles.chip}>
                  <AppText variant="monoBold" style={styles.symbol} numberOfLines={1}>
                    {item.symbol}
                  </AppText>
                </View>
                <AppText
                  variant={item.code === selected ? 'bodySemi' : 'body'}
                  style={styles.label}
                  numberOfLines={1}
                >
                  {item.label}
                </AppText>
                <AppText variant="mono" muted>
                  {item.code}
                </AppText>
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.haze,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
      maxHeight: '82%',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    search: {
      backgroundColor: c.mist,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      height: 46,
      color: c.text,
      fontFamily: 'Archivo_400Regular',
      fontSize: 16,
    },
    list: { paddingVertical: 12, paddingBottom: 28 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.mist,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 6,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    rowActive: { borderColor: c.sage },
    chip: {
      minWidth: 46,
      height: 30,
      paddingHorizontal: 6,
      borderRadius: radius.sm,
      backgroundColor: c.haze,
      alignItems: 'center',
      justifyContent: 'center',
    },
    symbol: { fontSize: 13 },
    label: { flex: 1 },
    empty: { marginTop: 24, textAlign: 'center' },
  });
}
