#!/usr/bin/env node
// Run a set of implementations' benchmarks in sequence, sharing one timestamp
// so the JSON/SVG outputs for a session group together in results/.
//
//   node run-all.mjs [--duration 30] [--recover 15] [--interval 1000]
//                    [--only JSChartsFast,WasmCharts] [--skip RNCharts]
//                    [--web-only] [--all]
//
// By default it runs exactly the apps needed for the four comparison groups
// defined in lib/groups.mjs (Chromium-vs-WebKit, Servo-vs-Chromium, native
// showdown, final contenders) and, at the end, writes a SEPARATE pair of chart
// files per group — one for framerate, one for memory.
//
// Engines:
//   - Chromium web apps run via Playwright (web-bench.mjs).
//   - *WebKit apps run in the local GTK build inside the wkdev container, over
//     WebDriver (webkit-bench.mjs). Needs a display + the container up.
//   - JSChartsFastServo runs in a real Servo browser (servo-bench.mjs).
//   - Native apps (Flutter / Qt / Slint) are spawned directly (native-bench.mjs)
//     and must be built first — see README.md.
// Each app is its own launcher process, so one failure doesn't abort the rest.
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { parseArgs } from './lib/cli.mjs';
import { writeCombined } from './lib/combined.mjs';
import { DEFAULT_GROUPS, appsForGroups } from './lib/groups.mjs';
import { writeGroupCharts } from './lib/group-charts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  console.log(`Usage: node run-all.mjs [options]

  Selection (default: the comparison-group apps; see lib/groups.mjs):
    --all                 run the full catalogue (web + native)
    --web-only            run only the web apps
    --only A,B,C          run exactly these apps (comma-separated)
    --skip A,B            drop these apps from the selection

  Forwarded to each per-app benchmark:
    --duration <sec>      run-phase length (default 30)
    --recover <sec>       extra window after RECOVER (web w/ CDP only; default 15)
    --interval <ms>       sample period (default 1000)
    --warmup <sec>        warmup before sampling
    --out <dir>           output directory (default ./results)
    --verbose             echo per-app launcher output (native/WebKit/Servo)
    --headless            run Chromium web apps off-screen (numbers not representative)
    --low-memory          launch Chromium with site isolation off (+ process-per-site)
    --multi-renderer      DON'T cap Chromium renderers (default is one, embedded-style)
    --no-mini-vm          DON'T run WebKit JSC in mini-VM mode (default: on, embedded-style)
    --ram-budget <MB>     simulate a device with this much RAM: cap V8 (Chromium)
                          and JSC (WebKit) JS heaps to the same budget

  Embedded defaults: Chromium runs single-renderer, WebKit runs JSC mini-VM mode.
  Every run records RSS, PSS and USS; each group gets a separate memory chart per
  metric (RSS is the headline for embedded — real resident pressure on a device).

  Other:
    --stamp <name>        session stamp used in all output filenames
    -h, --help            show this help`);
  process.exit(0);
}

// Full catalogue, used only when --all / --web-only are requested. The default
// run is driven by the comparison groups (see below), NOT this list — the slow
// QTCharts, JSChartsSimple, JSChartsNoLeaks and RNCharts are intentionally not
// run by default.
const WEB = ['CanvasCharts', 'CanvasChartsWebKit', 'JSChartsFast', 'JSChartsFastWebKit',
  'JSChartsFastServo', 'JSChartsFastServoChromium', 'JSChartsNoLeaks',
  'WasmCharts', 'WasmChartsWebKit', 'JSChartsSimple'];
const NATIVE = ['FlutterCharts', 'QTCharts', 'QTChartsFast', 'RNCharts', 'SlintCharts'];

// Default: the union of the comparison groups' members (de-duplicated). Each
// app runs once even when it appears in several groups.
let apps = appsForGroups(DEFAULT_GROUPS);
if (args.all) apps = [...WEB, ...NATIVE];
else if (args.webOnly || args['web-only']) apps = WEB;
if (args.only) apps = String(args.only).split(',').map((s) => s.trim());
if (args.skip) { const skip = new Set(String(args.skip).split(',').map((s) => s.trim())); apps = apps.filter((a) => !skip.has(a)); }

const stamp = args.stamp || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const passthrough = [];
// Value flags: forwarded as `--flag value` (skip if given with no value).
for (const k of ['duration', 'recover', 'interval', 'warmup', 'out', 'ram-budget']) {
  if (args[k] !== undefined && args[k] !== true) passthrough.push('--' + k, String(args[k]));
}
// Boolean flags: forwarded bare, so the child sees `--verbose` not `--verbose true`.
for (const k of ['verbose', 'headless', 'low-memory', 'single-renderer', 'multi-renderer', 'no-mini-vm']) {
  if (args[k] === true || args[k] === 'true') passthrough.push('--' + k);
}

// Keep the screen/session awake for the (potentially long) run. Best-effort:
// spawn a blocking inhibitor that lives for the whole run and is killed at the
// end. systemd-inhibit is the most portable; gnome-session-inhibit is a
// fallback. A missing tool is not fatal.
function startIdleInhibitor() {
  const candidates = [
    ['systemd-inhibit', ['--what=idle:sleep:handle-lid-switch', '--who=charts-bench',
      '--why=running charts benchmarks', '--mode=block', 'sleep', 'infinity']],
    ['gnome-session-inhibit', ['--inhibit', 'idle:suspend', '--inhibit-only',
      '--reason', 'running charts benchmarks'].concat(['sleep', 'infinity'])],
  ];
  for (const [cmd, a] of candidates) {
    const probe = spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' });
    if (probe.status !== 0) continue;
    const child = spawn(cmd, a, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    console.log(`Idle inhibitor: ${cmd} (screen kept awake for the run)`);
    return child;
  }
  console.log('Idle inhibitor: none available (screen may sleep during long runs)');
  return null;
}

function runOne(app) {
  return new Promise((resolve) => {
    const launcher = path.join(here, `bench-${app}.mjs`);
    if (!fs.existsSync(launcher)) {
      console.error(`[${app}] no launcher (bench-${app}.mjs) — skipping`);
      return resolve();
    }
    console.log(`\n${'#'.repeat(70)}\n# ${app}\n${'#'.repeat(70)}`);
    const child = spawn(process.execPath, [launcher, ...passthrough, '--stamp', stamp], { stdio: 'inherit' });
    child.on('exit', (code) => { if (code) console.error(`[${app}] exited with code ${code}`); resolve(); });
    child.on('error', (e) => { console.error(`[${app}] failed to start: ${e.message}`); resolve(); });
  });
}

