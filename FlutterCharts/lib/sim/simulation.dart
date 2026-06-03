// Direct port of JSChartsFast's worker.ts, minus the Web Worker / postMessage
// shell. In Flutter there is no worker or iframe: the simulation runs on the UI
// isolate with a Timer.periodic, mutating typed-array ring buffers in place, and
// notifies the widget tree via ChangeNotifier (one notifyListeners per tick).
// The heavy per-tick drawing lives in a CustomPainter (see stock_chart.dart), so
// React-style reconciliation cost is replaced by a cheap rebuild of the few
// visible cells plus a direct Canvas repaint.

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../storage.dart';

const int kRefreshRateMs = 200; // ms between ticks (5 Hz)
const int _newsRateMs = 10000; // ms between news index advances
const int _sweepPeriodMs = 10000;
const double _sweepStep = kRefreshRateMs / _sweepPeriodMs; // fraction per tick
const int kHistoryLen = 60;
const int kMaxStocks = 50;
const int _ageSamples = 10;

const List<String> kStockSymbols = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'BRK.B', 'JPM', 'V',
  'JNJ', 'WMT', 'PG', 'XOM', 'UNH', 'MA', 'HD', 'BAC', 'KO', 'PEP',
  'ABBV', 'MRK', 'ORCL', 'COST', 'NFLX', 'ADBE', 'CSCO', 'TMO', 'ACN', 'AVGO',
  'CRM', 'MCD', 'PFE', 'LLY', 'INTC', 'AMD', 'T', 'WFC', 'DIS', 'NKE',
  'IBM', 'BA', 'GM', 'F', 'VZ', 'QCOM', 'TXN', 'AMGN', 'GS', 'CAT',
];

const List<double> _initialPrices = [
  178.42, 412.88, 142.65, 186.33, 878.54, 248.91, 492.28, 445.67, 198.72, 287.45,
  156.23, 167.88, 162.45, 112.34, 524.10, 482.55, 388.40, 39.85, 62.71, 173.92,
  162.40, 128.55, 142.30, 832.15, 632.80, 552.40, 49.32, 587.95, 367.20, 1745.10,
  298.40, 287.65, 28.12, 758.30, 35.45, 168.20, 19.85, 56.40, 111.30, 82.55,
  175.20, 213.40, 52.30, 12.85, 41.20, 174.60, 198.40, 312.55, 478.20, 358.40,
];

const List<String> kNewsHeadlines = [
  'Fed signals rate pause as inflation data cools',
  'Tech rally continues on strong earnings beat',
  'Oil prices surge amid Middle East tensions',
  'Dollar weakens as jobless claims rise unexpectedly',
  'S&P 500 hits new all-time high on GDP growth data',
  'Chip sector surges after semiconductor demand forecast raised',
  'Treasury yields rise on stronger-than-expected payrolls',
  'European markets close higher led by banking stocks',
  'Consumer confidence index exceeds analyst expectations',
  'Retail sales data sparks debate over soft landing',
  'Asian markets mixed after China manufacturing PMI miss',
  'Corporate buyback activity hits record quarterly high',
  'Hedge funds increase short positions in energy sector',
  'IPO market rebounds with three major listings this week',
  'Commodity prices under pressure as dollar strengthens',
  'Small-cap stocks outperform on domestic growth optimism',
  'Bond market volatility spikes on inflation expectations',
  'Biotech sector rallies on FDA fast-track designation news',
  'Emerging markets face headwinds from rising US yields',
  'Quarterly earnings season kicks off with mixed signals',
];

class Settings {
  String currency;
  int numCharts;
  Settings({required this.currency, required this.numCharts});

  Settings copy() => Settings(currency: currency, numCharts: numCharts);
  Map<String, dynamic> toJson() => {'currency': currency, 'numCharts': numCharts};
}

Settings defaultSettings() => Settings(currency: 'USD', numCharts: 50);

/// The market simulation. Mutates pre-allocated ring buffers in place and
/// notifies listeners once per 5 Hz tick. Widgets read the buffers directly
/// during build/paint.
class Simulation extends ChangeNotifier {
  // Xorshift128 — zero allocation, deterministic (same seed as the original).
  // Masked to 32 bits so the unsigned-int32 sequence matches JS exactly.
  int _x = 0xDEADBEEF, _y = 362436069, _z = 521288629, _w = 88675123;
  double _rand() {
    final t = (_x ^ ((_x << 11) & 0xFFFFFFFF)) & 0xFFFFFFFF;
    _x = _y;
    _y = _z;
    _z = _w;
    _w = (_w ^ (_w >>> 19) ^ (t ^ (t >>> 8))) & 0xFFFFFFFF;
    return _w / 0x100000000;
  }

