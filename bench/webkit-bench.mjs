// WebKit (WPE/GTK) charts benchmark engine.
//
// Mirrors servo-bench.mjs: drives a real WebKit browser over its WebDriver
// server and injects the SAME rAF FPS meter the Chromium/Servo engines use, so
// the framerate numbers are measured identically across all three engines.
//
// WebKit here is the local GTK build inside the wkdev container (the user's
// `Tools/Scripts/run-minibrowser --release --gtk` build). We launch
// `Tools/Scripts/run-webdriver --release --gtk` *inside* the container via
// `wkdev-enter --exec`; the container uses host networking, so the WebDriver
// port and the host static-file server are mutually reachable on 127.0.0.1.
// WebDriver then launches WebKit's own MiniBrowser, giving us execute_script to
// install the meter and read it back.
//
// Like Servo, there is no CDP here: no JS heap and no RECOVER phase. RSS is the
// whole WebKit process tree, summed by running `ps` inside the container
// (container PIDs are not visible to host `ps`).
//
// Env knobs:
//   WKDEV_CONTAINER        container name           (default: wkdev64)
//   WEBKIT_SOURCE_DIR      WebKit checkout in cont. (default: ~/Development/DebugVersion/OpenSource)
//   WEBKIT_WEBDRIVER_PORT  WebDriver port           (default: 8088)
//   WEBKIT_PORT            gtk | wpe                (default: gtk; reported as "WPE")
//   WEBKIT_CONFIG          release | debug          (default: release)
//
// Usage (via bench-CanvasChartsWebKit.mjs etc.):
//   node bench-CanvasChartsWebKit.mjs --duration 30 [--interval 1000]

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startServer } from './lib/static-server.mjs';
import { writeReport } from './lib/report.mjs';
import { printSummary } from './lib/cli.mjs';
import { WebDriver, waitForWebDriver } from './lib/webdriver.mjs';
import { assertEntryExists } from './web-bench.mjs';

const execFileP = promisify(execFile);

const CONTAINER = process.env.WKDEV_CONTAINER || 'wkdev64';
const SOURCE_DIR = process.env.WEBKIT_SOURCE_DIR
  || `${process.env.HOME}/Development/DebugVersion/OpenSource`;
const WEBDRIVER_PORT = Number(process.env.WEBKIT_WEBDRIVER_PORT || 8088);
const IS_WPE = (process.env.WEBKIT_PORT || 'gtk').toLowerCase() === 'wpe';
const IS_DEBUG = (process.env.WEBKIT_CONFIG || 'release').toLowerCase() === 'debug';
const PORT_FLAG = IS_WPE ? '--wpe' : '--gtk';
const CONFIG_FLAG = IS_DEBUG ? '--debug' : '--release';
const BUILD_PORT = IS_WPE ? 'WPE' : 'GTK';
const BUILD_CONFIG = IS_DEBUG ? 'Debug' : 'Release';
const BROWSER_NAME = IS_WPE ? 'webkitwpe' : 'webkitgtk';
// WebKitWebDriver otherwise launches the *system* MiniBrowser; point it at the
// one in this build so we benchmark the local WebKit, not an installed package.
const MINIBROWSER = `${SOURCE_DIR}/WebKitBuild/${BUILD_PORT}/${BUILD_CONFIG}/bin/MiniBrowser`;

// The WebKit processes whose RSS we sum (matched against `ps comm` in the
// container). WebDriver's bundled browser is MiniBrowser plus its helper procs.
const WEBKIT_PROC_RE = /WebKitWebDriver|MiniBrowser|WebKitWebProcess|WebKitNetworkProcess|WebKitGPUProcess|WPEWebProcess|WPENetworkProcess/;

// Same rAF FPS meter the Chromium/Servo engines inject (kept byte-for-byte
// identical so all engines' FPS are measured the same way).
const INIT_SCRIPT = `
  (() => {
    if (window.__bench) return;
    window.__bench = { frames: 0, start: performance.now() };
    const tick = () => { window.__bench.frames++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })();
`;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function isoStamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }

// Run a command inside the wkdev container, non-interactively. Returns the
// spawned child (caller manages lifetime). DISPLAY/WAYLAND_DISPLAY are inherited
// from this process's environment, so MiniBrowser renders on the same display.
function containerSpawn(shellCmd, opts = {}) {
  return spawn('wkdev-enter', [
    '--name', CONTAINER, '--no-interactive', '--no-tty', '--quiet',
    '--exec', '--', 'bash', '-lc', shellCmd,
  ], { stdio: ['ignore', 'pipe', 'pipe'], detached: true, ...opts });
}

async function containerExec(shellCmd) {
  const { stdout } = await execFileP('wkdev-enter', [
    '--name', CONTAINER, '--no-interactive', '--no-tty', '--quiet',
    '--exec', '--', 'bash', '-lc', shellCmd,
  ]);
  return stdout;
}

// Sum RSS (KB) of every WebKit process inside the container. `ps` runs in the
// container's PID namespace (host `ps` cannot see these processes).
async function containerWebkitRssKb() {
  try {
    const out = await containerExec('ps -eo rss=,comm=');
    let total = 0, matched = 0;
    for (const line of out.split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(.*)$/);
      if (m && WEBKIT_PROC_RE.test(m[2])) { total += Number(m[1]); matched++; }
    }
    return matched ? total : null;
  } catch { return null; }
}

