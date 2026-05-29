import 'package:flutter/material.dart';

import '../sim/simulation.dart';
import '../theme.dart';
import 'stock_chart.dart';

/// Enlarged single-chart view with a BACK button. Rebuilds per tick via the
/// ListenableBuilder so the big chart stays live.
class ChartDetail extends StatelessWidget {
  final String symbol;
  final VoidCallback onBack;
  const ChartDetail({super.key, required this.symbol, required this.onBack});

  @override
  Widget build(BuildContext context) {
    final index = kStockSymbols.indexOf(symbol);

    return Padding(
      padding: const EdgeInsets.all(8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(
              children: [
                GestureDetector(
                  onTap: onBack,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(border: Border.all(color: C.border)),
                    child: Text('← BACK',
                        style: mono(size: 10, color: C.textMuted)),
                  ),
                ),
                const SizedBox(width: 12),
                Text('$symbol — DETAIL VIEW',
                    style: mono(size: 11, color: C.textDim)),
              ],
            ),
          ),
          const SizedBox(height: 8),
          if (index >= 0)
            LayoutBuilder(
              builder: (context, constraints) => ListenableBuilder(
                listenable: sim,
                builder: (_, _) => StockChart(
                  index: index,
                  width: constraints.maxWidth,
                  currency: sim.settings.currency,
                  enlarged: true,
                ),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.all(16),
              child:
                  Text('Waiting for data…', style: mono(size: 13, color: C.textMuted)),
            ),
        ],
      ),
    );
  }
}
