import { useSyncExternalStore } from 'react';
import * as sim from './simulation';
import { loadSettings, saveSettings, clearStorage } from './storage';

// One listener set drives the whole tree. The simulation calls emit() once per
// tick (5 Hz); the root subscribes via useTick() and React re-renders top-down.
// At 5 Hz over <=50 lightweight Skia charts this is trivially cheap — the
// original's pain was SVG reconciliation in recharts, not React render itself.
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let booted = false;
export async function boot() {
  if (booted) return;
  booted = true;
  // When EXPO_PUBLIC_BENCH_RESET=1 (set by bench/bench-RNCharts.mjs), wipe
  // persisted settings before loading so the run uses the app defaults.
  if (process.env.EXPO_PUBLIC_BENCH_RESET === '1') await clearStorage();
  const saved = await loadSettings();
  sim.setSettings(saved);
  sim.start(emit);
}

// getSnapshot returns the tick number: a primitive that changes every tick and
// is stable in between, so useSyncExternalStore behaves. Components read the
// latest data straight from sim's typed arrays during render.
export function useTick(): number {
  return useSyncExternalStore(subscribe, () => sim.state.tick);
}

export function updateSettings(patch: Partial<sim.Settings>) {
  sim.setSettings(patch);
  saveSettings(sim.state.settings);
  emit();
}

export function resetAll() {
  clearStorage();
  sim.resetSettings();
  emit();
}

export function toggleLag() {
  return sim.toggleLag();
}
