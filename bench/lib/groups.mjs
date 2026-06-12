// Default comparison groups for run-all. Each group becomes two chart files
// (framerate + memory) in results/. `app` is the internal benchmark name (maps
// to bench-<app>.mjs and to the per-app JSON report); `label` is the display
// name used in that group's charts/legend.
//
// The set of apps actually run by run-all is the union of every group's
// members (de-duplicated) — so adding a member here is enough to include it.

export const DEFAULT_GROUPS = [
  {
    title: 'Chromium vs WebKit — Wasm/Canvas vs Canvas-JS vs SVG-JS',
    slug: 'group1-chromium-vs-webkit',
    members: [
      { app: 'JSChartsFastWebKit', label: 'JS+SVG (WPE)' },
      { app: 'JSChartsFast',       label: 'JS+SVG (Chromium)' },
      { app: 'CanvasChartsWebKit', label: 'JS+Canvas (WPE)' },
      { app: 'CanvasCharts',       label: 'JS+Canvas (Chromium)' },
      { app: 'WasmChartsWebKit',   label: 'Wasm (WPE)' },
      { app: 'WasmCharts',         label: 'Wasm (Chromium)' },
    ],
  },
  {
    title: 'Servo vs Chromium',
    slug: 'group2-servo-vs-chromium',
    members: [
      { app: 'JSChartsFastServo',         label: 'Servo' },
      { app: 'JSChartsFastServoChromium', label: 'Servo compat baseline (Chromium)' },
      { app: 'JSChartsFast',              label: 'JS+SVG (Chromium)' },
    ],
  },
  {
    title: 'Native showdown',
    slug: 'group3-native-showdown',
    members: [
      { app: 'QTChartsFast',  label: 'Qt' },
      { app: 'FlutterCharts', label: 'Flutter' },
      { app: 'SlintCharts',   label: 'Slint' },
      { app: 'WasmCharts',    label: 'Wasm (Chromium)' },
    ],
  },
  {
    title: 'Final contenders',
    slug: 'group4-final-contenders',
    members: [
      { app: 'CanvasCharts',  label: 'JS+Canvas (Chromium)' },
      { app: 'QTChartsFast',  label: 'Qt' },
      { app: 'SlintCharts',   label: 'Slint' },
    ],
  },
];

// The de-duplicated set of apps referenced by a list of groups, preserving
// first-seen order so charts and console output read top-to-bottom.
export function appsForGroups(groups) {
  const seen = new Set();
  const out = [];
  for (const g of groups) {
    for (const mem of g.members) {
      if (!seen.has(mem.app)) { seen.add(mem.app); out.push(mem.app); }
    }
  }
  return out;
}
