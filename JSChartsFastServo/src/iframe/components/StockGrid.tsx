import { useData } from '../context/DataContext';
import { StockChart } from './StockChart';
import type { IframeToMainMessage } from '../../types/messages';

export function StockGrid() {
  const { stocks, currency } = useData();

  function navigate(symbol: string) {
    window.parent.postMessage({ type: 'NAVIGATE_DETAIL', symbol } satisfies IframeToMainMessage, '*');
  }

  return (
    // Flexbox grid (Servo has no CSS Grid support): each card's basis mirrors the
    // original 2→3→4→5→6 responsive columns, with the row gap (gap-2 = 0.5rem)
    // subtracted per card. min-w-0 is the flex analog of grid's minmax(0, …) so a
    // wide chart can't blow out the track.
    <div className="flex flex-wrap gap-2 p-2">
      {stocks.map(stock => (
        <div
          key={stock.symbol}
          className="min-w-0 basis-[calc(50%_-_0.26rem)] sm:basis-[calc(33.333%_-_0.34rem)] md:basis-[calc(25%_-_0.38rem)] lg:basis-[calc(20%_-_0.41rem)] xl:basis-[calc(16.666%_-_0.42rem)]"
        >
          <StockChart
            stock={stock}
            currency={currency}
            onClick={() => navigate(stock.symbol)}
          />
        </div>
      ))}
    </div>
  );
}
