// Web charts benchmark engine.
//
// Serves a built web-charts app, drives it in a real Chromium via Playwright,
// and samples framerate + memory over time. Framerate is measured with a
// requestAnimationFrame counter injected into *every* frame (the same method
// the apps themselves use to display FPS); the effective FPS for a sample is
// the minimum across live frames (the bottleneck the user actually sees).
// Memory is captured two ways: per-renderer JS heap (CDP Performance metrics)
// and whole-browser RSS (summed over the Chromium process tree, via `ps`).
//
// At the end, for apps that support it, the "RECOVER" action is triggered and
// an additional window of data is collected.
//
// Usage:
//   node web-bench.mjs --app JSChartsFast --root <dir> --base /EmbeddedChartsDemos/ \
//        --entry index.html --recoverable true --duration 30 --recover 15 \
//        [--interval 1000] [--headed] [--out results]

import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { startServer } from './lib/static-server.mjs';
import { treeRssKb } from './lib/proc.mjs';
import { writeReport } from './lib/report.mjs';
import { parseArgs, num, printSummary } from './lib/cli.mjs';

// Fail fast with an actionable message if the app's dist/ is missing or empty.
// Otherwise the static server just 404s on index.html mid-run and the failure
// looks like a wrong URL/prefix rather than "you forgot to build the app".
export function assertEntryExists({ app, rootDir, entry }) {
  const f = path.join(rootDir, entry);
  if (!fs.existsSync(f)) {
    console.error(`[${app}] build not found: ${f}`);
    console.error(`  The app's dist/ is missing or empty — build it first (e.g. \`pnpm build\` in the app directory), then re-run.`);
    process.exit(1);
  }
}

