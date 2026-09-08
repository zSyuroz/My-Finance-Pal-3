import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, View, type LayoutChangeEvent } from 'react-native';

export type Month = { y: number; m: number };

export const shiftMonth = ({ y, m }: Month, by: number): Month => {
  const d = new Date(y, m - 1 + by, 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
};

export const monthKey = ({ y, m }: Month) => `${y}-${String(m).padStart(2, '0')}-01`;

/** Months either side of the opening one that can be swiped to. */
export const RANGE = 6;

type Props = {
  /** The month the strip opens on. */
  anchor: Month;
  /** Draws one month at the given width. */
  renderMonth: (month: Month, width: number) => ReactNode;
};

/**
 * Months on a paged strip, so a swipe slides the next one in.
 *
 * Every month in range is rendered up front and the strip simply scrolls.
 * That is deliberate: an earlier version kept three pages and recentred after
 * each swipe, which depended on `onScroll` / `onMomentumScrollEnd` firing —
 * and under react-native-web those never arrived, leaving a calendar that
 * slid and then snapped back. Paging with no callbacks cannot fail that way,
 * at the cost of holding a year of grids in memory rather than three.
 *
 * The whole range is drawn once, so nothing here needs to know which month is
 * showing; the caller marks every month it cares about ahead of time.
 */
export default function MonthPager({ anchor, renderMonth }: Props) {
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);

  const months: Month[] = [];
  for (let i = -RANGE; i <= RANGE; i++) months.push(shiftMonth(anchor, i));

  // The opening month sits in the middle of the strip, so the first paint has
  // to jump there — without animation, or the calendar appears to fly in.
  useEffect(() => {
    if (width <= 0) return;
    const id = requestAnimationFrame(() =>
      scroller.current?.scrollTo({ x: width * RANGE, animated: false })
    );
    return () => cancelAnimationFrame(id);
  }, [width]);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };

  return (
    <View onLayout={onLayout}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
      >
        {width > 0 &&
          months.map((m) => (
            <View key={monthKey(m)} style={{ width }}>
              {renderMonth(m, width)}
            </View>
          ))}
      </ScrollView>
    </View>
  );
}
