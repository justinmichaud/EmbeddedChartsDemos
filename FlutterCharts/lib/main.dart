import 'package:flutter/material.dart';

import 'sim/simulation.dart';
import 'theme.dart';
import 'widgets/chart_detail.dart';
import 'widgets/menu_bar.dart';
import 'widgets/settings_modal.dart';
import 'widgets/stock_grid.dart';
import 'widgets/sweep_overlay.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await sim.boot(); // load persisted settings + start the 5 Hz loop
  runApp(const MktTermApp());
}

class MktTermApp extends StatelessWidget {
  const MktTermApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MKTTERM',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: C.bg,
        useMaterial3: true,
      ),
      home: const TerminalScreen(),
    );
  }
}

class TerminalScreen extends StatefulWidget {
  const TerminalScreen({super.key});
  @override
  State<TerminalScreen> createState() => _TerminalScreenState();
}

class _TerminalScreenState extends State<TerminalScreen> {
  String? _detail;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: C.bg,
      body: SafeArea(
        child: Column(
          children: [
            TerminalMenuBar(
              onSettings: () => showSettingsModal(context),
              onRecover: () => setState(() => _detail = null),
            ),
            Expanded(
              child: _detail != null
                  ? ChartDetail(
                      symbol: _detail!,
                      onBack: () => setState(() => _detail = null),
                    )
                  : Stack(
                      children: [
                        StockGrid(
                          onSelect: (symbol) => setState(() => _detail = symbol),
                        ),
                        // Painted last so it sits on top of the grid.
                        const Positioned.fill(child: SweepOverlay()),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
