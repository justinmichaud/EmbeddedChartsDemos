# FlutterCharts

A native **Flutter desktop** port of **JSChartsFast** — the "MKTTERM" market
terminal: a dark, monospace stock dashboard with a grid of fast-updating
bid/mid/ask charts, a rotating news feed, a radar sweep, a settings modal, and a
detail view. Same output, rebuilt to be as fast and simple as Flutter allows.
Runs on **macOS** and **Linux**.

## How it differs from JSChartsFast (and why)

| JSChartsFast (web) | FlutterCharts |
|---|---|
| Web Worker @ 5 Hz → main → `<iframe>` → React | Simulation runs on the UI isolate (`lib/sim/simulation.dart`), no worker/iframe |
| recharts (heavy SVG component lib) | **`CustomPainter` on a `Canvas`** — bid/ask fills + 3 polylines + grid + axis labels drawn directly, zero chart packages |
| React Context + per-chart anti-SVG hacks | One `ChangeNotifier.notifyListeners()` per tick → the visible cells rebuild and the painter repaints |
| `localStorage` | A plain JSON file via `dart:io` (`lib/storage.dart`) — no native plugins |
| iframe reload for navigation | `setState` screen switch in `main.dart` |
| CSS-gradient sweep (5 Hz steps) | Plain positioned `ColoredBox`es driven by per-tick `sweepPos` (5 Hz steps) |

**Zero dependencies on purpose.** The project uses only the Flutter SDK — no pub
packages. The first attempt persisted settings with `shared_preferences`, but
its native plugin tripped Xcode's Swift Package Manager resolution on this
toolchain (and would have needed CocoaPods on macOS / a platform channel on
Linux). A `dart:io` JSON file in the per-user config dir does the same job with
no native build steps, so the app compiles identically on both platforms.

**Why this stays fast.** recharts' cost wasn't "SVG" — it was *SVG
reconciliation* (per-tick remount of axis tick `<g>`s; most of the original's
`StockChart.tsx` exists to suppress that). Here the per-tick heavy lifting — the
three data curves, area fills, dashed grid and axis labels — happens inside a
`CustomPainter` on the raster side, never as widget reconciliation. Each visible
cell rebuilds a tiny fixed widget tree per tick only so its text quotes stay
live; the chart itself is one `CustomPaint`.

**Architecture is single-isolate on purpose** — the simulation is
zero-allocation (pre-sized `Float64List`/`Int32List` ring buffers) and trivial at
5 Hz, so the worker split the web version needed for memory isolation isn't worth
its cost here. The `LAG` button busy-loops the UI isolate (jank you can feel),
the honest Flutter equivalent of the original's worker stall.

## Performance

Three things keep it smooth even at the 50-chart max:

1. **Drawing in `CustomPainter`, not widgets.** The grid, axes, labels, fills and
   three polylines are `Canvas` calls. The widget tree per cell is a handful of
   `Text`s plus one `CustomPaint` — cheap to rebuild at 5 Hz.
2. **Y-domain hysteresis.** `yLo/yHi` only re-snap when the data leaves the
   current padded range (ported from the original), kept in each chart's
   `State`. That keeps `shouldRepaint` inputs stable and gives a steady grid.
3. **Lazy grid (`SliverGrid` + `SliverChildBuilderDelegate`).** Off-screen charts
   are never built; each on-screen cell wraps its content in a `ListenableBuilder`
   so only the visible dozen rebuild per tick instead of all 50 — the Flutter
   analog of the RN port's `FlatList` virtualization.

The `NN fps` meter is driven by a free-running `Ticker` (the analog of the web
app's `requestAnimationFrame` loop): it keeps the engine producing frames at the
display rate and counts them, so it reads ~refresh-rate when smooth and collapses
under `LAG`. Those frames don't repaint the charts (charts only repaint on the
5 Hz tick), so the ticker's cost is just compositing.

## Layout

```
lib/
  main.dart                 screen state (grid|detail) + settings modal, app shell
  theme.dart                color palette (verbatim hexes) + monospace TextStyles
  storage.dart              JSON-file persistence (dart:io), replaces localStorage
  sim/
    simulation.dart         port of worker.ts — rand, ring buffers, 5 Hz tick, settings, lag
  widgets/
    menu_bar.dart           clock, Ticker-based FPS counter, lag ms, SETTINGS / LAG / RECOVER
    news_view.dart          3 rotating headlines
    stock_grid.dart         responsive lazy grid (2–6 cols by width), news header
    stock_chart.dart        card chrome + CustomPainter (fills, mid/bid/ask lines, grid, labels)
    chart_detail.dart       enlarged single chart + back
    settings_modal.dart     currency + chart-count selection
    sweep_overlay.dart      sweep bar positioned from per-tick sweepPos
```

## Run

Needs the Flutter SDK with desktop enabled:

```bash
flutter config --enable-macos-desktop --enable-linux-desktop

cd FlutterCharts
flutter run -d macos      # or: flutter run -d linux
```

Build a release bundle:

```bash
flutter build macos       # build/macos/Build/Products/Release/fluttercharts.app
flutter build linux       # build/linux/<arch>/release/bundle/fluttercharts
```

### Linux prerequisites

Desktop Linux builds need the GTK/CMake toolchain:
`clang cmake ninja-build pkg-config libgtk-3-dev`.

## Notes / knobs

- Tick rate, history length, and stock count live at the top of
  `lib/sim/simulation.dart` (`kRefreshRateMs`, `kHistoryLen`, `kMaxStocks`) — the
  same constants as the original.
- The xorshift128 generator uses the original's seed and is masked to 32-bit
  unsigned, so the price/headline streams match the web version's shape.
- The `lag ms` readout is the rolling 5 Hz tick-interval jitter (≈0 normally,
  spikes under `LAG`), same as the RN port — the worker-message-age the web
  version measured no longer exists.
- Settings persist to `~/Library/Application Support/FlutterCharts/settings.json`
  (macOS) or `$XDG_CONFIG_HOME/FlutterCharts/settings.json` (Linux). The
  settings modal's reset button deletes that file.
