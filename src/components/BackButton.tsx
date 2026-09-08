import { Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../ThemeContext';

/**
 * A themed back arrow for pushed (non-list) screens — used as the shared
 * headerLeft so every editor/detail screen looks and behaves the same,
 * instead of relying on each platform's own default back button.
 */
export default function BackButton() {
  const navigation = useNavigation();
  const { colors } = useTheme();

  return (
    <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ paddingRight: 8 }}>
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
          d="M15 5 8 12l7 7"
          stroke={colors.iris}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}