// Switch to the chart frame (the app iframe if present, else the top document),
// run `script`, and return the result. Returns null on error / detached frame.
async function inChartFrame(wd, script) {
  try {
    await wd.switchToFrame(null);
    const hasIframe = await wd.execute(
      'return !!document.querySelector("iframe") && document.querySelectorAll("iframe").length');
    if (hasIframe) await wd.switchToFrame(0);
    const v = await wd.execute(script);
    await wd.switchToFrame(null);
    return v;
  } catch {
    try { await wd.switchToFrame(null); } catch { /* ignore */ }
    return null;
  }
}

function readCounter(wd) {
  return inChartFrame(wd,
    'return window.__bench ? { frames: window.__bench.frames, now: performance.now() } : null;');
}

export async function webkitBench(cfg) {
  const { app, rootDir, base, entry, durationSec, intervalMs, warmupSec, outDir } = cfg;
  if (!rootDir) { console.error('--root <dir> is required'); process.exit(1); }
  assertEntryExists({ app, rootDir, entry });

  const srv = await startServer({ rootDir, urlBase: base });
  const url = srv.url(entry);
  console.log(`[${app}] serving ${rootDir} at ${url}`);

  // Launch WebKitWebDriver inside the container. Host networking makes the port
  // reachable at 127.0.0.1 from this (host) process. `exec` so the WebKit
  // process group is the bash child we can group-kill on teardown.
  const driverCmd = `cd '${SOURCE_DIR}' && exec Tools/Scripts/run-webdriver ${CONFIG_FLAG} ${PORT_FLAG} -p ${WEBDRIVER_PORT} --host 127.0.0.1`;
  console.log(`[${app}] launching WebKitWebDriver in container '${CONTAINER}': ${CONFIG_FLAG} ${PORT_FLAG} :${WEBDRIVER_PORT}`);
  const driver = containerSpawn(driverCmd);
  driver.on('error', (e) => console.error(`[${app}] failed to launch WebKitWebDriver: ${e.message}`));
  driver.stderr.setEncoding('utf8');
  driver.stdout.setEncoding('utf8');
  if (cfg.verbose) {
    driver.stdout.on('data', (d) => process.stdout.write(`  | ${d}`));
    driver.stderr.on('data', (d) => process.stderr.write(`  | ${d}`));
  }

  let wd;
  try {
    // Point the driver at the build's MiniBrowser via <port>:browserOptions.
    // NOTE: do NOT also send browserName — WebKitWebDriver rejects the match
    // ("Failed to match capabilities") when browserName is combined with
    // browserOptions; binary + the default --automation arg is what works.
    const caps = {
      [`${BROWSER_NAME}:browserOptions`]: { binary: MINIBROWSER, args: ['--automation'] },
    };
    wd = await waitForWebDriver(WEBDRIVER_PORT, 60000, caps);
    console.log(`[${app}] webkit: headed (on-screen, real compositor); no JS heap / forced GC (no CDP)`);

    // Maximize so the chart render area matches the maximized Chromium/native
    // runs (best-effort — a no-op without a window manager). NOTE: WebKit only
    // advances requestAnimationFrame when its window is actually composited on
    // a live display; under a virtual/headless display with no compositor the
    // FPS reads 0 (Chromium sidesteps this via throttle-disable launch flags
    // that WebKit does not expose). Run from a real graphical session.
    await wd.maximizeWindow().catch(() => {});

    await wd.navigate(url);
    await wd.execute('try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} return null;').catch(() => {});
    await wd.navigate(url);

    console.log(`[${app}] reset settings to defaults; warming up ${warmupSec}s...`);
    await sleep(warmupSec * 1000);

    await wd.switchToFrame(null);
    await wd.execute(INIT_SCRIPT + '\nreturn null;').catch(() => {});
    await inChartFrame(wd, INIT_SCRIPT + '\nreturn null;');

    const samples = [];
    let last = await readCounter(wd);

    async function sampleOnce(phase) {
      const c = await readCounter(wd);
      let fps = null;
      if (c && last && c.now > last.now && c.frames >= last.frames) {
        fps = (c.frames - last.frames) * 1000 / (c.now - last.now);
      }
      if (c) last = c;
      const rss = await containerWebkitRssKb();
      samples.push({ t: Date.now(), phase, fps: fps == null ? null : +fps.toFixed(1), jsHeapBytes: null, rssKb: rss });
    }

    console.log(`[${app}] sampling run phase for ${durationSec}s...`);
    const end = Date.now() + durationSec * 1000;
    while (Date.now() < end) {
      await sleep(intervalMs);
      await sampleOnce('run');
    }

    const stamp = cfg.stamp || isoStamp();
    const params = { durationSec, recoverSec: 0, intervalMs, warmupSec, recoverable: false };
    const { jsonPath, svgPath, report } = writeReport({ app, params, samples, recoverAtT: null, outDir, stamp });
    printSummary(app, report.summary, report.recoverAtSec);
    console.log(`\n  JSON : ${jsonPath}`);
    console.log(`  graph: ${svgPath}\n`);
    return { jsonPath, svgPath, report };
  } finally {
    if (wd) await wd.deleteSession();
    // Group-kill the host-side wrapper, then sweep any WebKit process the
    // container left behind (the wrapper's group does not span the PID ns).
    try { process.kill(-driver.pid, 'SIGTERM'); } catch { /* no group */ }
    try { driver.kill('SIGTERM'); } catch { /* ignore */ }
    await containerExec('pkill -f WebKitWebDriver; pkill -f MiniBrowser; true').catch(() => {});
    await srv.close();
  }
}

// Reuse the Chromium engine's config resolver (recover is unused here).
export { configFromArgs } from './web-bench.mjs';