// rAF FPS meter installed into every frame/document (survives iframe recreation).
const INIT_SCRIPT = `
  (() => {
    if (window.__bench) return;
    window.__bench = { frames: 0, start: performance.now() };
    const tick = () => { window.__bench.frames++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })();
`;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Race a promise against a timeout so a wedged renderer (e.g. mid-GC, or
// briefly stalled by a memory-pressure signal) can never hang the whole
// benchmark — at worst we drop one sample and carry on.
function withTimeout(promise, ms, fallback = null) {
  let timer;
  const t = new Promise((r) => { timer = setTimeout(() => r(fallback), ms); });
  return Promise.race([promise.finally(() => clearTimeout(timer)), t]);
}

// The frame(s) that actually render charts: the app iframe if present
// (JSChartsFast family, CanvasCharts), otherwise the main frame (WasmCharts,
// JSChartsSimple). Frame objects are stable identities until they navigate or
// detach, so we key the rAF counters by the Frame object itself — this makes
// recover (which destroys and recreates the iframe) handle cleanly.
function chartFrames(page) {
  const iframes = page.frames().filter((f) => f.url().includes('iframe.html'));
  return iframes.length ? iframes : [page.mainFrame()];
}

// Read the rAF counter from each chart frame; returns Map<Frame, {frames, now}>.
async function readFrameCounters(page) {
  const out = new Map();
  for (const frame of chartFrames(page)) {
    try {
      const v = await withTimeout(frame.evaluate(() => window.__bench
        ? { frames: window.__bench.frames, now: performance.now() } : null), 2000);
      if (v) out.set(frame, v);
    } catch { /* frame navigating/detached */ }
  }
  return out;
}

async function jsHeapBytes(cdp) {
  try {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const m = metrics.find((x) => x.name === 'JSHeapUsedSize');
    return m ? m.value : null;
  } catch { return null; }
}

// Resolve a runtime config from per-app defaults overridden by CLI args.
export function configFromArgs(defaults = {}) {
  const args = parseArgs(process.argv.slice(2));
  const recoverable = (args.recoverable ?? defaults.recoverable) === true
    || (args.recoverable ?? defaults.recoverable) === 'true';
  // Graphical benchmarks run on a real display by default (headless Chromium
  // does not use the GPU compositor, so its framerate is not representative).
  // Pass --headless to opt into an off-screen run for unattended/CI use.
  const headless = args.headless === true || args.headless === 'true';
  return {
    app: args.app || defaults.app || 'web-app',
    rootDir: args.root || defaults.rootDir,
    base: args.base || defaults.base || '/',
    entry: args.entry || defaults.entry || 'index.html',
    recoverable,
    durationSec: num(args.duration, defaults.durationSec ?? 30),
    recoverSec: num(args.recover, defaults.recoverSec ?? (recoverable ? 15 : 0)),
    intervalMs: num(args.interval, defaults.intervalMs ?? 1000),
    warmupSec: num(args.warmup, defaults.warmupSec ?? 3),
    headless,
    outDir: args.out || defaults.outDir || new URL('./results', import.meta.url).pathname,
    stamp: args.stamp || defaults.stamp,
  };
}

export async function webBench(cfg) {
  const { app, rootDir, base, entry, recoverable, durationSec, recoverSec, intervalMs, warmupSec, outDir } = cfg;

  if (!rootDir) { console.error('--root <dir> is required'); process.exit(1); }
  assertEntryExists({ app, rootDir, entry });

  const srv = await startServer({ rootDir, urlBase: base });
  const url = srv.url(entry);
  console.log(`[${app}] serving ${rootDir} at ${url}`);

  // launchServer (vs launch) so we can read the browser process PID for RSS.
  // Headed by default so rendering goes through the real GPU compositor.
  // The throttling flags keep requestAnimationFrame running at the display rate
  // even when the window is occluded/unfocused — otherwise FPS collapses to ~0
  // as soon as the benchmark window loses focus, which would not reflect the
  // app's real performance.
  // Maximize the window so the chart render area matches the maximized native
  // demos (Qt/Flutter) — every implementation then renders the same screen-sized
  // area and the FPS/memory numbers are comparable. Headed uses --start-maximized
  // (the real OS maximize); headless has no window manager, so we pick an
  // explicit screen-sized window instead.
  const server = await chromium.launchServer({
    headless: cfg.headless,
    args: cfg.headless ? ['--window-size=1920,1080'] : [
      '--start-maximized',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
  console.log(`[${app}] chromium: ${cfg.headless ? 'headless (off-screen)' : 'headed (on-screen, real compositor)'}`);
  const browserPid = server.process()?.pid;
  const browser = await chromium.connect(server.wsEndpoint());
  // viewport: null lets the page fill the actual (maximized) window rather than
  // being clamped to a fixed size.
  const ctx = await browser.newContext({ viewport: null });
  await ctx.addInitScript(INIT_SCRIPT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable').catch(() => {});

  await page.goto(url, { waitUntil: 'load' });
  // Reset persisted settings (localStorage) so the run starts from the app's
  // defaults, then reload so startup re-reads the cleared store. (The context
  // is already ephemeral, but this also covers headed runs on a real profile.)
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} }).catch(() => {});
  await page.goto(url, { waitUntil: 'load' });
  console.log(`[${app}] reset settings to defaults; warming up ${warmupSec}s...`);
  await sleep(warmupSec * 1000);

  const samples = [];
  let lastByFrame = await readFrameCounters(page);

  async function sampleOnce(phase) {
    const counters = await readFrameCounters(page);
    // FPS per chart frame = delta frames / delta seconds since last read for
    // that exact frame. The effective FPS is the min across chart frames (the
    // visible bottleneck). A freshly created frame has no prior reading and is
    // skipped for this sample.
    let minFps = null;
    for (const [frame, c] of counters) {
      const prev = lastByFrame.get(frame);
      if (prev && c.now > prev.now && c.frames >= prev.frames) {
        const fps = (c.frames - prev.frames) * 1000 / (c.now - prev.now);
        if (minFps == null || fps < minFps) minFps = fps;
      }
    }
    lastByFrame = counters;
    const [heap, rss] = await Promise.all([jsHeapBytes(cdp), treeRssKb(browserPid)]);
    samples.push({ t: Date.now(), phase, fps: minFps == null ? null : +minFps.toFixed(1), jsHeapBytes: heap, rssKb: rss });
  }

  // ---- run phase ----
  console.log(`[${app}] sampling run phase for ${durationSec}s...`);
  await sampleLoop(durationSec, intervalMs, () => sampleOnce('run'));

  // ---- recover ----
  let recoverAtT = null;
  if (recoverable && recoverSec > 0) {
    console.log(`[${app}] triggering RECOVER...`);
    recoverAtT = Date.now();
    await triggerRecover(page);
    await sleep(800); // let the iframe be torn down + recreated
    await applyMemoryPressure(cdp, app);
    lastByFrame = await readFrameCounters(page);
    console.log(`[${app}] sampling recover phase for ${recoverSec}s...`);
    await sampleLoop(recoverSec, intervalMs, () => sampleOnce('recover'));
  } else if (recoverSec > 0) {
    console.log(`[${app}] no RECOVER support; collecting ${recoverSec}s extra as 'recover' phase anyway`);
    recoverAtT = Date.now();
    await applyMemoryPressure(cdp, app);
    await sampleLoop(recoverSec, intervalMs, () => sampleOnce('recover'));
  }

  await browser.close();
  await server.close();
  await srv.close();

  const stamp = cfg.stamp || isoStamp();
  const params = { durationSec, recoverSec, intervalMs, warmupSec, recoverable };
  const { jsonPath, svgPath, report } = writeReport({ app, params, samples, recoverAtT, outDir, stamp });
  printSummary(app, report.summary, report.recoverAtSec);
  console.log(`\n  JSON : ${jsonPath}`);
  console.log(`  graph: ${svgPath}\n`);
  return { jsonPath, svgPath, report };
}

// Sample at the END of each interval so every sample covers a full window of
// frames since the previous reading (the first sample of a phase otherwise has
// a near-zero window right after priming and reports a spurious 0 fps).
async function sampleLoop(durationSec, intervalMs, fn) {
  const end = Date.now() + durationSec * 1000;
  while (Date.now() < end) {
    await sleep(intervalMs);
    await fn();
  }
}

// Send RECOVER the way the in-app button does: a postMessage from the iframe to
// its parent. We run it in whichever frame is the app iframe; falling back to
// the main frame.
async function triggerRecover(page) {
  for (const frame of page.frames()) {
    try {
      const did = await frame.evaluate(() => {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'RECOVER' }, '*');
          return true;
        }
        return false;
      });
      if (did) return;
    } catch { /* ignore */ }
  }
}

