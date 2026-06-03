# Charts benchmark harness

One benchmark script per implementation in this repo. Each runs the app's
live, self-updating charts for a configurable amount of time and records
**framerate** and **memory usage** over time, then writes a JSON sample log and
an SVG graph to [`results/`](results/). For the web apps it also triggers the
in-app **RECOVER** action at the end and collects an extra, separately
configurable window of data.

## What gets measured

| Metric | Web apps | Native apps (Flutter / Qt / RN) |
|---|---|---|
| **FPS** | a `requestAnimationFrame` counter injected into every frame (same method the apps use to show FPS); effective FPS = the slowest chart frame | the app is instrumented to print one `BENCHFPS <n>`/sec when `BENCH_FPS=1` / `EXPO_PUBLIC_BENCH_FPS=1`; the harness reads those lines |
| **RSS** (MB) | summed over the whole Chromium process tree, via `ps` | the app process's RSS, via `ps` |
| **JS heap** (MB) | per-renderer `JSHeapUsedSize` via CDP | n/a |
| **RECOVER** | triggered at the end (apps that support it), then an extra window sampled | n/a |

FPS instrumentation in the native apps is gated behind an env var and has **no
effect** on normal runs:
- FlutterCharts: [`lib/widgets/menu_bar.dart`](../FlutterCharts/lib/widgets/menu_bar.dart)
- QTCharts / QTChartsFast: `src/AppModel.cpp` (`reportFps`)
- RNCharts: [`src/components/MenuBar.tsx`](../RNCharts/src/components/MenuBar.tsx)

## Setup

```bash
cd bench
npm install            # installs playwright; reuses the cached Chromium if present
npx playwright install chromium   # only if no Chromium is cached
```

## Running

Common flags (all have defaults): `--duration <sec>` (run window, default 30),
`--recover <sec>` (extra window after RECOVER, web only, default 15),
`--interval <ms>` (sample period, default 1000), `--warmup <sec>`,
`--verbose` (native, echo app stdout), `--out <dir>`, `--stamp <name>`
(output filename suffix).

> **Web apps run headed (on a real display) by default.** Headless Chromium
> does not use the GPU compositor, so its framerate and memory are not
> representative of the real app — never benchmark a graphical app off-screen.
> A Chromium window opens for the run; leave it visible. Pass `--headless` only
> for unattended/CI smoke checks where the numbers are not meant to be trusted.
> (The native apps always run as real on-screen windows.)

### Web apps — ready to run (served from each app's `dist/`)

```bash
node bench-JSChartsFast.mjs      --duration 30 --recover 15
node bench-CanvasCharts.mjs      --duration 30 --recover 15
node bench-JSChartsFastServo.mjs --duration 30 --recover 15
node bench-JSChartsNoLeaks.mjs   --duration 30 --recover 15
node bench-WasmCharts.mjs        --duration 30 --recover 15   # no RECOVER: extra window still sampled
node bench-JSChartsSimple.mjs    --duration 30                # no RECOVER
```

> Uses the prebuilt `dist/`. To benchmark fresh code, rebuild the app first
> (`pnpm build` / `pnpm wasm:build` etc.).

### Native apps — build once, then run

**FlutterCharts**
```bash
cd ../FlutterCharts && flutter build macos --profile && cd ../bench
node bench-FlutterCharts.mjs --duration 30
```

**QTCharts / QTChartsFast**
```bash
cd ../QTCharts        # or QTChartsFast
PATH="$(brew --prefix qt)/bin:$PATH" qt-cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j4
cd ../bench
node bench-QTCharts.mjs --duration 30
```

**RNCharts** (Xcode + iOS simulator; first build takes several minutes — the
harness waits for the app to come up before timing)
```bash
cd ../RNCharts && npm install && cd ../bench
node bench-RNCharts.mjs --duration 30
```

### Everything at once

```bash
node run-all.mjs --duration 30 --recover 15            # all (natives must be built)
node run-all.mjs --web-only --duration 30 --recover 15 # just the 6 web apps
node run-all.mjs --only JSChartsFast,WasmCharts
node run-all.mjs --skip RNCharts
```

`run-all.mjs` runs each implementation in turn (sharing one timestamp) and then
writes a **combined comparison graph** across all of them:
`results/_combined-<stamp>.svg` — two stacked panels (FPS and RSS vs. elapsed
time) with one color-coded line per demo and a legend showing each app's average
FPS and peak RSS — plus `results/_combined-<stamp>.json` with those summary
numbers.

## Settings reset

Each launcher **resets the app's persisted settings to defaults before the run**
so the benchmark always measures the same configuration (currently 50 charts)
regardless of anything a prior interactive session saved:

- Web — clears `localStorage` and reloads (web app default).
- FlutterCharts — deletes `~/Library/Application Support/FlutterCharts/settings.json`.
- QTCharts / QTChartsFast — `QSettings().clear()` at startup, gated on `BENCH_RESET=1`.
- RNCharts — clears AsyncStorage in `boot()`, gated on `EXPO_PUBLIC_BENCH_RESET=1`.

## Output

Each run writes `results/<App>-<stamp>.json` and `results/<App>-<stamp>.svg`.

- **JSON**: `params`, `recoverAtSec`, a per-phase `summary` (avg/min/max/p5/p95
  of FPS, RSS MB, JS-heap MB for the `run` and `recover` phases), and the full
  `samples` array (`ts`, `phase`, `fps`, `jsHeapMB`, `rssMB`).
- **SVG**: FPS (left axis) and memory (right axis) vs. elapsed time, with a
  dashed red rule marking the RECOVER point. Open it in any browser.

A summary table is also printed to the console at the end of each run.

## Layout

```
bench/
  bench-<App>.mjs     per-implementation launcher (one per app)
  web-bench.mjs       web engine: static server + Playwright driver
  native-bench.mjs    native engine: spawn app, parse BENCHFPS, sample RSS
  web-apps.mjs        per-web-app config (dist dir, base path, recover support)
  run-all.mjs         run every implementation in one session + combined graph
  lib/                static-server, proc (RSS), report (JSON+SVG), combined, stats, cli
  results/            output (.json + .svg)
```
