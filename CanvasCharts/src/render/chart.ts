// Canvas2D plot routine, shared by grid cards and the detail view.
//
// Replaces the recharts <LineChart> + memoized SVG overlay from JSChartsFast.
// Reads the worker's flat ring-buffer arrays directly (indexed by
// s*HISTORY_LEN + i) — no per-chart object/array allocation. The ctx is assumed
// to be pre-scaled by devicePixelRatio (the caller sizes the backing store on
// resize), so all coordinates here are in CSS pixels.
//
// Lines/areas use monotone-cubic interpolation (Fritsch–Carlson via d3-shape's
// curveMonotoneX formula) so the curves match recharts' `type="monotone"`.

import type { WorkerToMainMessage } from '../types/messages';

export type DataMsg = Extract<WorkerToMainMessage, { type: 'DATA' }>;

const HISTORY_LEN = 60;

// Match the old recharts margins so the plot lines up with the axis labels.
const PAD_TOP = 6;
const PAD_RIGHT = 34;
const PAD_BOTTOM = 14;
const PAD_LEFT = 6;
const X_TICK_IDX = [0, 15, 30, 45];

const C_BG = '#0f1419';
const C_GRID = '#2d3748';
const C_TICK = '#6b7280';
const C_MID = '#3b82f6';
const C_ASK = '#10b981';
const C_BID = '#ef4444';

// Per-chart Y domain with lazy re-snap (hysteresis). Carried across frames so
// axis labels stay stable until the data actually leaves the current range —
// ported from the recharts tick-stability trick in StockChart.tsx.
export interface YState {
  lo: number;
  hi: number;
}

export function makeYState(): YState {
  return { lo: 0, hi: 0 };
}

// Scratch buffers reused across every series of every chart — drawing is
// synchronous and single-threaded, so one shared set is safe and keeps the hot
// path allocation-free. PX/PY = projected screen points, M = monotone tangents
// (dy/dx in screen space), S = secant slopes.
const PX = new Float64Array(HISTORY_LEN);
const PY = new Float64Array(HISTORY_LEN);
const M = new Float64Array(HISTORY_LEN);
const S = new Float64Array(HISTORY_LEN);

export function drawChart(
  ctx: CanvasRenderingContext2D,
  msg: DataMsg,
  s: number,
  cssW: number,
  cssH: number,
  enlarged: boolean,
  y: YState,
): void {
  const base = s * HISTORY_LEN;
  const head = msg.stockHead[s];
  const mid = msg.stockMid;
  const bid = msg.stockBid;
  const ask = msg.stockAsk;

  // Pass 1: data extents over the (chronologically ordered) ring buffer.
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = 0; i < HISTORY_LEN; i++) {
    const idx = base + ((head + i) % HISTORY_LEN);
    const a = ask[idx];
    const b = bid[idx];
    if (a > yMax) yMax = a;
    if (b < yMin) yMin = b;
  }

  // Lazy re-snap: only widen the domain when data escapes it, then pad
  // generously so the next re-snap is far away.
  if (y.hi <= y.lo || yMin < y.lo || yMax > y.hi) {
    const range = yMax - yMin || Math.max(yMax * 0.001, 1e-6);
    y.lo = yMin - range;
    y.hi = yMax + range;
  }
  const yLo = y.lo;
  const yRange = y.hi - yLo || 1;

  const plotL = PAD_LEFT;
  const plotT = PAD_TOP;
  const plotW = cssW - PAD_LEFT - PAD_RIGHT;
  const plotH = cssH - PAD_TOP - PAD_BOTTOM;
  if (plotW <= 0 || plotH <= 0) return;
  const baseline = plotT + plotH;

  const xAt = (i: number) => plotL + (plotW * i) / (HISTORY_LEN - 1);
  const yAt = (v: number) => plotT + plotH * (1 - (v - yLo) / yRange);

  // Background.
  ctx.fillStyle = C_BG;
  ctx.fillRect(0, 0, cssW, cssH);

  // Grid lines (dashed). 5 horizontal, 4 vertical.
  ctx.save();
  ctx.strokeStyle = C_GRID;
  ctx.globalAlpha = 0.4;
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let g = 0; g <= 4; g++) {
    const yy = Math.round(plotT + (plotH * g) / 4) + 0.5;
    ctx.moveTo(plotL, yy);
    ctx.lineTo(plotL + plotW, yy);
  }
  for (let k = 0; k < X_TICK_IDX.length; k++) {
    const xx = Math.round(xAt(X_TICK_IDX[k])) + 0.5;
    ctx.moveTo(xx, plotT);
    ctx.lineTo(xx, plotT + plotH);
  }
  ctx.stroke();
  ctx.restore();

  // Solid axis lines (right + bottom).
  ctx.strokeStyle = C_GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const rx = Math.round(plotL + plotW) + 0.5;
  const by = Math.round(baseline) + 0.5;
  ctx.moveTo(rx, plotT);
  ctx.lineTo(rx, plotT + plotH);
  ctx.moveTo(plotL, by);
  ctx.lineTo(plotL + plotW, by);
  ctx.stroke();

  // Series, in recharts JSX order (each area renders fill then its own stroke):
  // ask, bid, then the mid line on top.
  renderSeries(ctx, ask, base, head, xAt, yAt, C_ASK, 1, baseline, true);
  renderSeries(ctx, bid, base, head, xAt, yAt, C_BID, 1, baseline, true);
  renderSeries(ctx, mid, base, head, xAt, yAt, C_MID, enlarged ? 2 : 1.5, baseline, false);

  // Axis labels.
  ctx.fillStyle = C_TICK;
  ctx.font = '8px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (let g = 0; g <= 4; g++) {
    const v = yLo + (yRange * g) / 4;
    ctx.fillText(v.toFixed(1), plotL + plotW + 4, yAt(v));
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (let k = 0; k < X_TICK_IDX.length; k++) {
    const idx = X_TICK_IDX[k];
    ctx.fillText(`${HISTORY_LEN - idx}s`, xAt(idx), baseline + 11);
  }
}