const inhibitor = startIdleInhibitor();
function stopInhibitor() { if (inhibitor) { try { inhibitor.kill('SIGTERM'); } catch {} } }
process.on('SIGINT', () => { stopInhibitor(); process.exit(130); });

try {
  for (const app of apps) await runOne(app);
} finally {
  stopInhibitor();
}

// Collect this session's per-app reports.
const resultsDir = path.join(here, 'results');
const reports = [];
const reportsByApp = new Map();
for (const app of apps) {
  const f = path.join(resultsDir, `${app}-${stamp}.json`);
  if (fs.existsSync(f)) {
    try { const r = JSON.parse(fs.readFileSync(f, 'utf8')); reports.push(r); reportsByApp.set(app, r); }
    catch { /* skip unreadable */ }
  }
}

// Per-group chart files (framerate + memory each), the primary output.
if (reportsByApp.size) {
  console.log('\nGroup comparison charts:');
  const written = writeGroupCharts({ reportsByApp, groups: DEFAULT_GROUPS, outDir: resultsDir, stamp });
  for (const f of written) console.log(`  ${f}`);
}

// An overall combined graph across everything that ran (handy at a glance).
if (reports.length >= 1) {
  const { svgPath, jsonPath } = writeCombined({ reports, outDir: resultsDir, stamp });
  console.log(`\nCombined comparison graph: ${svgPath}`);
  console.log(`Combined summary JSON     : ${jsonPath}`);
} else {
  console.log(`\n(No reports produced — skipping combined graph.)`);
}
console.log(`\nAll done. Results in ${resultsDir} (session ${stamp}).`);
