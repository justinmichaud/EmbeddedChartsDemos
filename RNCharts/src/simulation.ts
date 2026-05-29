// Direct port of JSChartsFast's worker.ts, minus the Web Worker / postMessage
// shell. In RN there is no worker or iframe: the simulation runs on the JS
// thread with setInterval, mutating module-level typed arrays in place, and
// notifies React via a single listener set (see store.ts). Skia draws on the
// native/UI side, so the JS thread is free for this 5 Hz loop.

export const REFRESH_RATE = 200; // ms between ticks (5 Hz)
const NEWS_RATE = 10000; // ms between news index advances
const SWEEP_PERIOD_MS = 10_000;
const SWEEP_STEP = REFRESH_RATE / SWEEP_PERIOD_MS;
export const HISTORY_LEN = 60;
export const MAX_STOCKS = 50;
const AGE_SAMPLES = 10;

// Xorshift128 — zero allocation, deterministic (same seed as the original).
let _x = 0xdeadbeef, _y = 362436069, _z = 521288629, _w = 88675123;
function rand(): number {
  const t = _x ^ (_x << 11);
  _x = _y; _y = _z; _z = _w;
  _w = _w ^ (_w >>> 19) ^ (t ^ (t >>> 8));
  return (_w >>> 0) / 0x100000000;
}

export const STOCK_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'BRK.B', 'JPM', 'V',
  'JNJ', 'WMT', 'PG', 'XOM', 'UNH', 'MA', 'HD', 'BAC', 'KO', 'PEP',
  'ABBV', 'MRK', 'ORCL', 'COST', 'NFLX', 'ADBE', 'CSCO', 'TMO', 'ACN', 'AVGO',
  'CRM', 'MCD', 'PFE', 'LLY', 'INTC', 'AMD', 'T', 'WFC', 'DIS', 'NKE',
  'IBM', 'BA', 'GM', 'F', 'VZ', 'QCOM', 'TXN', 'AMGN', 'GS', 'CAT',
];

const INITIAL_PRICES = [
  178.42, 412.88, 142.65, 186.33, 878.54, 248.91, 492.28, 445.67, 198.72, 287.45,
  156.23, 167.88, 162.45, 112.34, 524.10, 482.55, 388.40, 39.85, 62.71, 173.92,
  162.40, 128.55, 142.30, 832.15, 632.80, 552.40, 49.32, 587.95, 367.20, 1745.10,
  298.40, 287.65, 28.12, 758.30, 35.45, 168.20, 19.85, 56.40, 111.30, 82.55,
  175.20, 213.40, 52.30, 12.85, 41.20, 174.60, 198.40, 312.55, 478.20, 358.40,
];

export const NEWS_HEADLINES = [
  'Fed signals rate pause as inflation data cools',
  'Tech rally continues on strong earnings beat',
  'Oil prices surge amid Middle East tensions',
  'Dollar weakens as jobless claims rise unexpectedly',
  'S&P 500 hits new all-time high on GDP growth data',
  'Chip sector surges after semiconductor demand forecast raised',
  'Treasury yields rise on stronger-than-expected payrolls',
  'European markets close higher led by banking stocks',
  'Consumer confidence index exceeds analyst expectations',
  'Retail sales data sparks debate over soft landing',
  'Asian markets mixed after China manufacturing PMI miss',
  'Corporate buyback activity hits record quarterly high',
  'Hedge funds increase short positions in energy sector',
  'IPO market rebounds with three major listings this week',
  'Commodity prices under pressure as dollar strengthens',
  'Small-cap stocks outperform on domestic growth optimism',
  'Bond market volatility spikes on inflation expectations',
  'Biotech sector rallies on FDA fast-track designation news',
  'Emerging markets face headwinds from rising US yields',
  'Quarterly earnings season kicks off with mixed signals',
];

// Pre-allocated ring buffers (never reallocated in the hot loop).
export const stockMid = new Float64Array(MAX_STOCKS * HISTORY_LEN);
export const stockBid = new Float64Array(MAX_STOCKS * HISTORY_LEN);
export const stockAsk = new Float64Array(MAX_STOCKS * HISTORY_LEN);
export const stockTime = new Int32Array(MAX_STOCKS * HISTORY_LEN);
export const stockHead = new Int32Array(MAX_STOCKS);
const currentMid = new Float64Array(MAX_STOCKS);
const spreadBps = new Float64Array(MAX_STOCKS);

