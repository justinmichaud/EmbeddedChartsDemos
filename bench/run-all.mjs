#!/usr/bin/env node
// Run every implementation's benchmark in sequence, sharing one timestamp so
// the JSON/SVG outputs for a session group together in results/.
//
//   node run-all.mjs [--duration 30] [--recover 15] [--interval 1000]
//                    [--only JSChartsFast,WasmCharts] [--skip RNCharts] [--web-only]
//
// Native apps (FlutterCharts, QTCharts, QTChartsFast, RNCharts) must be built
// first — see README.md. Each is spawned as its own launcher process so one
// failure doesn't abort the rest.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { parseArgs } from './lib/cli.mjs';
import { writeCombined } from './lib/combined.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const WEB = ['CanvasCharts', 'JSChartsFast', 'JSChartsFastServo', 'JSChartsNoLeaks', 'WasmCharts', 'JSChartsSimple'];
const NATIVE = ['FlutterCharts', 'QTCharts', 'QTChartsFast', 'RNCharts'];

let apps = args.webOnly || args['web-only'] ? WEB : [...WEB, ...NATIVE];
if (args.only) apps = String(args.only).split(',').map((s) => s.trim());
if (args.skip) { const skip = new Set(String(args.skip).split(',').map((s) => s.trim())); apps = apps.filter((a) => !skip.has(a)); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const passthrough = [];
for (const k of ['duration', 'recover', 'interval', 'warmup', 'verbose', 'headless']) {
  if (args[k] !== undefined) passthrough.push('--' + k, String(args[k]));
}

function runOne(app) {
  return new Promise((resolve) => {
    const launcher = path.join(here, `bench-${app}.mjs`);
    console.log(`\n${'#'.repeat(70)}\n# ${app}\n${'#'.repeat(70)}`);
    const child = spawn(process.execPath, [launcher, ...passthrough, '--stamp', stamp], { stdio: 'inherit' });
    child.on('exit', (code) => { if (code) console.error(`[${app}] exited with code ${code}`); resolve(); });
    child.on('error', (e) => { console.error(`[${app}] failed to start: ${e.message}`); resolve(); });
  });
}

for (const app of apps) await runOne(app);

// Build the combined comparison graph from this session's per-app reports,
// ordered the way the apps were run.
const resultsDir = path.join(here, 'results');
const reports = [];
for (const app of apps) {
  const f = path.join(resultsDir, `${app}-${stamp}.json`);
  if (fs.existsSync(f)) {
    try { reports.push(JSON.parse(fs.readFileSync(f, 'utf8'))); }
    catch { /* skip unreadable */ }
  }
}
if (reports.length >= 1) {
  const { svgPath, jsonPath } = writeCombined({ reports, outDir: resultsDir, stamp });
  console.log(`\nCombined comparison graph: ${svgPath}`);
  console.log(`Combined summary JSON     : ${jsonPath}`);
} else {
  console.log(`\n(No reports produced — skipping combined graph.)`);
}
console.log(`\nAll done. Results in ${resultsDir} (session ${stamp}).`);
