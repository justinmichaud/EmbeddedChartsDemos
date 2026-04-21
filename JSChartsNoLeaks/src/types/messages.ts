export interface Settings {
  currency: string;
  numCharts: number;
}

export const DEFAULT_SETTINGS: Settings = {
  currency: 'USD',
  numCharts: 14,
};

// Worker → Main → Iframe
export type WorkerToMainMessage =
  | {
      type: 'DATA';
      timestamp: number;
      tick: number;
      sweepPos: number; // [0, 1) position in sweep cycle, computed by worker
      settings: Settings;
      stockSymbols: string[];
      stockMid: number[];
      stockBid: number[];
      stockAsk: number[];
      stockTime: number[];
      stockHead: number[];
      headlines: string[];
      newsIndex: number;
    }
  | { type: 'SAVE_SETTINGS'; settings: Settings };

// Main → Worker
export type MainToWorkerMessage =
  | { type: 'INIT'; settings: Partial<Settings> }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  | { type: 'RESET_SETTINGS' }
  | { type: 'REQUEST_SNAPSHOT' }
  | { type: 'TOGGLE_LAG' };

// Iframe → Main (some are forwarded to worker)
export type IframeToMainMessage =
  | { type: 'NAVIGATE_DETAIL'; symbol: string }
  | { type: 'NAVIGATE_HOME' }
  | { type: 'RECOVER' }
  | { type: 'CLEAR_STORAGE' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  | { type: 'TOGGLE_LAG' };
