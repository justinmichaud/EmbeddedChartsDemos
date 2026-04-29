import { memo, useEffect, useRef, useState } from 'react';
import { LineChart, Line, Area, YAxis, XAxis } from 'recharts';
import type { StockSnapshot } from '../context/DataContext';

const HISTORY_LEN = 60;

interface StockChartProps {
  stock: StockSnapshot;
  currency: string;
  onClick?: () => void;
  enlarged?: boolean;
}

interface ChartPoint { t: number; mid: number; bid: number; ask: number }

function makeBuffer(): ChartPoint[] {
  const buf = new Array<ChartPoint>(HISTORY_LEN);
  for (let i = 0; i < HISTORY_LEN; i++) buf[i] = { t: 0, mid: 0, bid: 0, ask: 0 };
  return buf;
}

// Match LineChart margin so plot area aligns with the data line/area paths.
const PAD_TOP = 4, PAD_RIGHT = 32, PAD_BOTTOM = 4, PAD_LEFT = 4;
const X_TICK_IDX = [0, 15, 30, 45];

interface ChartOverlayProps { w: number; h: number; yLo: number; yHi: number }

// Memoized SVG overlay: grid lines + axis labels. Re-renders only when its
// props change. With Y-snap hysteresis, yLo/yHi are stable across most ticks
// and chart dimensions are stable after first paint, so React.memo bails out
// on ~all renders — recharts' renderTicks / renderLineItem / Text2 work is
// fully bypassed.
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
  // Stable per-chart buffer of 60 point objects — mutated in place each render
  // to avoid allocating 60 fresh objects every tick.
  const bufRef = useRef<ChartPoint[]>();
  if (!bufRef.current) bufRef.current = makeBuffer();
  const buf = bufRef.current;

  // Replace ResponsiveContainer with a single ResizeObserver pass. Avoids
  // the per-render cloneElement + useMemo + wrapper div that ResponsiveContainer
  // performs for every LineChart render.
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

  // Recharts keys each axis tick <g> by `${value}-${coordinate}-${tickCoord}`
  // (CartesianAxis.js:270). If those numbers drift each render, every tick
  // unmounts and remounts → Node.removeChild storm in the commit phase. We
  // keep the displayed Y domain (and therefore tick values + coordinates)
  // stable across renders, only re-snapping when data drifts outside.
  const yDomainRef = useRef<[number, number]>([0, 0]);
  const yTicksRef  = useRef<number[]>([0, 0, 0, 0, 0]);
  const yRangeRef  = useRef<{ lo: number; hi: number }>({ lo: 0, hi: 0 });

  // Single pass: copy ring buffer to chronological order, compute high/low/yMin/yMax.
  let high = -Infinity, low = Infinity;
  let yMin = Infinity, yMax = -Infinity;
  const head = stock.head;
  for (let i = 0; i < HISTORY_LEN; i++) {
    const idx = (head + i) % HISTORY_LEN;
    const a = stock.ask[idx];
    const b = stock.bid[idx];
    const m = stock.mid[idx];
    const t = stock.time[idx];
    if (a > high) high = a;
    if (b < low)  low  = b;
    if (a > yMax) yMax = a;
    if (b < yMin) yMin = b;
    const p = buf[i];
    p.t = t; p.mid = m; p.bid = b; p.ask = a;
  }

  // Y range with lazy re-snap: only update yLo/yHi when the data actually
  // leaves the current range, then pad generously so the next re-snap is
  // far away. This keeps tick values + coordinates byte-identical across
  // most renders, so recharts' "tick-${value}-${coord}-${tickCoord}" keys
  // (CartesianAxis.js:270) stay stable and the tick <g>s don't unmount.
  const yr = yRangeRef.current;
  if (yr.hi <= yr.lo || yMin < yr.lo || yMax > yr.hi) {
    const dataRange = (yMax - yMin) || Math.max(yMax * 0.001, 1e-6);
    yr.lo = yMin - dataRange;
    yr.hi = yMax + dataRange;
  }
  const yLo = yr.lo;
  const yHi = yr.hi;
  yDomainRef.current[0] = yLo;
  yDomainRef.current[1] = yHi;
  const yDomain = yDomainRef.current;

  const yTicks = yTicksRef.current;
  const yStep  = (yHi - yLo) / 4;
  yTicks[0] = yLo;
  yTicks[1] = yLo + yStep;
  yTicks[2] = yLo + yStep * 2;
  yTicks[3] = yLo + yStep * 3;
  yTicks[4] = yHi;

  // recharts memoizes by data reference, so wrap the stable buffer in a fresh
  // array each render to force re-derivation. One slice (60 ref copies) replaces
  // 60 fresh ChartPoint allocations.
  const data = buf.slice();

  const lastIdx   = (head + HISTORY_LEN - 1) % HISTORY_LEN;
  const firstIdx  = head % HISTORY_LEN;
  const currentAsk = stock.ask[lastIdx];
  const currentBid = stock.bid[lastIdx];
  const currentMid = stock.mid[lastIdx];
  const firstMid   = stock.mid[firstIdx];
  const change     = firstMid !== 0 ? ((currentMid - firstMid) / firstMid) * 100 : 0;
  const changeColor = change >= 0 ? '#10b981' : '#ef4444';

  const chartHeight = enlarged ? 320 : 96;

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
        <div className="grid grid-cols-5 gap-1 font-mono" style={{ fontSize: 9 }}>
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
        {dims && dims.w > 0 && dims.h > 0 && (
          <LineChart width={dims.w} height={dims.h} data={data} margin={{ top: PAD_TOP, right: PAD_RIGHT, left: PAD_LEFT, bottom: PAD_BOTTOM }}>
            {/* Axes hidden — they only contribute scale info to recharts.
                Visual ticks/grid are drawn by the memoized <ChartOverlay/>. */}
            <XAxis hide />
            <YAxis
              hide
              domain={yDomain}
              ticks={yTicks}
              interval={0}
              tickCount={0}
            />
            <Area
              type="monotone"
              dataKey="ask"
              stroke="#10b981"
              strokeWidth={1}
              fill="#10b981"
              fillOpacity={0.12}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="bid"
              stroke="#ef4444"
              strokeWidth={1}
              fill="#ef4444"
              fillOpacity={0.12}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="mid"
              stroke="#3b82f6"
              strokeWidth={enlarged ? 2 : 1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        )}
        {dims && dims.w > 0 && dims.h > 0 && (
          <ChartOverlay w={dims.w} h={dims.h} yLo={yLo} yHi={yHi} />
        )}
      </div>

      {/* Footer */}
      <div className="px-2 py-1 border-t border-[#2d3748] shrink-0">
        <div className="grid grid-cols-3 gap-2 font-mono" style={{ fontSize: 8 }}>
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
