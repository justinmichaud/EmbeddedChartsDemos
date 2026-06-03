#!/usr/bin/env node
// Benchmark launcher for QTCharts (native Qt6/QML app).
//
// Prereq: build once with FPS instrumentation (gated on BENCH_FPS=1 below):
//   cd QTCharts && PATH="$(brew --prefix qt)/bin:$PATH" qt-cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j4
//
//   node bench-QTCharts.mjs --duration 30 [--interval 1000] [--warmup 5] [--verbose]
import { nativeBench } from './native-bench.mjs';
import { parseArgs, num } from './lib/cli.mjs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(here, '../QTCharts/build');
const args = parseArgs(process.argv.slice(2));

// Discover the built .app bundle executable.
let bin = null;
if (fs.existsSync(buildDir)) {
  for (const e of fs.readdirSync(buildDir)) {
    if (e.endsWith('.app')) {
      const exeDir = path.join(buildDir, e, 'Contents/MacOS');
      if (fs.existsSync(exeDir)) {
        const exe = fs.readdirSync(exeDir)[0];
        if (exe) bin = path.join(exeDir, exe);
      }
    }
  }
}
if (!bin) {
  console.error('QTCharts build not found. Build it first:\n  cd QTCharts && PATH="$(brew --prefix qt)/bin:$PATH" qt-cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j4');
  process.exit(1);
}

nativeBench({
  app: 'QTCharts',
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