function sign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

// Project a ring-buffer series into PX/PY (screen space) and compute monotone
// tangents M, matching d3-shape's curveMonotoneX:
//   interior: t = (sign(s0)+sign(s1)) * min(|s0|, |s1|, 0.5|p|)
//   endpoints: slope2 = (3*secant - neighbour_tangent) / 2
function project(
  arr: number[],
  base: number,
  head: number,
  xAt: (i: number) => number,
  yAt: (v: number) => number,
): void {
  const n = HISTORY_LEN;
  for (let i = 0; i < n; i++) {
    PX[i] = xAt(i);
    PY[i] = yAt(arr[base + ((head + i) % n)]);
  }
  for (let i = 0; i < n - 1; i++) {
    S[i] = (PY[i + 1] - PY[i]) / (PX[i + 1] - PX[i]);
  }
  for (let i = 1; i < n - 1; i++) {
    const s0 = S[i - 1];
    const s1 = S[i];
    const h0 = PX[i] - PX[i - 1];
    const h1 = PX[i + 1] - PX[i];
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    M[i] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  M[0] = (3 * S[0] - M[1]) / 2;
  M[n - 1] = (3 * S[n - 2] - M[n - 2]) / 2;
}

// Trace the monotone-cubic path through PX/PY/M as bezier segments. Assumes the
// current path point is already at (PX[0], PY[0]).
function traceCurve(ctx: CanvasRenderingContext2D): void {
  const n = HISTORY_LEN;
  for (let i = 0; i < n - 1; i++) {
    const dx = (PX[i + 1] - PX[i]) / 3;
    ctx.bezierCurveTo(
      PX[i] + dx,
      PY[i] + dx * M[i],
      PX[i + 1] - dx,
      PY[i + 1] - dx * M[i + 1],
      PX[i + 1],
      PY[i + 1],
    );
  }
}

function renderSeries(
  ctx: CanvasRenderingContext2D,
  arr: number[],
  base: number,
  head: number,
  xAt: (i: number) => number,
  yAt: (v: number) => number,
  color: string,
  width: number,
  baseline: number,
  withFill: boolean,
): void {
  project(arr, base, head, xAt, yAt);
  const last = HISTORY_LEN - 1;

  if (withFill) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.moveTo(PX[0], baseline);
    ctx.lineTo(PX[0], PY[0]);
    traceCurve(ctx);
    ctx.lineTo(PX[last], baseline);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(PX[0], PY[0]);
  traceCurve(ctx);
  ctx.stroke();
}
