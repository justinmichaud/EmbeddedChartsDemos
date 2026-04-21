import { useData } from '../context/DataContext';
import { StockChart } from './StockChart';
import type { IframeToMainMessage } from '../../types/messages';

interface ChartDetailProps {
  symbol: string;
}

export function ChartDetail({ symbol }: ChartDetailProps) {
  const { stocks, currency } = useData();
  const stock = stocks.find(s => s.symbol === symbol);

  function goHome() {
    window.parent.postMessage({ type: 'NAVIGATE_HOME' } satisfies IframeToMainMessage, '*');
  }

  return (
    <div className="flex-1 overflow-auto p-2 flex flex-col gap-2">
      <div className="flex items-center gap-3 px-1">
        <button
          onClick={goHome}
          className="font-mono text-[#6b7280] hover:text-[#e6e8eb] text-[10px] border border-[#2d3748] px-2 py-0.5 hover:border-[#4b5563] transition-colors"
        >
          ← BACK
        </button>
        <span className="font-mono text-[#9ca3af]" style={{ fontSize: 11 }}>
          {symbol} — DETAIL VIEW
        </span>
      </div>
      {stock ? (
        <StockChart stock={stock} currency={currency} enlarged />
      ) : (
        <div className="text-[#6b7280] font-mono text-sm p-4">
          Waiting for data…
        </div>
      )}
    </div>
  );
}
