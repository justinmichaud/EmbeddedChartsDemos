// Sim core + grid reactivity tests. The full UI is desktop-only; these guard
// the bits most likely to regress without a running window.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:fluttercharts/sim/simulation.dart';
import 'package:fluttercharts/widgets/stock_chart.dart';
import 'package:fluttercharts/widgets/stock_grid.dart';

void main() {
  test('settings default to USD / 14 charts', () {
    final s = defaultSettings();
    expect(s.currency, 'USD');
    expect(s.numCharts, 14);
  });

  test('stockCount clamps to MAX_STOCKS', () {
    sim.settings.numCharts = 999;
    expect(sim.stockCount(), kMaxStocks);
  });

  testWidgets('grid adds/removes charts when numCharts changes',
      (tester) async {
    // Tall, wide surface so every cell is laid out (no lazy clipping) and the
    // count is deterministic.
    tester.view.physicalSize = const Size(1600, 6000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    sim.settings.numCharts = 4;
    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: StockGrid(onSelect: (_) {}))),
    );
    await tester.pump();
    expect(find.byType(StockChart), findsNWidgets(4));

    // The fix: changing the count must add/remove grid cells, not just update
    // the existing ones.
    sim.updateSettings(numCharts: 8);
    await tester.pump();
    expect(find.byType(StockChart), findsNWidgets(8));

    sim.updateSettings(numCharts: 2);
    await tester.pump();
    expect(find.byType(StockChart), findsNWidgets(2));
  });
}