export interface Settings {
  currency: string;
  numCharts: number;
}
export const DEFAULT_SETTINGS: Settings = { currency: 'USD', numCharts: 14 };

// Live state read by the React tree each tick.
export const state = {
  tick: 0,
  sweepPos: 0,
  newsIndex: 0,
  lagMs: 0, // rolling tick-interval jitter (0 normal, spikes under LAG)
  settings: { ...DEFAULT_SETTINGS } as Settings,
};

let artificialLag = false;
let timer: ReturnType<typeof setInterval> | null = null;
let lastWall = 0;
const ageBuf = new Float64Array(AGE_SAMPLES);
let ageIdx = 0;

function initBuffers() {
  for (let s = 0; s < MAX_STOCKS; s++) {
    currentMid[s] = INITIAL_PRICES[s];
    spreadBps[s] = (2 + rand() * 8) / 10000;
    for (let i = 0; i < HISTORY_LEN; i++) {
      const mid = INITIAL_PRICES[s] * (1 + (rand() - 0.5) * 0.015);
      const spread = mid * spreadBps[s];
      const idx = s * HISTORY_LEN + i;
      stockMid[idx] = mid;
      stockBid[idx] = mid - spread / 2;
      stockAsk[idx] = mid + spread / 2;
      stockTime[idx] = i;
    }
    stockHead[s] = 0;
    currentMid[s] = stockMid[s * HISTORY_LEN + HISTORY_LEN - 1];
  }
}

function tick(notify: () => void) {
  state.tick++;
  state.sweepPos = (state.sweepPos + SWEEP_STEP) % 1;
  state.newsIndex =
    Math.floor((state.tick * REFRESH_RATE) / NEWS_RATE) % NEWS_HEADLINES.length;

  // Measure real interval drift as a live "lag" readout.
  const now = Date.now();
  if (lastWall) {
    ageBuf[ageIdx % AGE_SAMPLES] = Math.max(0, now - lastWall - REFRESH_RATE);
    ageIdx++;
    let sum = 0;
    for (let i = 0; i < AGE_SAMPLES; i++) sum += ageBuf[i];
    state.lagMs = sum / AGE_SAMPLES;
  }
  lastWall = now;

  const n = Math.min(state.settings.numCharts, MAX_STOCKS);
  for (let s = 0; s < n; s++) {
    const newMid = currentMid[s] * (1 + (rand() - 0.5) * 0.004);
    const spread = newMid * spreadBps[s];
    currentMid[s] = newMid;

    const head = stockHead[s];
    const idx = s * HISTORY_LEN + head;
    stockTime[idx] = state.tick;
    stockMid[idx] = newMid;
    stockBid[idx] = newMid - spread / 2;
    stockAsk[idx] = newMid + spread / 2;
    stockHead[s] = (head + 1) % HISTORY_LEN;
  }

  notify();

  if (artificialLag) {
    // Busy-loop jank demo. Unlike the original (which blocked only the worker),
    // this blocks the single JS thread — touch + sim both stall, which is the
    // honest RN behaviour.
    let acc = 0;
    for (let i = 0; i < 60_000_000; i++) acc += Math.sqrt(i);
    if (acc < 0) console.log(acc); // keep the loop from being optimized away
  }
}

let started = false;
export function start(notify: () => void) {
  if (started) return;
  started = true;
  initBuffers();
  timer = setInterval(() => tick(notify), REFRESH_RATE);
}

export function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

export function toggleLag() {
  artificialLag = !artificialLag;
  return artificialLag;
}

export function setSettings(patch: Partial<Settings>) {
  if (patch.currency) state.settings.currency = patch.currency;
  if (patch.numCharts !== undefined) {
    state.settings.numCharts = Math.min(patch.numCharts, MAX_STOCKS);
  }
}

export function resetSettings() {
  state.settings = { ...DEFAULT_SETTINGS };
}

export function stockCount() {
  return Math.min(state.settings.numCharts, MAX_STOCKS);
}
