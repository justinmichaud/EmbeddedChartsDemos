import 'package:flutter/material.dart';

import '../sim/simulation.dart';
import 'news_view.dart';
import 'stock_chart.dart';

const double _gap = 8;

// Column count mirrors the original's Tailwind breakpoints
// (2 / sm:3 / md:4 / lg:5 / xl:6).
int _colsFor(double w) {
  if (w >= 1280) return 6;
  if (w >= 1024) return 5;
  if (w >= 768) return 4;
  if (w >= 640) return 3;
  return 2;
}

// Card height: header + quotes + chart(96) + footer, with a little slack so the
// fixed-extent cell never overflows its content. Fixed so the SliverGrid can lay
// out lazily; only on-screen cells are built, and each wraps its content in a
// ListenableBuilder so just the visible cells rebuild per tick.
const double _cardHeight = 192;

/// Lazy responsive grid with the newsfeed as a leading header. `GridView`'s
/// builder only constructs visible cells (the virtualization the RN port got
/// from FlatList); each cell subscribes to `sim` so it rebuilds at 5 Hz while
/// it's on screen and costs nothing while off screen.
class StockGrid extends StatelessWidget {
  final ValueChanged<String> onSelect;
  const StockGrid({super.key, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final cols = _colsFor(width);
        final cellW = ((width - _gap * (cols + 1)) / cols).floorToDouble();

        // Rebuild the whole grid each tick (and on settings changes). This
        // drives the per-tick cell updates AND re-reads the chart count so
        // changing "charts displayed" adds/removes cells. Rebuilding the scroll
        // config is cheap; the heavy drawing stays in each cell's painter, and
        // off-screen cells are still never built (lazy SliverChildBuilderDelegate).
        return ListenableBuilder(
          listenable: sim,
          builder: (context, _) {
            final n = sim.stockCount();
            return CustomScrollView(
              slivers: [
                const SliverToBoxAdapter(
                    child: Padding(
                  padding: EdgeInsets.only(top: _gap),
                  child: NewsView(),
                )),
                SliverPadding(
                  padding: const EdgeInsets.all(_gap),
                  sliver: SliverGrid(
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: cols,
                      crossAxisSpacing: _gap,
                      mainAxisSpacing: _gap,
                      mainAxisExtent: _cardHeight,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, i) => StockChart(
                        index: i,
                        width: cellW,
                        currency: sim.settings.currency,
                        onTap: () => onSelect(kStockSymbols[i]),
                      ),
                      childCount: n,
                    ),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }
}
