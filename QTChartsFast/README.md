# Qt Charts Demo

A Qt 6 / QML port of the JavaScript stock-chart viewer in
[`../JSChartsNoLeaks`](../JSChartsNoLeaks). The two are intended as a
side-by-side comparison between a typical web stack (React + Recharts +
Web Worker) and a typical Qt stack (Qt Quick + Qt Charts + `QThread`),
both rendering the same synthetic 5 Hz market-data feed.

## Architecture

| Web version (`JSChartsNoLeaks/`) | Qt version (this folder) |
|---|---|
| `src/worker.ts` (Web Worker) | `src/DataEngine.{h,cpp}` running on a `QThread`, driven by `QTimer` |
| `src/main.ts` (postMessage relay, iframe owner) | `src/AppModel.{h,cpp}` (GUI-thread bridge, queued signals) |
| `src/iframe/context/DataContext.tsx` | `AppModel` properties + `StockItem` QObjects |
| `src/iframe/components/StockChart.tsx` (Recharts) | `qml/StockChart.qml` (Qt Charts `ChartView` + `LineSeries`) |
| Iframe navigation | `StackView` (QtQuick.Controls) |
| `localStorage` | `QSettings` |
| `postMessage` | Qt signals/slots |

The data layout is intentionally identical: 14 stocks (configurable
2–14, max 20), pre-allocated ring buffers of 60 samples per stock for
mid/bid/ask/time, the same xorshift128 PRNG, the same news-feed cycle,
the same 10 s sweep overlay.

## Requirements

- **OS**: Ubuntu 24.04 (Noble) or compatible. Tested on aarch64.
- **Qt**: System Qt 6.4 (Qt 6.4.2 on Noble). Qt Graphs is *not* used
  because it requires Qt 6.6+; Qt Charts ships in 6.4. Qt Widgets is
  pulled in transitively because Qt Charts uses `QGraphicsScene`
  internally — `main.cpp` therefore uses `QApplication`, not
  `QGuiApplication`.
- **Build**: CMake ≥ 3.21, GCC with C++17.

### System packages

Install with apt:

```
sudo apt install \
    cmake \
    qt6-base-dev \
    qt6-declarative-dev \
    qt6-charts-dev \
    qml6-module-qtcharts \
    qml6-module-qtqml-workerscript \
    qml6-module-qtquick \
    qml6-module-qtquick-templates \
    qml6-module-qtquick-controls \
    qml6-module-qtquick-controls-basic \
    qml6-module-qtquick-layouts \
    qml6-module-qtquick-window
```

`qt6-base-dev` already provides Qt Widgets (`Qt6::Widgets`), which Qt
Charts depends on at runtime.

The `qt6-base-dev` and `qt6-declarative-dev` packages provide the
CMake config files for `Qt6::Core/Gui/Qml/Quick/QuickControls2`. The
`qml6-module-*` packages are the runtime QML plugins — they're
required to *run* the app, not to build it.

## Build

Use a separate build directory per configuration so Debug and Release can
coexist. Single-config generators (Unix Makefiles, Ninja) require
`CMAKE_BUILD_TYPE` at *configure* time — passing it to `cmake --build` does
nothing.

### Debug (with `compile_commands.json` for clangd)

```
cmake -S . -B build \
    -DCMAKE_BUILD_TYPE=Debug \
    -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
cmake --build build -j$(nproc)
ln -sf build/compile_commands.json compile_commands.json
```

Output binary: `build/qtcharts_demo`.

The symlink at the project root lets clangd / Neovim / VS Code
auto-discover the compilation database without configuring the language
server. It also clears the spurious "QObject file not found" diagnostics
clangd would otherwise emit on Qt headers.

### Release (LTO + `-march=native`)

```
cmake -S . -B build-release \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INTERPROCEDURAL_OPTIMIZATION=ON \
    -DCMAKE_CXX_FLAGS_RELEASE="-O3 -DNDEBUG -march=native"
cmake --build build-release -j$(nproc)
strip build-release/qtcharts_demo
```

What each flag does:

- `CMAKE_BUILD_TYPE=Release` — base `-O3 -DNDEBUG` profile (drops asserts,
  full optimizer). Roughly halves CPU per tick on the data engine in
  practice.
- `CMAKE_INTERPROCEDURAL_OPTIMIZATION=ON` — link-time optimization. Lets
  the compiler inline across translation units (e.g. xorshift `rand01()`
  into the `tick()` loop). Adds ~20-30 s to link time on this codebase
  but trims another few percent from steady-state CPU.
- `-march=native` — emit instructions tuned for the build host's CPU.
  Speeds up the tight `tick()` loop (xorshift + ring-buffer writes) but
  produces a binary that won't run on older CPUs of the same family.
  **Drop this flag for distributable builds.**
- `strip` — drops the symbol table from the final binary
  (~419 K → ~329 K on aarch64). Skip if you want symbolicated stack
  traces in production. The bulk of the runtime memory footprint comes
  from Qt's shared libraries (`libQt6Charts`, `libQt6Quick`, etc.)
  loaded at process start, not from this binary.

QML files are precompiled at build time by `qt_add_qml_module` and
embedded as bytecode in the resource bundle, so there is no separate
"QML cache warm-up" step to worry about — the cache is the binary.

## Run

```
./build/qtcharts_demo
```

Settings (currency, number of charts) persist via `QSettings` to
`~/.config/EmbeddedDemos/QtChartsDemo.conf`.

### Useful environment variables

- `QSG_RENDER_TIMING=1` — log scene-graph render timing per frame.
- `QT_LOGGING_RULES="qt.qml.diskcache.debug=true"` — verify QML disk
  cache hits.
- `QT_QPA_PLATFORM=wayland` / `xcb` — force a particular windowing
  backend.

### Memory test

Use `heaptrack` for a snapshot comparable to the WebKit memory test in
the JS version's README:

```
sudo apt install heaptrack heaptrack-gui
heaptrack ./build/qtcharts_demo
# … exercise the app for a few minutes …
# (Ctrl+C, then heaptrack will print a summary command)
```

The data engine is allocation-free in steady state. The only per-tick
allocations on the GUI side are the `QList<QPointF>` lists fed into
`LineSeries::replace()`, which match the per-tick `Array.from(slice)`
allocations in the JS version. Both should show flat heap growth.

## Project layout

```
CMakeLists.txt
src/
  main.cpp           — QGuiApplication + QQmlApplicationEngine bootstrap
  Snapshot.h         — POD struct sent across the worker→GUI thread boundary
  DataEngine.{h,cpp} — Synthetic data engine, runs on its own QThread
  AppModel.{h,cpp}   — GUI-thread state, exposed to QML via context property
  StockItem.{h,cpp}  — Per-stock notifying QObject (one per visible chart)
qml/
  Main.qml           — ApplicationWindow + StackView
  TopBar.qml         — Clock, FPS, lag, settings/lag/recover buttons
  NewsView.qml       — Three-row rotating headline feed
  StockGrid.qml      — Responsive GridLayout of StockChart instances
  StockChart.qml     — One ChartView (bid/ask/mid LineSeries) + chrome
  ChartDetail.qml    — Single enlarged chart + back button
  SettingsModal.qml  — Popup with currency + chart-count grids
  SweepOverlay.qml   — 10 s sweep gradient
```
