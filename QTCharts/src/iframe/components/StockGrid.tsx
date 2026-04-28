import { useData } from '../context/DataContext';
import { StockChart } from './StockChart';
import type { IframeToMainMessage } from '../../types/messages';

export function StockGrid() {
  const { stocks, currency } = useData();

  function navigate(symbol: string) {
    window.parent.postMessage({ type: 'NAVIGATE_DETAIL', symbol } satisfies IframeToMainMessage, '*');
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 p-2">
      {stocks.map(stock => (
        <StockChart
          key={stock.symbol}
          stock={stock}
          currency={currency}
          onClick={() => navigate(stock.symbol)}
        />
      ))}
    </div>
  );
}
