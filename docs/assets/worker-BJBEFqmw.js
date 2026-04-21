(function() {
  "use strict";
  const REFRESH_RATE = 200;
  const NEWS_RATE = 1e4;
  const SWEEP_PERIOD_MS = 1e4;
  const SWEEP_STEP = REFRESH_RATE / SWEEP_PERIOD_MS;
  const HISTORY_LEN = 60;
  const MAX_STOCKS = 20;
  let _x = 3735928559, _y = 362436069, _z = 521288629, _w = 88675123;
  function rand() {
    const t = _x ^ _x << 11;
    _x = _y;
    _y = _z;
    _z = _w;
    _w = _w ^ _w >>> 19 ^ (t ^ t >>> 8);
    return (_w >>> 0) / 4294967296;
  }
  const STOCK_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "BRK.B", "JPM", "V", "JNJ", "WMT", "PG", "XOM"];
  const INITIAL_PRICES = [178.42, 412.88, 142.65, 186.33, 878.54, 248.91, 492.28, 445.67, 198.72, 287.45, 156.23, 167.88, 162.45, 112.34];
  const NEWS_HEADLINES = [
    "Fed signals rate pause as inflation data cools",
    "Tech rally continues on strong earnings beat",
    "Oil prices surge amid Middle East tensions",
    "Dollar weakens as jobless claims rise unexpectedly",
    "S&P 500 hits new all-time high on GDP growth data",
    "Chip sector surges after semiconductor demand forecast raised",
    "Treasury yields rise on stronger-than-expected payrolls",
    "European markets close higher led by banking stocks",
    "Consumer confidence index exceeds analyst expectations",
    "Retail sales data sparks debate over soft landing",
    "Asian markets mixed after China manufacturing PMI miss",
    "Corporate buyback activity hits record quarterly high",
    "Hedge funds increase short positions in energy sector",
    "IPO market rebounds with three major listings this week",
    "Commodity prices under pressure as dollar strengthens",
    "Small-cap stocks outperform on domestic growth optimism",
    "Bond market volatility spikes on inflation expectations",
    "Biotech sector rallies on FDA fast-track designation news",
    "Emerging markets face headwinds from rising US yields",
    "Quarterly earnings season kicks off with mixed signals"
  ];
  const stockMid = new Array(MAX_STOCKS * HISTORY_LEN).fill(0);
  const stockBid = new Array(MAX_STOCKS * HISTORY_LEN).fill(0);
  const stockAsk = new Array(MAX_STOCKS * HISTORY_LEN).fill(0);
  const stockTime = new Array(MAX_STOCKS * HISTORY_LEN).fill(0);
  const stockHead = new Array(MAX_STOCKS).fill(0);
  const currentMid = new Array(MAX_STOCKS).fill(0);
  const spreadBps = new Array(MAX_STOCKS).fill(0);
  let settings = { currency: "USD", numCharts: 14 };
  let tick = 0;
  let sweepPos = 0;
  function init() {
    for (let s = 0; s < MAX_STOCKS; s++) {
      currentMid[s] = INITIAL_PRICES[s];
      spreadBps[s] = (2 + rand() * 8) / 1e4;
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
  function buildMessage(n, timestamp) {
    return {
      type: "DATA",
      timestamp,
      tick,
      sweepPos,
      settings,
      stockSymbols: STOCK_SYMBOLS.slice(0, n),
      stockMid: stockMid.slice(0, n * HISTORY_LEN),
      stockBid: stockBid.slice(0, n * HISTORY_LEN),
      stockAsk: stockAsk.slice(0, n * HISTORY_LEN),
      stockTime: stockTime.slice(0, n * HISTORY_LEN),
      stockHead: stockHead.slice(0, n),
      headlines: NEWS_HEADLINES,
      newsIndex: Math.floor(tick * REFRESH_RATE / NEWS_RATE) % NEWS_HEADLINES.length
    };
  }
  function buildSnapshot() {
    const n = Math.min(settings.numCharts, MAX_STOCKS);
    return buildMessage(n, performance.timeOrigin + performance.now());
  }
  function tick_() {
    tick++;
    sweepPos = (sweepPos + SWEEP_STEP) % 1;
    const timestamp = performance.timeOrigin + performance.now();
    const n = Math.min(settings.numCharts, MAX_STOCKS);
    for (let s = 0; s < n; s++) {
      const newMid = currentMid[s] * (1 + (rand() - 0.5) * 4e-3);
      const spread = newMid * spreadBps[s];
      currentMid[s] = newMid;
      const head = stockHead[s];
      const idx = s * HISTORY_LEN + head;
      stockTime[idx] = tick;
      stockMid[idx] = newMid;
      stockBid[idx] = newMid - spread / 2;
      stockAsk[idx] = newMid + spread / 2;
      stockHead[s] = (head + 1) % HISTORY_LEN;
    }
    self.postMessage(buildMessage(n, timestamp));
  }
  self.onmessage = (e) => {
    const msg = e.data;
    switch (msg.type) {
      case "INIT":
        if (msg.settings.currency) settings.currency = msg.settings.currency;
        if (msg.settings.numCharts) settings.numCharts = Math.min(msg.settings.numCharts, MAX_STOCKS);
        break;
      case "UPDATE_SETTINGS": {
        let changed = false;
        if (msg.settings.currency && msg.settings.currency !== settings.currency) {
          settings.currency = msg.settings.currency;
          changed = true;
        }
        if (msg.settings.numCharts !== void 0 && msg.settings.numCharts !== settings.numCharts) {
          settings.numCharts = Math.min(msg.settings.numCharts, MAX_STOCKS);
          changed = true;
        }
        if (changed) {
          const save = { type: "SAVE_SETTINGS", settings };
          self.postMessage(save);
        }
        break;
      }
      case "RESET_SETTINGS":
        settings = { currency: "USD", numCharts: 14 };
        self.postMessage({ type: "SAVE_SETTINGS", settings });
        break;
      case "REQUEST_SNAPSHOT":
        self.postMessage(buildSnapshot());
        break;
    }
  };
  init();
  setInterval(tick_, REFRESH_RATE);
})();
//# sourceMappingURL=worker-BJBEFqmw.js.map
