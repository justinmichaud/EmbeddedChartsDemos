import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../sim/simulation.dart';
import '../theme.dart';

const double _padTop = 4, _padRight = 32, _padBottom = 12, _padLeft = 4;
const List<int> _xTickIdx = [0, 15, 30, 45];

/// A single stock card: header, BID/MID/ASK/HIGH/LOW quote row, the chart, and
/// a CCY/SPR/UPD footer.
///
/// The card rebuilds once per 5 Hz tick (driven by a ListenableBuilder on `sim`
/// in StockGrid / ChartDetail) so the text quotes stay live; the heavy work —
/// the three data curves, fills, grid and axis labels — happens inside the
/// CustomPainter on the raster side, not in widget reconciliation. Y-domain
/// hysteresis (ported from the original) keeps the painter's grid stable across
/// most ticks. This is a StatefulWidget purely to hold that hysteresis state.
class StockChart extends StatefulWidget {
  final int index;
  final double width;
  final String currency;
  final bool enlarged;
  final VoidCallback? onTap;

  const StockChart({
    super.key,
    required this.index,
    required this.width,
    required this.currency,
    this.enlarged = false,
    this.onTap,
  });

  @override
  State<StockChart> createState() => _StockChartState();
}

class _StockChartState extends State<StockChart> {
  double _yLo = 0, _yHi = 0;

  @override
  Widget build(BuildContext context) {
    final symbol = kStockSymbols[widget.index];
    final chartH = widget.enlarged ? 320.0 : 96.0;
    final base = widget.index * kHistoryLen;
    final head = sim.stockHead[widget.index];

    // Single chronological pass for high/low / y-extent.
    var high = -double.infinity, low = double.infinity;
    var yMin = double.infinity, yMax = -double.infinity;
    for (var i = 0; i < kHistoryLen; i++) {
      final idx = base + ((head + i) % kHistoryLen);
      final a = sim.stockAsk[idx], b = sim.stockBid[idx];
      if (a > high) high = a;
      if (b < low) low = b;
      if (a > yMax) yMax = a;
      if (b < yMin) yMin = b;
    }

    final lastIdx = base + ((head + kHistoryLen - 1) % kHistoryLen);
    final firstIdx = base + (head % kHistoryLen);
    final curAsk = sim.stockAsk[lastIdx];
    final curBid = sim.stockBid[lastIdx];
    final curMid = sim.stockMid[lastIdx];
    final firstMid = sim.stockMid[firstIdx];
    final change = firstMid != 0 ? ((curMid - firstMid) / firstMid) * 100 : 0.0;
    final changeColor = change >= 0 ? C.green : C.red;

    // Y-domain hysteresis: only re-snap when data leaves the current range,
    // then pad generously so the next re-snap is far off. Keeps yLo/yHi stable
    // across most ticks, so the painter's grid/labels are byte-identical.
    if (_yHi <= _yLo || yMin < _yLo || yMax > _yHi) {
      final dr = (yMax - yMin) != 0
          ? (yMax - yMin)
          : math.max(yMax * 0.001, 1e-6);
      _yLo = yMin - dr;
      _yHi = yMax + dr;
    }

    return GestureDetector(
      onTap: widget.onTap,
      child: Container(
        width: widget.width,
        decoration: BoxDecoration(
          color: C.panel,
          border: Border.all(color: C.border),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header: symbol + % change.
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: C.border)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(symbol,
                      style: mono(size: 11, weight: FontWeight.w600)),
                  Text(
                    '${change >= 0 ? '+' : ''}${change.toStringAsFixed(3)}%',
                    style: mono(
                        size: 10, weight: FontWeight.w600, color: changeColor),
                  ),
                ],
              ),
            ),
            // Quote row.
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: const BoxDecoration(
                color: C.bg,
                border: Border(bottom: BorderSide(color: C.border)),
              ),
              child: Row(
                children: [
                  _Quote(label: 'BID', value: curBid, color: C.red),
                  _Quote(label: 'MID', value: curMid, color: C.text),
                  _Quote(label: 'ASK', value: curAsk, color: C.green),
                  _Quote(label: 'HIGH', value: high, color: C.textDim),
                  _Quote(label: 'LOW', value: low, color: C.textDim),
                ],
              ),
            ),
            // Chart.
            SizedBox(
              height: chartH,
              child: CustomPaint(
                size: Size(widget.width, chartH),
                painter: _ChartPainter(
                  index: widget.index,
                  head: head,
                  yLo: _yLo,
                  yHi: _yHi,
                  enlarged: widget.enlarged,
                ),
              ),
            ),
            // Footer.
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: C.border)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _Foot(label: 'CCY: ', value: widget.currency),
                  _Foot(
                      label: 'SPR: ',
                      value: '\$${(curAsk - curBid).toStringAsFixed(4)}'),
                  const _Foot(label: 'UPD: ', value: '5Hz'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Quote extends StatelessWidget {
  final String label;
  final double value;
  final Color color;
  const _Quote({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: mono(size: 9, color: C.textMuted)),
          Text(value.toStringAsFixed(3),
              style: mono(size: 9, weight: FontWeight.w600, color: color)),
        ],
      ),
    );
  }
}

