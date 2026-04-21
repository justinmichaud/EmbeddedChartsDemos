import { memo, useMemo } from 'react';
import { LineChart, Line, Area, ResponsiveContainer, YAxis, XAxis, CartesianGrid } from 'recharts';
import type { StockSnapshot } from '../context/DataContext';

const HISTORY_LEN = 60;

interface StockChartProps {
  stock: StockSnapshot;
  currency: string;
  onClick?: () => void;
  enlarged?: boolean;
}

function buildChartData(stock: StockSnapshot) {
  const data = new Array(HISTORY_LEN);
  for (let i = 0; i < HISTORY_LEN; i++) {
    const idx = (stock.head + i) % HISTORY_LEN;
    data[i] = {
      t: stock.time[idx],
      mid: stock.mid[idx],
      bid: stock.bid[idx],
      ask: stock.ask[idx],
    };
  }
  return data;
}

export const StockChart = memo(function StockChart({ stock, currency, onClick, enlarged }: StockChartProps) {
  const data = useMemo(() => buildChartData(stock), [stock]);

  const currentAsk = stock.ask[(stock.head + HISTORY_LEN - 1) % HISTORY_LEN];
  const currentBid = stock.bid[(stock.head + HISTORY_LEN - 1) % HISTORY_LEN];
  const currentMid = stock.mid[(stock.head + HISTORY_LEN - 1) % HISTORY_LEN];
  const firstMid   = stock.mid[stock.head % HISTORY_LEN];
  const change     = firstMid !== 0 ? ((currentMid - firstMid) / firstMid) * 100 : 0;
  const high       = useMemo(() => Math.max(...stock.ask), [stock]);
  const low        = useMemo(() => Math.min(...stock.bid), [stock]);

  const changeColor = change >= 0 ? '#10b981' : '#ef4444';

  const yDomain = useMemo(() => [
    Math.min(...data.map(d => d.bid)) * 0.9998,
    Math.max(...data.map(d => d.ask)) * 1.0002,
  ], [data]);

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
      <div className="bg-[#0f1419] relative" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 32, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" strokeOpacity={0.4} />
            <XAxis
              dataKey="t"
              tick={{ fill: '#6b7280', fontSize: 8 }}
              tickLine={{ stroke: '#2d3748' }}
              axisLine={{ stroke: '#2d3748' }}
              interval={14}
            />
            <YAxis
              domain={yDomain}
              tick={{ fill: '#6b7280', fontSize: 8 }}
              tickLine={{ stroke: '#2d3748' }}
              axisLine={{ stroke: '#2d3748' }}
              tickFormatter={(v: number) => v.toFixed(1)}
              width={44}
              orientation="right"
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
        </ResponsiveContainer>
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
});
