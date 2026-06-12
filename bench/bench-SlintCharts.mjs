#!/usr/bin/env node
// Benchmark launcher for SlintCharts (native Slint/Rust app).
//
// Prereq: build the optimized binary once (the FPS emitter is gated on the
// BENCH_FPS=1 env var this launcher sets):
//   cd SlintCharts && cargo build --release
//
//   node bench-SlintCharts.mjs --duration 30 [--interval 1000] [--warmup 5] [--verbose]
import { nativeBench } from './native-bench.mjs';
import { parseArgs, num } from './lib/cli.mjs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const args = parseArgs(process.argv.slice(2));

// The release binary (plain executable on Linux; .exe on Windows).
const candidates = [
  path.join(repo, 'SlintCharts/target/release/slintcharts'),
  path.join(repo, 'SlintCharts/target/release/slintcharts.exe'),
];
const bin = candidates.find((p) => fs.existsSync(p));
if (!bin) {
  console.error('SlintCharts release build not found. Build it first:\n  cd SlintCharts && cargo build --release');
  process.exit(1);
}

// Runs on whatever the native backend selects (Wayland or X11). BENCH_FPS=1
// makes the app emit one BENCHFPS line per rendered second; BENCH_RESET=1
// clears persisted settings so the run uses the 50-chart default.
//
// Measuring framerate requires the window to actually be composited: a desktop
// compositor (e.g. GNOME/Mutter) stops delivering frame callbacks to obscured
// windows and to an idle session, which reads as ~0 fps. Keep the window
// visible on an active session — or run under a dedicated server such as Xvfb
// — for stable numbers. (This applies to every native windowed demo here.)
nativeBench({
  app: 'SlintCharts',
  cmd: bin,
  args: [],
  cwd: path.dirname(bin),
  env: { BENCH_FPS: '1', BENCH_RESET: '1' },
  durationSec: num(args.duration, 30),
  intervalMs: num(args.interval, 1000),
  warmupSec: num(args.warmup, 5),
  outDir: args.out || path.join(here, 'results'),
  stamp: args.stamp,
  verbose: !!args.verbose,
}).catch((e) => { console.error(e); process.exit(1); });
