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

The web apps run in three engines: **Chromium** (Playwright), **WebKit**
(WebDriver, in the wkdev container) and **Servo** (WebDriver). FPS is measured
the same rAF way in all three; only Chromium reports JS heap and supports the
RECOVER phase (the others have no CDP). Native apps run directly.

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
node bench-JSChartsFast.mjs               --duration 30 --recover 15
node bench-CanvasCharts.mjs               --duration 30 --recover 15
node bench-JSChartsFastServo.mjs          --duration 30                # real Servo (WebDriver); no RECOVER
node bench-JSChartsFastServoChromium.mjs  --duration 30 --recover 15   # same build, in Chromium
node bench-JSChartsNoLeaks.mjs            --duration 30 --recover 15
node bench-WasmCharts.mjs                 --duration 30 --recover 15   # no RECOVER: extra window still sampled
node bench-JSChartsSimple.mjs             --duration 30                # no RECOVER
```

> **`JSChartsFastServo` runs in a real Servo browser**, driven over Servo's
> WebDriver server (`servo-bench.mjs`) — every other web app is driven in
> Chromium via Playwright. Servo has no CDP, so this run reports **no JS heap**
> and has **no RECOVER phase** (the engine can't force GC); it samples FPS and
> whole-process RSS only. The same build run in Chromium (with JS heap + RECOVER)
> is `JSChartsFastServoChromium`, for cross-engine comparison.
>
> Servo is expected at `/Applications/Servo.app/Contents/MacOS/servo`; override
> with `SERVO_BIN`. Other env knobs: `SERVO_WEBDRIVER_PORT` (default 7055),
> `SERVO_WINDOW_SIZE` (default `1920x1080`).

> Uses the prebuilt `dist/`. To benchmark fresh code, rebuild the app first
> (`pnpm build` / `pnpm wasm:build` etc.).

### Web apps in WebKit (WPE/GTK)

`CanvasCharts`, `WasmCharts` and `JSChartsFast` can also be run in the local
**WebKit** build, driven over WebDriver — the same rAF FPS methodology as the
Chromium and Servo runs, so the engines are directly comparable:

```bash
node bench-CanvasChartsWebKit.mjs --duration 30
node bench-WasmChartsWebKit.mjs   --duration 30
node bench-JSChartsFastWebKit.mjs --duration 30
```

These launch `Tools/Scripts/run-webdriver --release --gtk` **inside the wkdev
container** (`wkdev-enter --exec`) and point it at the build's `MiniBrowser`.
The container uses host networking, so the WebDriver port and the host static
server reach each other on `127.0.0.1`; RSS is summed by running `ps` inside
the container. Like Servo there is **no JS heap and no RECOVER** (no CDP). Env
knobs: `WKDEV_CONTAINER` (default `wkdev64`), `WEBKIT_SOURCE_DIR` (default
`~/Development/DebugVersion/OpenSource`), `WEBKIT_WEBDRIVER_PORT` (default
`8088`), `WEBKIT_PORT` (`gtk`|`wpe`), `WEBKIT_CONFIG` (`release`|`debug`).

> **Run from a real graphical session.** WebKit only advances
> `requestAnimationFrame` while its window is actually composited on a live
> display; on a virtual/headless display with no compositor the FPS reads 0
> (Chromium sidesteps this with throttle-disable launch flags WebKit does not
> expose). Launch `run-all`/the WebKit launchers from the same graphical shell
> you use for `run-minibrowser`.

### Native apps — build once, then run

**FlutterCharts** (macOS or Linux)
```bash
cd ../FlutterCharts && flutter build macos --profile && cd ../bench   # macOS
cd ../FlutterCharts && flutter build linux --profile && cd ../bench   # Linux
node bench-FlutterCharts.mjs --duration 30
```

**QTCharts / QTChartsFast** (macOS or Linux)
```bash
cd ../QTCharts        # or QTChartsFast
# macOS:
PATH="$(brew --prefix qt)/bin:$PATH" qt-cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
# Linux:
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
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
node run-all.mjs --duration 30                  # default: the comparison-group apps
node run-all.mjs --all --duration 30 --recover 15   # the full catalogue
node run-all.mjs --web-only --duration 30 --recover 15
node run-all.mjs --only JSChartsFast,WasmCharts
node run-all.mjs --skip FlutterCharts
```

**By default** `run-all.mjs` runs exactly the apps needed for four comparison
groups (defined in [`lib/groups.mjs`](lib/groups.mjs)) — each app runs once even
when it appears in several groups — and keeps the **screen/session awake** for
the whole run (`systemd-inhibit`, falling back to `gnome-session-inhibit`). The
default groups:

1. **Chromium vs WebKit** — JS+SVG, JS+Canvas and Wasm, each in WebKit (WPE) and Chromium.
2. **Servo vs Chromium** — Servo, the Servo compat baseline (Chromium), and JS+SVG (Chromium).
3. **Native showdown** — Qt, Flutter, Slint, Wasm (Chromium).
4. **Final contenders** — JS+Canvas (Chromium), Qt, Slint.

The intentionally-omitted demos (the slow `QTCharts`, `JSChartsSimple`,
`JSChartsNoLeaks`, `RNCharts`) only run under `--all` or an explicit `--only`.

For **each group** it writes a **separate pair of chart files** — framerate and
memory kept in distinct files:
`results/<group-slug>-fps-<stamp>.svg` and `results/<group-slug>-memory-<stamp>.svg`
(one color-coded line per member, labelled as above). It also still writes the
overall `results/_combined-<stamp>.svg` / `.json` across everything that ran.

## Settings reset

Each launcher **resets the app's persisted settings to defaults before the run**
so the benchmark always measures the same configuration (currently 50 charts)
regardless of anything a prior interactive session saved:

- Web — clears `localStorage` and reloads (web app default).
- FlutterCharts — deletes the saved `settings.json` (`~/Library/Application Support/FlutterCharts/` on macOS, `~/.local/share/FlutterCharts/` on Linux).
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
  bench-<App>.mjs     per-implementation launcher (one per app; *WebKit variants too)
  web-bench.mjs       web engine: static server + Playwright (Chromium) driver
  webkit-bench.mjs    WebKit engine: WebDriver via run-webdriver in the wkdev container
  servo-bench.mjs     Servo engine: WebDriver against a real Servo build
  native-bench.mjs    native engine: spawn app, parse BENCHFPS, sample RSS
  web-apps.mjs        per-web-app config (dist dir, base path, recover support)
  run-all.mjs         run the default groups (or --all) in one session + charts
  lib/                static-server, proc (RSS), report, combined, stats, cli,
                      webdriver, groups (group defs), group-charts (per-group SVGs)
  results/            output (.json + per-app .svg + per-group fps/memory .svg)
```
