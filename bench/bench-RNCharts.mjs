#!/usr/bin/env node
// Benchmark launcher for RNCharts (React Native / Expo, iOS simulator).
//
// This builds (incrementally) and launches the app in the iOS simulator via
// `expo run:ios`, then reads framerate from the Metro console (the MenuBar
// logs one `BENCHFPS <n>` line/sec when EXPO_PUBLIC_BENCH_FPS=1). Memory (RSS)
// is read from the simulator app process, not the expo/Metro node process.
//
// Prereq: Xcode + iOS simulator, and `npm install` already run in RNCharts.
// The first build can take several minutes; the harness waits for the app to
// come up before it starts the timed run.
//
//   node bench-RNCharts.mjs --duration 30 [--interval 1000] [--warmup 5] [--verbose]
import { nativeBench } from './native-bench.mjs';
import { parseArgs, num } from './lib/cli.mjs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const rnDir = path.resolve(here, '../RNCharts');
const args = parseArgs(process.argv.slice(2));

nativeBench({
  app: 'RNCharts',
  cmd: 'npx',
  args: ['expo', 'run:ios'],
  cwd: rnDir,
  env: { EXPO_PUBLIC_BENCH_FPS: '1', EXPO_PUBLIC_BENCH_RESET: '1', CI: '1' },
  // The simulator app process is "<...>/RNCharts.app/RNCharts"; match that so
  // RSS is the app's, not Metro's.
  rssCommandPattern: /\/RNCharts\.app\/RNCharts/,
  waitForFirstFps: true,
  waitTimeoutSec: num(args.buildTimeout, 600),
  durationSec: num(args.duration, 30),
  intervalMs: num(args.interval, 1000),
  warmupSec: num(args.warmup, 5),
  outDir: args.out || path.join(here, 'results'),
  stamp: args.stamp,
  verbose: !!args.verbose,
}).catch((e) => { console.error(e); process.exit(1); });