  // Pre-allocated ring buffers (never reallocated in the hot loop).
  final Float64List stockMid = Float64List(kMaxStocks * kHistoryLen);
  final Float64List stockBid = Float64List(kMaxStocks * kHistoryLen);
  final Float64List stockAsk = Float64List(kMaxStocks * kHistoryLen);
  final Int32List stockTime = Int32List(kMaxStocks * kHistoryLen);
  final Int32List stockHead = Int32List(kMaxStocks);
  final Float64List _currentMid = Float64List(kMaxStocks);
  final Float64List _spreadBps = Float64List(kMaxStocks);

  // Live state read by the widget tree each tick.
  int tick = 0;
  double sweepPos = 0;
  int newsIndex = 0;
  double lagMs = 0; // rolling tick-interval jitter (0 normal, spikes under LAG)
  Settings settings = defaultSettings();

  bool _artificialLag = false;
  Timer? _timer;
  int _lastWall = 0;
  final Float64List _ageBuf = Float64List(_ageSamples);
  int _ageIdx = 0;
  bool _started = false;

  int stockCount() => math.min(settings.numCharts, kMaxStocks);

  void _initBuffers() {
    for (var s = 0; s < kMaxStocks; s++) {
      _currentMid[s] = _initialPrices[s];
      _spreadBps[s] = (2 + _rand() * 8) / 10000;
      for (var i = 0; i < kHistoryLen; i++) {
        final mid = _initialPrices[s] * (1 + (_rand() - 0.5) * 0.015);
        final spread = mid * _spreadBps[s];
        final idx = s * kHistoryLen + i;
        stockMid[idx] = mid;
        stockBid[idx] = mid - spread / 2;
        stockAsk[idx] = mid + spread / 2;
        stockTime[idx] = i;
      }
      stockHead[s] = 0;
      _currentMid[s] = stockMid[s * kHistoryLen + kHistoryLen - 1];
    }
  }

  void _tick() {
    tick++;
    sweepPos = (sweepPos + _sweepStep) % 1;
    newsIndex =
        ((tick * kRefreshRateMs) ~/ _newsRateMs) % kNewsHeadlines.length;

    // Measure real interval drift as a live "lag" readout.
    final now = DateTime.now().millisecondsSinceEpoch;
    if (_lastWall != 0) {
      _ageBuf[_ageIdx % _ageSamples] =
          math.max(0, now - _lastWall - kRefreshRateMs).toDouble();
      _ageIdx++;
      var sum = 0.0;
      for (var i = 0; i < _ageSamples; i++) {
        sum += _ageBuf[i];
      }
      lagMs = sum / _ageSamples;
    }
    _lastWall = now;

    final n = stockCount();
    for (var s = 0; s < n; s++) {
      final newMid = _currentMid[s] * (1 + (_rand() - 0.5) * 0.004);
      final spread = newMid * _spreadBps[s];
      _currentMid[s] = newMid;

      final head = stockHead[s];
      final idx = s * kHistoryLen + head;
      stockTime[idx] = tick;
      stockMid[idx] = newMid;
      stockBid[idx] = newMid - spread / 2;
      stockAsk[idx] = newMid + spread / 2;
      stockHead[s] = (head + 1) % kHistoryLen;
    }

    notifyListeners();

    if (_artificialLag) {
      // Busy-loop jank demo. Like the RN port (and unlike the web original,
      // which blocked only the worker), this blocks the single UI isolate, so
      // input + sim both stall — the honest single-threaded behaviour.
      var acc = 0.0;
      for (var i = 0; i < 60000000; i++) {
        acc += math.sqrt(i.toDouble());
      }
      if (acc < 0) debugPrint('$acc'); // keep the loop from being elided
    }
  }

  /// Loads persisted settings, fills buffers, and starts the 5 Hz loop.
  Future<void> boot() async {
    if (_started) return;
    _started = true;
    settings = await Storage.loadSettings();
    _initBuffers();
    _timer = Timer.periodic(
        const Duration(milliseconds: kRefreshRateMs), (_) => _tick());
  }

  bool toggleLag() {
    _artificialLag = !_artificialLag;
    return _artificialLag;
  }

  void updateSettings({String? currency, int? numCharts}) {
    if (currency != null) settings.currency = currency;
    if (numCharts != null) settings.numCharts = math.min(numCharts, kMaxStocks);
    Storage.saveSettings(settings);
    notifyListeners();
  }

  Future<void> resetAll() async {
    await Storage.clear();
    settings = defaultSettings();
    notifyListeners();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}

/// The single global simulation instance.
final sim = Simulation();
