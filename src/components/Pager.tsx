import { Children, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';

import { useTheme } from '../ThemeContext';

type Props = {
  children: ReactNode;
  /** Colour for the active dot; defaults to the theme's gold. */
  dotColor?: string;
};

/**
 * A horizontally paged strip with dot indicators, sized to whatever space it
 * is given rather than to the screen — it lives inside a padded card, so the
 * window width would be wrong.
 *
 * Page width has to be measured before paging can snap correctly, which takes
 * one layout pass. Rather than render an empty box for that frame, the first
 * page is laid out at full width immediately and the rest join once the
 * measurement arrives; the card never flashes blank or changes height.
 */
export default function Pager({ children, dotColor }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);

  const pages = Children.toArray(children);
  const measured = width > 0;
  const active = dotColor ?? colors.gold;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!measured) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Without this the vertical list underneath steals the gesture on web.
        directionalLockEnabled
      >
        {pages.map((child, i) =>
          !measured && i > 0 ? null : (
            <View key={i} style={measured ? { width } : styles.fullWidth}>
              {child}
            </View>
          )
        )}
      </ScrollView>

      {pages.length > 1 && (
        <View style={styles.dots}>
          {pages.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === page ? active : colors.onInkFaint },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fullWidth: { width: '100%' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 14 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
