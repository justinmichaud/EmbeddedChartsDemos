import { memo, useEffect, useRef, useState } from 'react';
import type { StockSnapshot } from '../context/DataContext';

const HISTORY_LEN = 60;

interface StockChartProps {
  stock: StockSnapshot;
  currency: string;
  onClick?: () => void;
  enlarged?: boolean;
}

// Match the old recharts LineChart margin so the data paths line up with the
// memoized <ChartOverlay/> grid + axis labels.
const PAD_TOP = 4, PAD_RIGHT = 32, PAD_BOTTOM = 4, PAD_LEFT = 4;
const X_TICK_IDX = [0, 15, 30, 45];

// ---------------------------------------------------------------------------
// Monotone-cubic path builder — SVG, no recharts.
//
// In Servo, SVG out-performs Canvas2D for these live charts (Servo's canvas is
// software-rendered and pays a HiDPI backing-store penalty; measured ~3-8 fps
// vs ~23 fps for SVG with 50 charts). We draw the 3 series as raw <path>s whose
// "d" we compute directly. The curve is a faithful port of recharts'
// `type="monotone"` (d3-shape curveMonotoneX, Fritsch–Carlson tangents).
// ---------------------------------------------------------------------------

// Scratch buffers reused across every series of every chart. React renders are
// synchronous and single-threaded, and each buildPaths call consumes these
// before returning a string, so one shared set is safe and keeps the hot path
// allocation-free.
const PX = new Float64Array(HISTORY_LEN);
const PY = new Float64Array(HISTORY_LEN);
const M  = new Float64Array(HISTORY_LEN);
const S  = new Float64Array(HISTORY_LEN);

function sign(x: number): number { return x > 0 ? 1 : x < 0 ? -1 : 0; }
function r2(x: number): number { return Math.round(x * 100) / 100; }

