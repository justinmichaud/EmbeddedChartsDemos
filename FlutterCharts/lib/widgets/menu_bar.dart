import 'dart:io' show Platform, stdout;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../sim/simulation.dart';
import '../theme.dart';

/// When the BENCH_FPS=1 environment variable is set, the menu bar prints one
/// `BENCHFPS <n>` line per second to stdout so the benchmark harness
/// (bench/bench-FlutterCharts.mjs) can read the live framerate. No effect on
/// normal runs.
final bool _benchEmitFps = Platform.environment['BENCH_FPS'] == '1';

/// Top bar: MKTTERM logo, wall clock, live FPS, lag-ms readout, currency, and
/// the SETTINGS / LAG / RECOVER buttons.
///
/// FPS is measured with a free-running Ticker (the Flutter analog of the
/// original's requestAnimationFrame loop): it keeps the engine producing frames
/// at the display rate and counts them per second, so the meter reads ~refresh
/// rate when smooth and drops under the LAG busy-loop. The chart cells do NOT
/// repaint on these frames — they only repaint on the 5 Hz sim tick — so the
/// ticker's cost is just compositing.
class TerminalMenuBar extends StatefulWidget {
  final VoidCallback onSettings;
  final VoidCallback onRecover;
  const TerminalMenuBar(
      {super.key, required this.onSettings, required this.onRecover});

  @override
  State<TerminalMenuBar> createState() => _TerminalMenuBarState();
}

class _TerminalMenuBarState extends State<TerminalMenuBar>
    with SingleTickerProviderStateMixin {
  bool _lagOn = false;
  String _time = '';
  int _fps = 0;

  late final Ticker _ticker;
  int _frames = 0;
  Duration _lastSecond = Duration.zero;
  Duration _lastClock = Duration.zero;

  @override
  void initState() {
    super.initState();
    _time = _formatNow();
    _ticker = createTicker(_onFrame)..start();
  }

  String _formatNow() {
    final d = DateTime.now();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.hour)}:${two(d.minute)}:${two(d.second)}';
  }

  void _onFrame(Duration elapsed) {
    _frames++;
    if (elapsed - _lastSecond >= const Duration(seconds: 1)) {
      _lastSecond = elapsed;
      if (_benchEmitFps) stdout.writeln('BENCHFPS $_frames');
      setState(() => _fps = _frames);
      _frames = 0;
    }
    if (elapsed - _lastClock >= const Duration(seconds: 1)) {
      _lastClock = elapsed;
      final t = _formatNow();
      if (t != _time) setState(() => _time = t);
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: const BoxDecoration(
        color: C.panel,
        border: Border(bottom: BorderSide(color: C.border)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Text('MKTTERM',
                  style: mono(size: 12, color: C.blue, weight: FontWeight.w700)),
              const SizedBox(width: 16),
              Text(_time, style: mono(size: 10, color: C.textMuted)),
              const SizedBox(width: 16),
              Text.rich(TextSpan(children: [
                TextSpan(
                    text: '$_fps',
                    style: mono(size: 10, color: C.greenBright)),
                TextSpan(text: ' fps', style: mono(size: 10, color: C.textMuted)),
              ])),
              const SizedBox(width: 16),
              // Lag readout reads live from sim; ListenableBuilder updates it.
              ListenableBuilder(
                listenable: sim,
                builder: (_, _) => Text.rich(TextSpan(children: [
                  TextSpan(
                      text: 'lag ', style: mono(size: 10, color: C.textMuted)),
                  TextSpan(
                      text: sim.lagMs.toStringAsFixed(1),
                      style: mono(size: 10, color: C.amber)),
                  TextSpan(
                      text: ' ms', style: mono(size: 10, color: C.textMuted)),
                ])),
              ),
            ],
          ),
          Row(
            children: [
              ListenableBuilder(
                listenable: sim,
                builder: (_, _) => Text(sim.settings.currency,
                    style: mono(size: 10, color: C.textDim)),
              ),
              const SizedBox(width: 12),
              _Btn(label: 'SETTINGS', onTap: widget.onSettings),
              const SizedBox(width: 12),
              _Btn(
                label: _lagOn ? 'LAG ON' : 'LAG',
                active: _lagOn,
                onTap: () => setState(() => _lagOn = sim.toggleLag()),
              ),
              const SizedBox(width: 12),
              _Btn(label: 'RECOVER', onTap: widget.onRecover),
            ],
          ),
        ],
      ),
    );
  }
}

class _Btn extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _Btn({required this.label, this.active = false, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          border: Border.all(color: active ? C.orange : C.border),
        ),
        child: Text(label,
            style: mono(size: 10, color: active ? C.orange : C.textMuted)),
      ),
    );
  }
}
