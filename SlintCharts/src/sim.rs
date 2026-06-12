// Synthetic market-data engine — a 1:1 port of `CanvasCharts/src/worker.ts`.
//
// Same xorshift128 PRNG (same seed), same 50 symbols / initial prices, same
// pre-allocated ring buffers (60 samples/stock), same 5 Hz random walk and the
// same 10 s sweep / news cycle. Keeping the math identical means the Slint demo
// plots the very same series the web and Qt/Flutter demos do.

pub const HISTORY_LEN: usize = 60;
pub const MAX_STOCKS: usize = 50;
pub const REFRESH_RATE_MS: u64 = 200;
const NEWS_RATE_MS: f64 = 10_000.0;
const SWEEP_PERIOD_MS: f64 = 10_000.0;
const SWEEP_STEP: f64 = REFRESH_RATE_MS as f64 / SWEEP_PERIOD_MS;

pub static SYMBOLS: [&str; MAX_STOCKS] = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "BRK.B", "JPM", "V",
    "JNJ", "WMT", "PG", "XOM", "UNH", "MA", "HD", "BAC", "KO", "PEP",
    "ABBV", "MRK", "ORCL", "COST", "NFLX", "ADBE", "CSCO", "TMO", "ACN", "AVGO",
    "CRM", "MCD", "PFE", "LLY", "INTC", "AMD", "T", "WFC", "DIS", "NKE",
    "IBM", "BA", "GM", "F", "VZ", "QCOM", "TXN", "AMGN", "GS", "CAT",
];

static INITIAL_PRICES: [f64; MAX_STOCKS] = [
    178.42, 412.88, 142.65, 186.33, 878.54, 248.91, 492.28, 445.67, 198.72, 287.45,
    156.23, 167.88, 162.45, 112.34, 524.10, 482.55, 388.40, 39.85, 62.71, 173.92,
    162.40, 128.55, 142.30, 832.15, 632.80, 552.40, 49.32, 587.95, 367.20, 1745.10,
    298.40, 287.65, 28.12, 758.30, 35.45, 168.20, 19.85, 56.40, 111.30, 82.55,
    175.20, 213.40, 52.30, 12.85, 41.20, 174.60, 198.40, 312.55, 478.20, 358.40,
];

pub static HEADLINES: [&str; 20] = [
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
    "Quarterly earnings season kicks off with mixed signals",
];

pub struct Engine {
    // xorshift128 state
    x: u32,
    y: u32,
    z: u32,
    w: u32,
    // Pre-allocated ring buffers (never reallocated in the hot loop).
    mid: Vec<f64>,
    bid: Vec<f64>,
    ask: Vec<f64>,
    head: [usize; MAX_STOCKS],
    current_mid: [f64; MAX_STOCKS],
    spread_bps: [f64; MAX_STOCKS],

    pub tick: u64,
    pub sweep_pos: f64,
    pub artificial_lag: bool,
}

impl Engine {
    pub fn new() -> Self {
        let mut e = Engine {
            x: 0xDEAD_BEEF,
            y: 362_436_069,
            z: 521_288_629,
            w: 88_675_123,
            mid: vec![0.0; MAX_STOCKS * HISTORY_LEN],
            bid: vec![0.0; MAX_STOCKS * HISTORY_LEN],
            ask: vec![0.0; MAX_STOCKS * HISTORY_LEN],
            head: [0; MAX_STOCKS],
            current_mid: [0.0; MAX_STOCKS],
            spread_bps: [0.0; MAX_STOCKS],
            tick: 0,
            sweep_pos: 0.0,
            artificial_lag: false,
        };
        e.init();
        e
    }

    // Xorshift128 — identical bit pattern to the JS `_w >>> 0) / 0x100000000`.
    #[inline]
    fn rand(&mut self) -> f64 {
        let t = self.x ^ (self.x << 11);
        self.x = self.y;
        self.y = self.z;
        self.z = self.w;
        self.w = self.w ^ (self.w >> 19) ^ (t ^ (t >> 8));
        self.w as f64 / 4_294_967_296.0
    }

    fn init(&mut self) {
        for s in 0..MAX_STOCKS {
            self.current_mid[s] = INITIAL_PRICES[s];
            self.spread_bps[s] = (2.0 + self.rand() * 8.0) / 10_000.0;
            for i in 0..HISTORY_LEN {
                let mid = INITIAL_PRICES[s] * (1.0 + (self.rand() - 0.5) * 0.015);
                let spread = mid * self.spread_bps[s];
                let idx = s * HISTORY_LEN + i;
                self.mid[idx] = mid;
                self.bid[idx] = mid - spread / 2.0;
                self.ask[idx] = mid + spread / 2.0;
            }
            self.head[s] = 0;
            self.current_mid[s] = self.mid[s * HISTORY_LEN + HISTORY_LEN - 1];
        }
    }

    /// Advance the simulation one 5 Hz tick over the first `n` stocks.
    pub fn tick(&mut self, n: usize) {
        self.tick += 1;
        self.sweep_pos = (self.sweep_pos + SWEEP_STEP) % 1.0;

        for s in 0..n.min(MAX_STOCKS) {
            let new_mid = self.current_mid[s] * (1.0 + (self.rand() - 0.5) * 0.004);
            let spread = new_mid * self.spread_bps[s];
            self.current_mid[s] = new_mid;

            let head = self.head[s];
            let idx = s * HISTORY_LEN + head;
            self.mid[idx] = new_mid;
            self.bid[idx] = new_mid - spread / 2.0;
            self.ask[idx] = new_mid + spread / 2.0;
            self.head[s] = (head + 1) % HISTORY_LEN;
        }

        if self.artificial_lag {
            // Match the worker's TOGGLE_LAG busy-loop so the LAG button stalls
            // the data thread the same way the other demos do.
            let mut sum = 0.0f64;
            for i in 0..1_000_000_000u64 {
                sum += (i as f64).sqrt();
            }
            std::hint::black_box(sum);
        }
    }

    pub fn news_index(&self) -> usize {
        ((self.tick as f64 * REFRESH_RATE_MS as f64 / NEWS_RATE_MS) as usize) % HEADLINES.len()
    }

    /// Copy stock `s`'s ring buffer into chronological order (oldest → newest).
    pub fn series(&self, s: usize, mid: &mut [f64], bid: &mut [f64], ask: &mut [f64]) {
        let base = s * HISTORY_LEN;
        let head = self.head[s];
        for i in 0..HISTORY_LEN {
            let idx = base + (head + i) % HISTORY_LEN;
            mid[i] = self.mid[idx];
            bid[i] = self.bid[idx];
            ask[i] = self.ask[idx];
        }
    }
}
