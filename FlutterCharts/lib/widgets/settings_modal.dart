import 'package:flutter/material.dart';

import '../sim/simulation.dart';
import '../theme.dart';

const List<String> _currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CHF', 'AUD', 'CAD'];
const List<int> _chartCounts = [2, 4, 8, 14, 20, 30, 40, 50];

/// Shows the settings dialog (currency + chart count + reset). Returns when
/// dismissed. Mutates settings through `sim`, which persists and notifies.
Future<void> showSettingsModal(BuildContext context) {
  return showDialog<void>(
    context: context,
    barrierColor: const Color(0xB3000000), // rgba(0,0,0,0.7)
    builder: (context) => const _SettingsDialog(),
  );
}

class _SettingsDialog extends StatefulWidget {
  const _SettingsDialog();
  @override
  State<_SettingsDialog> createState() => _SettingsDialogState();
}

class _SettingsDialogState extends State<_SettingsDialog> {
  @override
  Widget build(BuildContext context) {
    final currency = sim.settings.currency;
    final numCharts = sim.settings.numCharts;

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(16),
      child: Container(
        width: 288,
        decoration: BoxDecoration(
          color: C.panel,
          border: Border.all(color: C.border),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: C.border)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('SETTINGS',
                      style: mono(size: 11, weight: FontWeight.w700)),
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Text('✕', style: mono(size: 14, color: C.textMuted)),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('CURRENCY', style: mono(size: 9, color: C.textMuted)),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 4,
                    runSpacing: 4,
                    children: [
                      for (final c in _currencies)
                        _Chip(
                          label: c,
                          active: c == currency,
                          onTap: () =>
                              setState(() => sim.updateSettings(currency: c)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text('CHARTS DISPLAYED',
                      style: mono(size: 9, color: C.textMuted)),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 4,
                    runSpacing: 4,
                    children: [
                      for (final n in _chartCounts)
                        _Chip(
                          label: '$n',
                          active: n == numCharts,
                          onTap: () =>
                              setState(() => sim.updateSettings(numCharts: n)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  GestureDetector(
                    onTap: () async {
                      await sim.resetAll();
                      if (context.mounted) Navigator.of(context).pop();
                    },
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      decoration: BoxDecoration(border: Border.all(color: C.red)),
                      alignment: Alignment.center,
                      child: Text('CLEAR LOCAL STORAGE & RESET',
                          style: mono(size: 9, color: C.red)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _Chip({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 60,
        padding: const EdgeInsets.symmetric(vertical: 4),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? C.blueDim : null,
          border: Border.all(color: active ? C.blue : C.border),
        ),
        child: Text(label,
            style: mono(size: 9, color: active ? C.blue : C.textMuted)),
      ),
    );
  }
}
