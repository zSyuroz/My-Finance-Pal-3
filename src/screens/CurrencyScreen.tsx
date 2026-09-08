import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import { searchCurrencies, type Currency } from '../currency';
import { useCurrency } from '../CurrencyContext';
import { useTheme } from '../ThemeContext';
import { radius, type Theme } from '../theme';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'Currency'>;

export default function CurrencyScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { code, setCurrency } = useCurrency();

  const [query, setQuery] = useState('');

  // One list, A–Z. A "common" section is a guess about who is reading, and
  // it pushes the alphabet down the screen for everyone it guesses wrong
  // about; search reaches any of the 155 in two keystrokes anyway.
  const items: Currency[] = useMemo(() => [...searchCurrencies(query)], [query]);

  const choose = (next: string) => {
    setCurrency(next as typeof code);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search 155 currencies"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="characters"
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <AppText variant="body" muted style={styles.empty}>
            Nothing matches “{query.trim()}”. Try the three-letter code from your bank statement.
          </AppText>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, item.code === code && styles.rowActive]}
            onPress={() => choose(item.code)}
          >
            <View style={styles.symbolChip}>
              <AppText variant="monoBold" style={styles.symbol} numberOfLines={1}>
                {item.symbol}
              </AppText>
            </View>
            <AppText
              variant={item.code === code ? 'bodySemi' : 'body'}
              style={styles.label}
              numberOfLines={1}
            >
              {item.label}
            </AppText>
            <AppText variant="mono" muted>
              {item.code}
            </AppText>
            {item.code === code && (
              <AppText variant="bodySemi" color={colors.sage} style={styles.tick}>
                ✓
              </AppText>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.haze },
    searchWrap: { padding: 16, paddingBottom: 8 },
    search: {
      backgroundColor: c.mist,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      height: 46,
      color: c.text,
      fontFamily: 'Archivo_400Regular',
      fontSize: 16,
    },
    list: { paddingHorizontal: 16, paddingBottom: 40 },
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
    symbolChip: {
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
    tick: { marginLeft: 2 },
    empty: { marginTop: 28, lineHeight: 21 },
  });
}
