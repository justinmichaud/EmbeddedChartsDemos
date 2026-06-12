#!/usr/bin/env node
// Benchmark launcher for FlutterCharts (native desktop app, macOS or Linux).
//
// Prereq: build the profile binary once with FPS instrumentation (the FPS
// emitter is gated on the BENCH_FPS=1 env var this launcher sets):
//   macOS:  cd FlutterCharts && flutter build macos --profile
//   Linux:  cd FlutterCharts && flutter build linux --profile
//
//   node bench-FlutterCharts.mjs --duration 30 [--interval 1000] [--warmup 5] [--verbose]
import { nativeBench } from './native-bench.mjs';
import { parseArgs, num } from './lib/cli.mjs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const args = parseArgs(process.argv.slice(2));

// Find the built profile executable. macOS produces a .app bundle; Linux
// produces build/linux/<arch>/profile/bundle/<binary_name> (binary name is
// "fluttercharts", from FlutterCharts/linux/CMakeLists.txt).
let bin = null;
if (process.platform === 'darwin') {
  const productsDir = path.join(repo, 'FlutterCharts/build/macos/Build/Products/Profile');
  if (fs.existsSync(productsDir)) {
    for (const e of fs.readdirSync(productsDir)) {
      if (e.endsWith('.app')) {
        const exeDir = path.join(productsDir, e, 'Contents/MacOS');
        if (fs.existsSync(exeDir)) {
          const exe = fs.readdirSync(exeDir)[0];
          if (exe) bin = path.join(exeDir, exe);
        }
      }
    }
  }
} else {
  // Linux: try profile, then release, across whatever arch dir exists.
  const linuxRoot = path.join(repo, 'FlutterCharts/build/linux');
  outer:
  for (const arch of fs.existsSync(linuxRoot) ? fs.readdirSync(linuxRoot) : []) {
    for (const flavor of ['profile', 'release', 'debug']) {
      const cand = path.join(linuxRoot, arch, flavor, 'bundle', 'fluttercharts');
      if (fs.existsSync(cand)) { bin = cand; break outer; }
    }
  }
}
if (!bin) {
  const cmd = process.platform === 'darwin'
    ? 'cd FlutterCharts && flutter build macos --profile'
    : 'cd FlutterCharts && flutter build linux --profile';
  console.error(`FlutterCharts profile build not found. Build it first:\n  ${cmd}`);
  process.exit(1);
}

// Reset persisted settings so the run uses the app defaults (best-effort;
// shared_preferences lives in a platform-specific location).
const settingsFile = process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library/Application Support/FlutterCharts/settings.json')
  : path.join(os.homedir(), '.local/share/FlutterCharts/settings.json');
try {
  if (fs.existsSync(settingsFile)) { fs.rmSync(settingsFile, { force: true }); console.log(`[FlutterCharts] reset settings (removed ${settingsFile})`); }
  else { console.log('[FlutterCharts] no saved settings to reset (using defaults)'); }
} catch (e) { console.warn(`[FlutterCharts] could not reset settings: ${e.message}`); }

nativeBench({
  app: 'FlutterCharts',
  cmd: bin,
  args: [],
  cwd: path.dirname(bin),
  env: { BENCH_FPS: '1' },
  durationSec: num(args.duration, 30),
  intervalMs: num(args.interval, 1000),
  warmupSec: num(args.warmup, 5),
  outDir: args.out || path.join(here, 'results'),
  stamp: args.stamp,
  verbose: !!args.verbose,
}).catch((e) => { console.error(e); process.exit(1); });
