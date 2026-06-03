// Native charts benchmark engine (Flutter / Qt / React-Native).
//
// Native apps don't expose their FPS to a driver, so each app is instrumented
// to print one `BENCHFPS <n>` line per second to stdout when an env flag is
// set (see each app's launcher). This engine spawns the app, parses those
// lines for framerate, and samples whole-process-tree RSS via `ps`. There is no
// JS heap for native apps and no "recover" phase.
//
// Used by the per-app launchers (bench-FlutterCharts.mjs etc.).

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { treeRssKb } from './lib/proc.mjs';

const execFileP = promisify(execFile);

// Find the RSS (KB) of the first running process whose `ps` command line
// matches `pattern`. Used when the real app process is not the spawned child
// (e.g. an iOS-simulator app launched via `expo run:ios`).
export async function rssByCommand(pattern) {
  try {
    const { stdout } = await execFileP('ps', ['-Axo', 'pid=,rss=,command=']);
    for (const line of stdout.split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (m && pattern.test(m[3])) return Number(m[2]);
    }
  } catch { /* ignore */ }
  return null;
}
import { writeReport } from './lib/report.mjs';
import { printSummary } from './lib/cli.mjs';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function nativeBench(cfg) {
  const {
    app, cmd, args = [], cwd, env = {},
    durationSec = 30, intervalMs = 1000, warmupSec = 5,
    fpsRegex = /BENCHFPS\s+(\d+(?:\.\d+)?)/,
    rssCommandPattern = null, // if set, RSS is read from this process instead of the child tree
    waitForFirstFps = false,  // wait for the first BENCHFPS line before warmup (slow native builds)
    waitTimeoutSec = 300,
    outDir, stamp, verbose = false,
  } = cfg;

  console.log(`[${app}] launching: ${cmd} ${args.join(' ')}`);
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let latestFps = null;
  let exited = false;
  child.on('exit', (code, sig) => { exited = true; if (verbose) console.log(`[${app}] process exited code=${code} sig=${sig}`); });
  child.on('error', (e) => { console.error(`[${app}] spawn error:`, e.message); });

  const onLine = (line) => {
    const m = line.match(fpsRegex);
    if (m) latestFps = Number(m[1]);
    if (verbose && line.trim()) console.log(`  | ${line}`);
  };
  bindLines(child.stdout, onLine);
  bindLines(child.stderr, onLine);

  // Optionally block until the app starts emitting FPS (covers slow native
  // builds / simulator boot before the run window begins).
  if (waitForFirstFps) {
    console.log(`[${app}] waiting for first BENCHFPS (build/boot, up to ${waitTimeoutSec}s)...`);
    const deadline = Date.now() + waitTimeoutSec * 1000;
    while (latestFps == null && !exited && Date.now() < deadline) await sleep(1000);
    if (latestFps == null) {
      console.error(`[${app}] never saw a BENCHFPS line${exited ? ' (process exited)' : ` within ${waitTimeoutSec}s`} — aborting`);
      try { child.kill('SIGKILL'); } catch {}
      process.exit(1);
    }
    console.log(`[${app}] app is live (fps=${latestFps})`);
  }

  // Wait for warmup (and for the app to start emitting FPS).
  console.log(`[${app}] warming up ${warmupSec}s...`);
  await sleep(warmupSec * 1000);
  if (exited) { console.error(`[${app}] process exited during warmup — see output above`); process.exit(1); }

  const samples = [];
  console.log(`[${app}] sampling run phase for ${durationSec}s...`);
  const end = Date.now() + durationSec * 1000;
  while (Date.now() < end && !exited) {
    await sleep(intervalMs);
    const rss = rssCommandPattern
      ? await rssByCommand(rssCommandPattern)
      : await treeRssKb(child.pid);
    samples.push({ t: Date.now(), phase: 'run', fps: latestFps, jsHeapBytes: null, rssKb: rss });
  }

  // Tear down the app.
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* no group */ }
  try { child.kill('SIGTERM'); } catch {}
  await sleep(500);
  try { child.kill('SIGKILL'); } catch {}

  const s = stamp || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const params = { durationSec, recoverSec: 0, intervalMs, warmupSec, recoverable: false };
  const { jsonPath, svgPath, report } = writeReport({ app, params, samples, recoverAtT: null, outDir, stamp: s });
  printSummary(app, report.summary, null);
  if (report.summary.run && report.summary.run.fps.n === 0) {
    console.log(`\n  NOTE: no BENCHFPS lines were parsed — check that the app was built/run with FPS instrumentation enabled.`);
  }
  console.log(`\n  JSON : ${jsonPath}`);
  console.log(`  graph: ${svgPath}\n`);
  return { jsonPath, svgPath, report };
}

function bindLines(stream, onLine) {
  if (!stream) return;
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      onLine(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  });
}
