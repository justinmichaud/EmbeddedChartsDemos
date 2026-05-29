# RNCharts

A React Native (Expo) port of **JSChartsFast** — the "MKTTERM" market terminal:
a dark, monospace stock dashboard with a grid of fast-updating bid/mid/ask
charts, a rotating news feed, a radar sweep, a settings modal, and a detail
view. Same output, rebuilt to be as fast and simple as RN allows.

## How it differs from JSChartsFast (and why)

| JSChartsFast (web) | RNCharts |
|---|---|
| Web Worker @ 5 Hz → main → `<iframe>` → React | Simulation runs on the JS thread (`src/simulation.ts`), no worker/iframe |
| recharts (heavy SVG component lib) | **`react-native-svg`** — 3 hand-built `<Path>`s per chart |
| React Context + per-chart anti-SVG hacks | One `useSyncExternalStore` tick → top-down re-render @ 5 Hz |
| `localStorage` | `AsyncStorage` |
| iframe reload for navigation | `useState` screen switch in `App.tsx` |
| CSS-gradient sweep (5 Hz steps) | Plain `<View>` positioned from per-tick `sweepPos` (5 Hz steps) |

**Renderer note — Skia was attempted first, then dropped.** The original plan
used `@shopify/react-native-skia` (GPU immediate-mode) for max speed. On this
stack — Expo SDK 52 / RN 0.76 / **New Architecture** / iOS simulator — Skia's
`<Canvas>` painted *nothing* (even a solid `<Rect>` was invisible), at the exact
Expo-recommended version (1.5.0), so it wasn't a version fix. We switched to
`react-native-svg`, which renders reliably here.

**Why this stays fast anyway:** recharts' cost wasn't "SVG" — it was *SVG
reconciliation* (per-tick remount of axis tick `<g>`s; most of the original's
`StockChart.tsx` exists to suppress that). Here each chart is a fixed, stable
tree of a handful of nodes whose `d` strings only change *value* each tick, so
React reconciles cheaply. At 5 Hz over ≤50 charts that's comfortably smooth.

**Architecture is single-thread on purpose** — the simulation is zero-allocation
(pre-sized `Float64Array`/`Int32Array` ring buffers) and trivial at 5 Hz, so the
worker split the web version needed for memory isolation isn't worth its cost
here. The `LAG` button busy-loops the JS thread (jank you can feel), which is the
honest RN equivalent of the original's worker stall.

## Performance

At the default 14 charts the naive "re-render everything at 5 Hz" approach is
smooth, but at the max of 50 charts it cratered to ~5 fps. Three changes took it
to ~46 fps (≈9×) at 50 charts on the iOS simulator, all in `StockChart.tsx` /
`StockGrid.tsx`:

1. **Stable chart chrome (`ChartChrome`, memoized).** Grid lines, axis lines and
   axis labels are split into a child component memoized on `(width, chartH,
   yLo, yHi)`. Only the 3 data paths rebuild per tick.
2. **Y-domain hysteresis.** `yLo/yHi` only re-snap when the data leaves the
   current padded range (ported from the original). That keeps the chrome's memo
   inputs byte-identical across most ticks, so its element identity is reused and
   React + react-native-svg skip the whole subtree — the per-tick node count per
   chart drops from ~30 to ~5.
3. **Virtualized grid (`FlatList`).** Off-screen charts are unmounted, so each
   tick updates only the ~dozen charts near the viewport instead of all 50.
   `extraData={tick}` re-renders the mounted cells; `windowSize`/
   `maxToRenderPerBatch` are tuned down from FlatList's large defaults.

Further headroom, if ever needed, would come from driving the data paths
imperatively via `setNativeProps` (skipping React reconciliation entirely), or a
single-canvas renderer — neither is necessary at these sizes.

## Layout

```
App.tsx                 screen state (grid|detail) + settings modal, single tick subscription
src/simulation.ts       port of worker.ts — rand, ring buffers, 5 Hz tick, settings, lag readout
src/store.ts            listener set + useSyncExternalStore + persisted actions
src/storage.ts          AsyncStorage (replaces localStorage)
src/theme.ts            color palette + monospace font
src/components/
  MenuBar.tsx           clock, rAF FPS counter, lag ms, SETTINGS / LAG / RECOVER
  NewsView.tsx          3 rotating headlines
  StockGrid.tsx         responsive grid (2–6 cols by width)
  StockChart.tsx        SVG: bid/ask area fills + mid line + grid; RN-Text axis labels
  ChartDetail.tsx       enlarged single chart + back
  SettingsModal.tsx     currency + chart-count selection
  SweepOverlay.tsx      sweep bar positioned from per-tick sweepPos
```

## Run

Uses native modules (`react-native-svg`, `expo-dev-client`), so it needs a
**custom dev build** — not Expo Go.

```bash
cd RNCharts
npm install          # or: npx expo install  (reconciles native versions to the SDK)
npx expo prebuild    # generates ios/ + android/
npx expo run:ios     # or: npx expo run:android
```

After the first native build, iterate with `npm start` (the dev client reloads JS).

Type-check only: `npm run tsc`.

### macOS prerequisites (gotchas hit during first run)

- **CocoaPods on PATH** — if `pod install` fails with `spawn pod ENOENT`, the
  Homebrew-Ruby gem bin dir isn't on PATH. Add it:
  `export PATH="/opt/homebrew/lib/ruby/gems/<ver>/bin:/opt/homebrew/opt/ruby/bin:$PATH"`.
- **iOS simulator runtime** — Xcode 26.x ships the SDK but not always a matching
  simulator *runtime*. If `xcodebuild` reports "iOS XX is not installed" / no
  eligible destinations, run `xcodebuild -downloadPlatform iOS` (~8 GB). A
  leftover older runtime (e.g. 18.3) shows in `simctl` but Xcode 26 won't build
  against it.

## Notes / knobs

- Tick rate, history length, and stock count live at the top of `src/simulation.ts`
  (`REFRESH_RATE`, `HISTORY_LEN`, `MAX_STOCKS`) — same constants as the original.
- The `lag ms` readout is repurposed as 5 Hz tick-interval jitter (≈0 normally,
  spikes under `LAG`), since the worker-message-age it measured on web no longer exists.
- `react-native-reanimated` is still installed (babel plugin) but no longer used
  by any component after the sweep was made tick-driven — safe to remove if you
  also drop the plugin from `babel.config.js`.
- If you want more headroom at 50 charts, options are collapsing the grid into a
  single canvas, or revisiting Skia once its New-Architecture blank-canvas issue
  is resolved on this stack.
