import { Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '../ThemeContext';

/**
 * On web the app runs in a centered phone-width column so it doesn't stretch
 * across a desktop window. On native it's a pass-through.
 */
export default function WebFrame({ children }: { children: React.ReactNode }) {
  const { colors, scheme } = useTheme();

  if (Platform.OS !== 'web') return <>{children}</>;

  return (
    <View
      style={[
        styles.backdrop,
        { backgroundColor: scheme === 'dark' ? '#050510' : '#c9c9de' },
      ]}
    >
      <View style={[styles.column, { backgroundColor: colors.haze, borderColor: colors.line }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center' },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: 430,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
