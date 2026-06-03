// Servo charts benchmark engine.
//
// Mirrors web-bench.mjs (the Chromium/Playwright engine) but drives a real
// Servo browser via its WebDriver server. Servo has no CDP, so two metrics the
// Chromium path collects are unavailable here:
//   - JS heap (CDP Performance.getMetrics) — reported as null.
//   - CDP-forced GC / memory-pressure on RECOVER — not possible.
// By design this engine therefore runs NO recover phase: it samples framerate
// (rAF counter, same meter as the apps display) and whole-process RSS (summed
// over Servo's process tree via `ps`) for the run duration only.
//
// Usage (via bench-JSChartsFastServo.mjs):
//   node bench-JSChartsFastServo.mjs --duration 30 [--interval 1000]

import { spawn } from 'node:child_process';
import { startServer } from './lib/static-server.mjs';
import { treeRssKb } from './lib/proc.mjs';
import { writeReport } from './lib/report.mjs';
import { printSummary } from './lib/cli.mjs';
import { WebDriver, waitForWebDriver } from './lib/webdriver.mjs';

const SERVO_BIN = process.env.SERVO_BIN || '/Applications/Servo.app/Contents/MacOS/servo';
const WEBDRIVER_PORT = Number(process.env.SERVO_WEBDRIVER_PORT || 7055);

// Same rAF FPS meter the Chromium engine injects (kept byte-for-byte identical
// so the two engines' FPS numbers are measured the same way). Injected via
// execute_script after navigation rather than as a Playwright init script.
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

// Switch to the chart frame (the app iframe if present, else the top document),
// run `fn` (a WebDriver.execute call string), and return the result. Returns
// null if the script throws / the frame is gone.
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

export async function servoBench(cfg) {
  const { app, rootDir, base, entry, durationSec, intervalMs, warmupSec, outDir } = cfg;
  if (!rootDir) { console.error('--root <dir> is required'); process.exit(1); }

  const srv = await startServer({ rootDir, urlBase: base });
  const url = srv.url(entry);
  console.log(`[${app}] serving ${rootDir} at ${url}`);

  // Headed Servo on a real display so rendering goes through the GPU
  // compositor (matching the headed Chromium runs). Servo has no
  // --start-maximized; a screen-sized window is the closest equivalent.
  const winSize = process.env.SERVO_WINDOW_SIZE || '1920x1080';
  const servo = spawn(SERVO_BIN, [
    `--webdriver=${WEBDRIVER_PORT}`,
    `--window-size=${winSize}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  servo.on('error', (e) => { console.error(`[${app}] failed to launch Servo (${SERVO_BIN}): ${e.message}`); });
  const servoPid = servo.pid;
  console.log(`[${app}] launched Servo pid ${servoPid} (webdriver :${WEBDRIVER_PORT}, window ${winSize})`);

  let wd;
  try {
    wd = await waitForWebDriver(WEBDRIVER_PORT);
    console.log(`[${app}] servo: headed (on-screen, real compositor); no JS heap / forced GC (no CDP)`);

    await wd.navigate(url);
    // Reset persisted settings, then reload so startup re-reads the cleared store.
    await wd.execute('try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} return null;').catch(() => {});
    await wd.navigate(url);

    console.log(`[${app}] reset settings to defaults; warming up ${warmupSec}s...`);
    await sleep(warmupSec * 1000);

    // Install the rAF meter into the top document and the chart iframe.
    await wd.switchToFrame(null);
    await wd.execute(INIT_SCRIPT).catch(() => {});
    await inChartFrame(wd, INIT_SCRIPT + '\nreturn null;');

    const samples = [];
    let lastByFrame = await readCounter(wd);

    async function sampleOnce(phase) {
      const c = await readCounter(wd);
      let fps = null;
      if (c && lastByFrame && c.now > lastByFrame.now && c.frames >= lastByFrame.frames) {
        fps = (c.frames - lastByFrame.frames) * 1000 / (c.now - lastByFrame.now);
      }
      if (c) lastByFrame = c;
      const rss = await treeRssKb(servoPid);
      // jsHeapBytes is unavailable on Servo (no CDP) — always null.
      samples.push({ t: Date.now(), phase, fps: fps == null ? null : +fps.toFixed(1), jsHeapBytes: null, rssKb: rss });
    }

    console.log(`[${app}] sampling run phase for ${durationSec}s...`);
    const end = Date.now() + durationSec * 1000;
    while (Date.now() < end) {
      await sleep(intervalMs);
      await sampleOnce('run');
    }

    const stamp = cfg.stamp || isoStamp();
    // No recover phase on Servo (see header): recoverSec is forced to 0.
    const params = { durationSec, recoverSec: 0, intervalMs, warmupSec, recoverable: false };
    const { jsonPath, svgPath, report } = writeReport({ app, params, samples, recoverAtT: null, outDir, stamp });
    printSummary(app, report.summary, report.recoverAtSec);
    console.log(`\n  JSON : ${jsonPath}`);
    console.log(`  graph: ${svgPath}\n`);
    return { jsonPath, svgPath, report };
  } finally {
    if (wd) await wd.deleteSession();
    try { servo.kill('SIGTERM'); } catch { /* ignore */ }
    await srv.close();
  }
}

// Read the rAF counter from the chart frame; returns {frames, now} or null.
function readCounter(wd) {
  return inChartFrame(wd,
    'return window.__bench ? { frames: window.__bench.frames, now: performance.now() } : null;');
}

// Reuse the Chromium engine's config resolver, then strip recover (unused here).
export { configFromArgs } from './web-bench.mjs';
