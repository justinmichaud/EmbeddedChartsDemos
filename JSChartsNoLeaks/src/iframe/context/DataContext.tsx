import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { WorkerToMainMessage } from '../../types/messages';

export const TEST_MODE = new URLSearchParams(window.location.search).has('testMode');

export interface StockSnapshot {
  symbol: string;
  mid: number[];
  bid: number[];
  ask: number[];
  time: number[];
  head: number;
}

export interface DataState {
  tick: number;
  sweepPos: number; // [0, 1) sweep cycle position, computed by worker
  currency: string;
  numCharts: number;
  stocks: StockSnapshot[];
  headlines: string[];
  newsIndex: number;
  lastMessageAge: number; // ms, rolling average
}

const HISTORY_LEN = 60;
const AGE_SAMPLES = 10;

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({
    tick: 0,
    sweepPos: 0,
    currency: 'USD',
    numCharts: 0,
    stocks: [],
    headlines: [],
    newsIndex: 0,
    lastMessageAge: 0,
  });

  // Pre-allocated rolling age buffer
  const ageBuffer = useRef<number[]>(new Array(AGE_SAMPLES).fill(0));
  const ageIdx = useRef(0);

  useEffect(() => {
    function onMessage(e: MessageEvent<WorkerToMainMessage>) {
      const msg = e.data;
      if (msg.type !== 'DATA') return;

      const now = performance.timeOrigin + performance.now();
      const age = now - msg.timestamp;
      ageBuffer.current[ageIdx.current % AGE_SAMPLES] = age;
      ageIdx.current++;
      const avgAge = ageBuffer.current.reduce((a, b) => a + b, 0) / AGE_SAMPLES;

      const n = msg.stockSymbols.length;
      const stocks: StockSnapshot[] = new Array(n);
      for (let s = 0; s < n; s++) {
        const base = s * HISTORY_LEN;
        stocks[s] = {
          symbol: msg.stockSymbols[s],
          mid:  Array.from(msg.stockMid.slice(base, base + HISTORY_LEN)),
          bid:  Array.from(msg.stockBid.slice(base, base + HISTORY_LEN)),
          ask:  Array.from(msg.stockAsk.slice(base, base + HISTORY_LEN)),
          time: Array.from(msg.stockTime.slice(base, base + HISTORY_LEN)),
          head: msg.stockHead[s],
        };
      }

      setState({
        tick: msg.tick,
        sweepPos: msg.sweepPos,
        currency: msg.settings.currency,
        numCharts: msg.settings.numCharts,
        stocks,
        headlines: msg.headlines,
        newsIndex: msg.newsIndex,
        lastMessageAge: avgAge,
      });
    }

    window.addEventListener('message', onMessage as EventListener);
    return () => window.removeEventListener('message', onMessage as EventListener);
  }, []);

  return <DataContext.Provider value={state}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