// Project `arr` (a 60-entry ring buffer with `head`) into screen space and emit
// [lineD, areaD]: the monotone line, and the same curve closed down to the
// plot baseline for the translucent fill.
function buildPaths(
  arr: number[], head: number,
  plotL: number, plotT: number, plotW: number, plotH: number,
  yLo: number, yRange: number, baseline: number,
): [string, string] {
  const n = HISTORY_LEN;
  for (let i = 0; i < n; i++) {
    PX[i] = plotL + (plotW * i) / (n - 1);
    PY[i] = plotT + plotH * (1 - (arr[(head + i) % n] - yLo) / yRange);
  }
  for (let i = 0; i < n - 1; i++) S[i] = (PY[i + 1] - PY[i]) / (PX[i + 1] - PX[i]);
  for (let i = 1; i < n - 1; i++) {
    const s0 = S[i - 1], s1 = S[i];
    const h0 = PX[i] - PX[i - 1], h1 = PX[i + 1] - PX[i];
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    M[i] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  M[0]     = (3 * S[0] - M[1]) / 2;
  M[n - 1] = (3 * S[n - 2] - M[n - 2]) / 2;

  let seg = '';
  for (let i = 0; i < n - 1; i++) {
    const dx = (PX[i + 1] - PX[i]) / 3;
    seg += `C${r2(PX[i] + dx)} ${r2(PY[i] + dx * M[i])} ${r2(PX[i + 1] - dx)} ${r2(PY[i + 1] - dx * M[i + 1])} ${r2(PX[i + 1])} ${r2(PY[i + 1])}`;
  }
  const start = `M${r2(PX[0])} ${r2(PY[0])}`;
  const line = start + seg;
  const area = `M${r2(PX[0])} ${r2(baseline)}L${r2(PX[0])} ${r2(PY[0])}${seg}L${r2(PX[n - 1])} ${r2(baseline)}Z`;
  return [line, area];
}

interface ChartOverlayProps { w: number; h: number; yLo: number; yHi: number }

// Memoized SVG overlay: grid lines + axis labels. Re-renders only when its
// props change. With Y-snap hysteresis, yLo/yHi are stable across most ticks
// and chart dimensions are stable after first paint, so React.memo bails out
// on ~all renders.
const ChartOverlay = memo(function ChartOverlay({ w, h, yLo, yHi }: ChartOverlayProps) {
  const plotW = w - PAD_LEFT - PAD_RIGHT;
  const plotH = h - PAD_TOP - PAD_BOTTOM;
  const yRange = yHi - yLo || 1;
  const yToPx = (v: number) => PAD_TOP + plotH * (1 - (v - yLo) / yRange);
  const xToPx = (idx: number) => PAD_LEFT + plotW * (idx / (HISTORY_LEN - 1));
  const yVals = [yLo, yLo + yRange * 0.25, yLo + yRange * 0.5, yLo + yRange * 0.75, yHi];

  const stroke = '#2d3748';
  const tickFill = '#6b7280';
  return (
    <svg
      width={w}
      height={h}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    >
      <g stroke={stroke} strokeOpacity={0.4} strokeDasharray="3 3" fill="none">
        {yVals.map((v, i) => {
          const y = yToPx(v);
          return <line key={`yg${i}`} x1={PAD_LEFT} x2={PAD_LEFT + plotW} y1={y} y2={y} />;
        })}
        {X_TICK_IDX.map((idx, i) => {
          const x = xToPx(idx);
          return <line key={`xg${i}`} x1={x} x2={x} y1={PAD_TOP} y2={PAD_TOP + plotH} />;
        })}
      </g>
      {/* axis lines */}
      <line x1={PAD_LEFT + plotW} x2={PAD_LEFT + plotW} y1={PAD_TOP} y2={PAD_TOP + plotH} stroke={stroke} />
      <line x1={PAD_LEFT} x2={PAD_LEFT + plotW} y1={PAD_TOP + plotH} y2={PAD_TOP + plotH} stroke={stroke} />
      <g fill={tickFill} fontSize={8} fontFamily="ui-monospace, monospace">
        {yVals.map((v, i) => (
          <text key={`yl${i}`} x={PAD_LEFT + plotW + 4} y={yToPx(v)} dy="0.32em">
            {v.toFixed(1)}
          </text>
        ))}
        {X_TICK_IDX.map((idx, i) => (
          <text key={`xl${i}`} x={xToPx(idx)} y={PAD_TOP + plotH + 10} textAnchor="middle">
            {`${HISTORY_LEN - idx}s`}
          </text>
        ))}
      </g>
    </svg>
  );
});

export function StockChart({ stock, currency, onClick, enlarged }: StockChartProps) {
  // Single ResizeObserver pass to track the plot box.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = (w: number, h: number) => {
      setDims(prev => (prev && prev.w === w && prev.h === h) ? prev : { w, h });
    };
    apply(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      apply(Math.round(r.width), Math.round(r.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Servo repaint workaround: Servo does not repaint an SVG subtree when a
  // <path d> is mutated in place — which is what React does to our path nodes
  // each tick, so the chart would freeze after first paint while the numbers
  // update. Nudging the transform on our <svg> after every render forces a
  // re-raster. We alternate between two *equivalent, always-composited*
  // transforms (rather than toggling transform on/off) so the compositor layer
  // persists.
  const dataSvgRef = useRef<SVGSVGElement>(null);
  const flipRef = useRef(0);
  useEffect(() => {
    const svg = dataSvgRef.current;
    if (!svg) return;
    flipRef.current ^= 1;
    svg.style.transform = flipRef.current ? 'translateZ(0px)' : 'translate3d(0px,0px,0px)';
  });

  // Keep the displayed Y domain stable across renders, only re-snapping when
  // data drifts outside — keeps the memoized ChartOverlay from re-rendering.
  const yRangeRef = useRef<{ lo: number; hi: number }>({ lo: 0, hi: 0 });

  let high = -Infinity, low = Infinity;
  let yMin = Infinity, yMax = -Infinity;
  const head = stock.head;
  for (let i = 0; i < HISTORY_LEN; i++) {
    const a = stock.ask[i];
    const b = stock.bid[i];
    if (a > high) high = a;
    if (b < low)  low  = b;
    if (a > yMax) yMax = a;
    if (b < yMin) yMin = b;
  }

  const yr = yRangeRef.current;
  if (yr.hi <= yr.lo || yMin < yr.lo || yMax > yr.hi) {
    const dataRange = (yMax - yMin) || Math.max(yMax * 0.001, 1e-6);
    yr.lo = yMin - dataRange;
    yr.hi = yMax + dataRange;
  }
  const yLo = yr.lo;
  const yHi = yr.hi;

  const lastIdx   = (head + HISTORY_LEN - 1) % HISTORY_LEN;
  const firstIdx  = head % HISTORY_LEN;
  const currentAsk = stock.ask[lastIdx];
  const currentBid = stock.bid[lastIdx];
  const currentMid = stock.mid[lastIdx];
  const firstMid   = stock.mid[firstIdx];
  const change     = firstMid !== 0 ? ((currentMid - firstMid) / firstMid) * 100 : 0;
  const changeColor = change >= 0 ? '#10b981' : '#ef4444';

  const chartHeight = enlarged ? 320 : 96;

  let askLine = '', askArea = '', bidLine = '', bidArea = '', midLine = '';
  let drawable = false;
  if (dims && dims.w > 0 && dims.h > 0) {
    const plotW = dims.w - PAD_LEFT - PAD_RIGHT;
    const plotH = dims.h - PAD_TOP - PAD_BOTTOM;
    if (plotW > 0 && plotH > 0) {
      const yRange = yHi - yLo || 1;
      const baseline = PAD_TOP + plotH;
      [askLine, askArea] = buildPaths(stock.ask, head, PAD_LEFT, PAD_TOP, plotW, plotH, yLo, yRange, baseline);
      [bidLine, bidArea] = buildPaths(stock.bid, head, PAD_LEFT, PAD_TOP, plotW, plotH, yLo, yRange, baseline);
      [midLine]          = buildPaths(stock.mid, head, PAD_LEFT, PAD_TOP, plotW, plotH, yLo, yRange, baseline);
      drawable = true;
    }
  }

  return (
    <div
      className="bg-[#1a1f29] border border-[#2d3748] flex flex-col"
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
      data-symbol={stock.symbol}
    >
      {/* Header row */}
      <div className="px-2 py-1 border-b border-[#2d3748] flex justify-between items-center shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[#e6e8eb] font-semibold" style={{ fontSize: 11 }}>
            {stock.symbol}
          </span>
        </div>
        <span className="font-mono font-semibold" style={{ color: changeColor, fontSize: 10 }}>
          {change >= 0 ? '+' : ''}{change.toFixed(3)}%
        </span>
      </div>

      {/* Bid / Mid / Ask / High / Low */}
      <div className="px-2 py-1 bg-[#0f1419] border-b border-[#2d3748] shrink-0">
        <div className="flex gap-1 font-mono [&>*]:flex-1 [&>*]:min-w-0" style={{ fontSize: 9 }}>
          <div>
            <div className="text-[#6b7280]">BID</div>
            <div className="text-[#ef4444] font-semibold">{currentBid.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-[#6b7280]">MID</div>
            <div className="text-[#e6e8eb] font-semibold">{currentMid.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-[#6b7280]">ASK</div>
            <div className="text-[#10b981] font-semibold">{currentAsk.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-[#6b7280]">HIGH</div>
            <div className="text-[#9ca3af]">{high.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-[#6b7280]">LOW</div>
            <div className="text-[#9ca3af]">{low.toFixed(3)}</div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-[#0f1419] relative" style={{ height: chartHeight }} ref={wrapRef}>
        {drawable && (
          <svg
            ref={dataSvgRef}
            width={dims!.w}
            height={dims!.h}
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            {/* recharts JSX order: ask area+line, bid area+line, mid line on top. */}
            <path d={askArea} fill="#10b981" fillOpacity={0.12} stroke="none" />
            <path d={askLine} fill="none" stroke="#10b981" strokeWidth={1} />
            <path d={bidArea} fill="#ef4444" fillOpacity={0.12} stroke="none" />
            <path d={bidLine} fill="none" stroke="#ef4444" strokeWidth={1} />
            <path d={midLine} fill="none" stroke="#3b82f6" strokeWidth={enlarged ? 2 : 1.5} strokeLinejoin="round" />
          </svg>
        )}
        {drawable && (
          <ChartOverlay w={dims!.w} h={dims!.h} yLo={yLo} yHi={yHi} />
        )}
      </div>

      {/* Footer */}
      <div className="px-2 py-1 border-t border-[#2d3748] shrink-0">
        <div className="flex gap-2 font-mono [&>*]:flex-1 [&>*]:min-w-0" style={{ fontSize: 8 }}>
          <div>
            <span className="text-[#6b7280]">CCY: </span>
            <span className="text-[#9ca3af]">{currency}</span>
          </div>
          <div>
            <span className="text-[#6b7280]">SPR: </span>
            <span className="text-[#9ca3af]">${(currentAsk - currentBid).toFixed(4)}</span>
          </div>
          <div>
            <span className="text-[#6b7280]">UPD: </span>
            <span className="text-[#9ca3af]">5Hz</span>
          </div>
        </div>
      </div>
    </div>
  );
}
