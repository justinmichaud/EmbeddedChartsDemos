import { useMemo } from 'react';
import { FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import { StockChart } from './StockChart';
import { NewsView } from './NewsView';
import { stockCount, state, STOCK_SYMBOLS } from '../simulation';

const GAP = 8;

// Column count mirrors the original's Tailwind breakpoints
// (2 / sm:3 / md:4 / lg:5 / xl:6).
function colsFor(w: number) {
  if (w >= 1280) return 6;
  if (w >= 1024) return 5;
  if (w >= 768) return 4;
  if (w >= 640) return 3;
  return 2;
}

// Virtualized grid: FlatList only mounts the charts near the viewport, so at
// 50 charts we update ~the visible dozen per tick instead of all 50. `tick`
// flows in as extraData so mounted cells re-render each 5 Hz step; off-screen
// cells (outside windowSize) are unmounted and cost nothing.
export function StockGrid({ onSelect, tick }: { onSelect: (symbol: string) => void; tick: number }) {
  const { width } = useWindowDimensions();
  const cols = colsFor(width);
  const cellW = Math.floor((width - GAP * (cols + 1)) / cols);

  const n = stockCount();
  const data = useMemo(() => Array.from({ length: n }, (_, i) => i), [n]);

  return (
    <FlatList
      key={cols} /* numColumns can't change without remount */
      data={data}
      extraData={tick}
      keyExtractor={(i) => String(i)}
      numColumns={cols}
      renderItem={({ item }) => (
        <StockChart
          index={item}
          width={cellW}
          currency={state.settings.currency}
          onPress={() => onSelect(STOCK_SYMBOLS[item])}
        />
      )}
      ListHeaderComponent={NewsView}
      columnWrapperStyle={cols > 1 ? styles.row : undefined}
      contentContainerStyle={styles.content}
      removeClippedSubviews
      windowSize={3}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      updateCellsBatchingPeriod={50}
    />
  );
}

const styles = StyleSheet.create({
  content: { gap: GAP, paddingVertical: GAP },
  row: { gap: GAP, paddingHorizontal: GAP },
});
