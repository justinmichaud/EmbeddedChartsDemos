import 'package:flutter/material.dart';

import '../sim/simulation.dart';
import '../theme.dart';

/// The radar sweep. It advances at the data update rate: the simulation bumps
/// `sim.sweepPos` once per 5 Hz tick and notifies, so this bar steps across in
/// lockstep with the data — same cadence as the original's worker-computed
/// sweepPos. Painted last so it sits on top of the grid.
class SweepOverlay extends StatelessWidget {
  const SweepOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: ListenableBuilder(
        listenable: sim,
        builder: (context, _) => LayoutBuilder(
          builder: (context, constraints) {
            final x = sim.sweepPos * constraints.maxWidth;
            return Stack(
              children: [
                // Faint trailing tint up to the sweep line.
                Positioned(
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: x,
                  child: const ColoredBox(color: C.sweepTint),
                ),
                // Bright sweep line.
                Positioned(
                  left: x,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  child: const ColoredBox(color: C.sweep),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