class _Foot extends StatelessWidget {
  final String label;
  final String value;
  const _Foot({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: label, style: mono(size: 8, color: C.textMuted)),
          TextSpan(text: value, style: mono(size: 8, color: C.textDim)),
        ],
      ),
    );
  }
}

/// Draws the chart directly on the Canvas: dashed grid, solid axes, axis labels,
/// bid/ask area fills, and the three bid/ask/mid polylines. Reads the
/// simulation's ring buffers for `index` straight from the painter.
class _ChartPainter extends CustomPainter {
  final int index;
  final int head;
  final double yLo;
  final double yHi;
  final bool enlarged;

  _ChartPainter({
    required this.index,
    required this.head,
    required this.yLo,
    required this.yHi,
    required this.enlarged,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final plotW = size.width - _padLeft - _padRight;
    final plotH = size.height - _padTop - _padBottom;
    final yRange = (yHi - yLo) == 0 ? 1.0 : (yHi - yLo);
    final base = index * kHistoryLen;

    double xAt(int i) => _padLeft + plotW * (i / (kHistoryLen - 1));
    double yAt(double v) => _padTop + plotH * (1 - (v - yLo) / yRange);

    final gridPaint = Paint()
      ..color = C.grid.withValues(alpha: 0.4)
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;
    final axisPaint = Paint()
      ..color = C.grid
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;

    // Horizontal dashed grid lines at 5 y-divisions + their right-edge labels.
    for (var k = 0; k <= 4; k++) {
      final v = yLo + (yRange * k) / 4;
      final y = yAt(v);
      _dashedLine(canvas, Offset(_padLeft, y),
          Offset(_padLeft + plotW, y), gridPaint);
      _label(canvas, v.toStringAsFixed(1), size.width - 2, y,
          alignRight: true, alignMiddle: true);
    }
    // Vertical dashed grid lines + bottom time labels.
    for (final idx in _xTickIdx) {
      final x = xAt(idx);
      _dashedLine(
          canvas, Offset(x, _padTop), Offset(x, _padTop + plotH), gridPaint);
      _label(canvas, '${kHistoryLen - idx}s', x - 8, size.height - 9);
    }

    // Solid right + bottom axes.
    canvas.drawLine(Offset(_padLeft + plotW, _padTop),
        Offset(_padLeft + plotW, _padTop + plotH), axisPaint);
    canvas.drawLine(Offset(_padLeft, _padTop + plotH),
        Offset(_padLeft + plotW, _padTop + plotH), axisPaint);

    // Build the three curves in one pass.
    final mid = Path(), ask = Path(), bid = Path();
    for (var i = 0; i < kHistoryLen; i++) {
      final idx = base + ((head + i) % kHistoryLen);
      final x = xAt(i);
      final ym = yAt(sim.stockMid[idx]);
      final ya = yAt(sim.stockAsk[idx]);
      final yb = yAt(sim.stockBid[idx]);
      if (i == 0) {
        mid.moveTo(x, ym);
        ask.moveTo(x, ya);
        bid.moveTo(x, yb);
      } else {
        mid.lineTo(x, ym);
        ask.lineTo(x, ya);
        bid.lineTo(x, yb);
      }
    }

    // Area fills: close each line down to the baseline.
    final baseY = _padTop + plotH;
    final askFill = Path.from(ask)
      ..lineTo(xAt(kHistoryLen - 1), baseY)
      ..lineTo(xAt(0), baseY)
      ..close();
    final bidFill = Path.from(bid)
      ..lineTo(xAt(kHistoryLen - 1), baseY)
      ..lineTo(xAt(0), baseY)
      ..close();
    canvas.drawPath(askFill, Paint()..color = C.green.withValues(alpha: 0.12));
    canvas.drawPath(bidFill, Paint()..color = C.red.withValues(alpha: 0.12));

    canvas.drawPath(ask, _stroke(C.green, 1));
    canvas.drawPath(bid, _stroke(C.red, 1));
    canvas.drawPath(mid, _stroke(C.blue, enlarged ? 2 : 1.5));
  }

  Paint _stroke(Color color, double width) => Paint()
    ..color = color
    ..strokeWidth = width
    ..style = PaintingStyle.stroke
    ..strokeJoin = StrokeJoin.round;

  void _dashedLine(Canvas canvas, Offset a, Offset b, Paint paint) {
    const dash = 3.0, gap = 3.0;
    final total = (b - a).distance;
    if (total == 0) return;
    final dir = (b - a) / total;
    var d = 0.0;
    while (d < total) {
      final segEnd = math.min(d + dash, total);
      canvas.drawLine(a + dir * d, a + dir * segEnd, paint);
      d += dash + gap;
    }
  }

  void _label(Canvas canvas, String text, double x, double y,
      {bool alignRight = false, bool alignMiddle = false}) {
    final tp = TextPainter(
      text: TextSpan(text: text, style: mono(size: 8, color: C.textMuted)),
      textDirection: TextDirection.ltr,
    )..layout();
    final dx = alignRight ? x - tp.width : x;
    final dy = alignMiddle ? y - tp.height / 2 : y;
    tp.paint(canvas, Offset(dx, dy));
  }

  @override
  bool shouldRepaint(_ChartPainter old) =>
      old.head != head ||
      old.yLo != yLo ||
      old.yHi != yHi ||
      old.enlarged != enlarged ||
      old.index != index;
}
