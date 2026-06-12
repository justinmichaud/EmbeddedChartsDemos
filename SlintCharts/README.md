# Slint Charts Demo

A [Slint](https://slint.dev) (Rust) port of the stock-chart viewer in
[`../CanvasCharts`](../CanvasCharts). It joins the Qt and Flutter ports as a
native point of comparison against the web stacks, rendering the same synthetic
5 Hz market-data feed.

## Architecture

| Web version (`CanvasCharts/`)        | Slint version (this folder)                          |
| ------------------------------------ | ---------------------------------------------------- |
| `src/worker.ts` (Web Worker)         | `src/sim.rs` — `Engine` driven by a `slint::Timer`   |
| `src/render/chart.ts` (Canvas2D)     | curves pre-computed in Rust, drawn by Slint `Path`   |
| `src/iframe-main.ts` (DOM)           | `ui/app.slint` — declarative scene graph             |
| `localStorage`                       | `~/.config/EmbeddedDemos/SlintCharts.conf`           |
| `postMessage`                        | shared `Rc<RefCell<State>>` + property bindings      |

The data layout is intentionally identical to the other demos: 50 stocks
(configurable), pre-allocated ring buffers of 60 samples per stock for
mid/bid/ask, the **same** xorshift128 PRNG and seed, the same initial prices and
symbols, the same news-feed cycle, and the same 10 s sweep overlay. Because the
PRNG and random-walk math match `worker.ts` exactly, this demo plots the very
same series the web/Qt/Flutter demos do.

### How the charts are drawn

The hot per-stock work happens in Rust (`src/main.rs::paths`): each series is
projected into a `0..100` view box and turned into an SVG path-command string
using monotone-cubic interpolation (Fritsch–Carlson, the same `curveMonotoneX`
formula the Canvas demo uses). Those strings are handed to the UI as a model of
`StockCardData`, and Slint's built-in `Path` element renders them, scaling the
view box to each card. The simulation updates the model at 5 Hz; the renderer
free-runs (a binding on `animation-tick()` keeps it drawing every frame) so the
measured framerate reflects real draw throughput.

## Requirements

- **Rust**: stable toolchain (tested with 1.96).
- **OS**: Linux (X11 or Wayland), macOS, or Windows. Slint's default
  `winit` + `femtovg` (OpenGL) backend is used.
- On Linux you need the usual GL/X11/Wayland dev libraries that Slint's
  dependencies pull in (mesa, libxkbcommon, fontconfig, …).

## Build & run

```bash
cd SlintCharts
cargo build --release
./target/release/slintcharts
```

A debug build (`cargo run`) works too but is far slower — femtovg path
tessellation is dramatically faster with optimizations, so always benchmark the
`--release` binary.

### Environment flags (used by the benchmark)

| Var          | Effect                                                              |
| ------------ | ------------------------------------------------------------------- |
| `BENCH_FPS=1`   | Emit one `BENCHFPS <n>` line per second to stdout.               |
| `BENCH_RESET=1` | Clear persisted settings on startup, so the run uses defaults.  |

### Controls

- **CCY** — cycle the display currency (persisted).
- **SETTINGS** — choose how many charts to show (8 / 20 / 30 / 50, persisted).
- **LAG** — toggle an artificial busy-loop in the data tick, to see how the UI
  behaves when the producer stalls (matches the other demos' `TOGGLE_LAG`).

## Benchmarking

Hooked into the shared harness in [`../bench`](../bench):

```bash
cd ../bench
node bench-SlintCharts.mjs --duration 30        # just this demo
node run-all.mjs --only SlintCharts             # via the orchestrator
```

`bench-SlintCharts.mjs` discovers `target/release/slintcharts`, spawns it with
`BENCH_FPS=1 BENCH_RESET=1`, parses the `BENCHFPS` lines for framerate, and
samples process RSS. Results (JSON + SVG) land in `bench/results/`.

> **Display backend.** Runs on Wayland or X11 (Slint's `winit` backend picks
> automatically). FPS is measured from the renderer's per-frame callback, so it
> only reflects reality when the window is actually being composited: a desktop
> compositor (e.g. GNOME/Mutter) stops sending frame callbacks to an obscured
> window or an idle session, which reads as ~0 fps. Keep the window visible on
> an active session — or run under a dedicated server like Xvfb — for stable
> numbers. This is a property of the environment and applies to every native
> windowed demo, not just this one.
