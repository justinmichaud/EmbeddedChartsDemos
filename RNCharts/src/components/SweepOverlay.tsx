import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { C } from '../theme';
import { state } from '../simulation';

// The radar sweep. It advances at the data update rate: the worker-equivalent
// bumps `state.sweepPos` once per 5 Hz tick, and App re-renders on every tick,
// so the bar steps across in lockstep with the data — same cadence as the
// original's worker-computed sweepPos.
export function SweepOverlay() {
  const { width } = useWindowDimensions();
  const x = state.sweepPos * width;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* faint trailing tint up to the sweep line */}
      <View style={[styles.tint, { width: x }]} />
      {/* bright sweep line */}
      <View style={[styles.line, { left: x }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  tint: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: C.sweepTint },
  line: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: C.sweep },
});
