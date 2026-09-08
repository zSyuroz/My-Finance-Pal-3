import { Image, StyleSheet, View } from 'react-native';

import AppText from './AppText';
import { useTheme } from '../ThemeContext';

/**
 * Someone's picture, or their initials when there isn't one.
 *
 * Initials rather than a generic silhouette: a placeholder that still
 * identifies the person is more useful than one that doesn't, and it means the
 * avatar never looks broken for someone who skipped the photo.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function Avatar({
  name,
  uri,
  size = 96,
}: {
  name: string;
  uri?: string | null;
  size?: number;
}) {
  const { colors } = useTheme();
  const initials = initialsOf(name);

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.mist,
          borderColor: colors.line,
        },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <AppText
          variant="displaySm"
          color={initials ? colors.text : colors.textMuted}
          style={{ fontSize: size * 0.34 }}
        >
          {initials || '?'}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
  },
});