// After RECOVER, give the browser a chance to actually release the memory the
// app just dropped, so the recover-phase samples reflect true reclaimed memory
// rather than retained-but-collectable garbage. We drive Chromium's own knobs
// over CDP (no special launch flags needed). Each step is timeout-guarded and
// best-effort: an unsupported method or a briefly-stalled renderer is tolerated
// rather than allowed to wedge the run.
//
//   - HeapProfiler.collectGarbage          full V8 GC in the renderer
//   - Memory.simulatePressureNotification  signal critical pressure so caches
//                                            (image decode, fonts, V8) are shed
//
// Two CDP knobs are deliberately avoided because they freeze the app on recover:
//   - HeapProfiler.enable is NOT sent (collectGarbage does not require it). It
//     turns on per-allocation heap tracking, whose overhead wedges this
//     allocation-heavy app to ~0 fps for the whole phase.
//   - Memory.forciblyPurgeJavaScriptMemory is not used: its synchronous blocking
//     purge produces the same visible stall.
// The GC + pressure-notification pair frees the same memory (RSS drops ~50 MB on
// recover here) while the app keeps rendering at ~60 fps.
async function applyMemoryPressure(cdp, app) {
  const steps = [
    ['HeapProfiler.collectGarbage', undefined],
    ['Memory.simulatePressureNotification', { level: 'critical' }],
  ];
  const done = [];
  for (const [method, params] of steps) {
    const ok = await withTimeout(
      cdp.send(method, params).then(() => true, () => false), 3000, false);
    if (ok) done.push(method.split('.')[1]);
  }
  console.log(`[${app}] memory pressure: ${done.length ? done.join(', ') : '(none supported)'}`);
}

function isoStamp() {
  // Avoids Date in workflow contexts; here we are a normal node process.
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// Direct CLI invocation: `node web-bench.mjs --app X --root <dir> ...`
if (import.meta.url === `file://${process.argv[1]}`) {
  webBench(configFromArgs()).catch((e) => { console.error(e); process.exit(1); });
}
