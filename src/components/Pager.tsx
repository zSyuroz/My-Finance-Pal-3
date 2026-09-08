import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';

import { useTheme } from '../ThemeContext';

type Props = {
  children: ReactNode;
  /** Colour for the active dot; defaults to the theme's gold. */
  dotColor?: string;
  /**
   * Which page to open on when the strip is built from scratch.
   *
   * Without it, a user who swiped to the fourth card and came back to a
   * rebuilt screen was returned to the first one.
   */
  initialPage?: number;
  /** Fires as the page settles, so a caller can remember it. */
  onPageChange?: (page: number) => void;
  /**
   * Change this to put the strip back where the user left it.
   *
   * Leaving a screen and returning is not always a rebuild: a navigator that
   * merely hides the screen it is covering takes the scroll offset with it,
   * because a scroll container hidden with `display: none` forgets where it
   * was and does not remember on the way back. The page itself is still known
   * — only the browser has lost it — so a screen bumps this on focus and the
   * strip re-applies what it already had.
   */
  restoreKey?: number;
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
export default function Pager({
  children,
  dotColor,
  initialPage = 0,
  onPageChange,
  restoreKey,
}: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollView>(null);

  const pages = Children.toArray(children);
  const measured = width > 0;
  const active = dotColor ?? colors.gold;
  // A remembered page can outlive the card it pointed at, if the cards
  // themselves changed while we were away.
  const start = Math.max(0, Math.min(initialPage, pages.length - 1));

  const [page, setPage] = useState(start);
  // The same value where an effect can read it without being re-run by it.
  const current = useRef(start);

  /**
   * Puts the strip at `current`, a frame late so the full set of pages is laid
   * out and the offset is one the ScrollView will accept rather than clamp
   * back to zero.
   */
  const applyOffset = (w: number) => {
    if (!(w > 0)) return;
    requestAnimationFrame(() => {
      scroller.current?.scrollTo({ x: current.current * w, animated: false });
    });
  };

  // On first measurement, honour where the caller asked to open.
  useEffect(() => {
    if (measured && current.current > 0) applyOffset(width);
    // Once per measurement; scrolling afterwards is the user's business.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured, width]);

  // On every restore, put back what the user had.
  useEffect(() => {
    if (restoreKey === undefined || !measured) return;
    applyOffset(width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreKey]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!measured) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== current.current) {
      current.current = next;
      setPage(next);
      onPageChange?.(next);
    }
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={scroller}
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
