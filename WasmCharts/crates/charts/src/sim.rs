//! Price simulation: ring buffers + Xorshift128 PRNG. Ports JSChartsFast/src/worker.ts:10-148.

pub const HISTORY_LEN: usize = 60;
pub const MAX_STOCKS: usize = 50;
pub const REFRESH_MS: f64 = 200.0;
pub const NEWS_MS: f64 = 10_000.0;

pub const SYMBOLS: [&str; MAX_STOCKS] = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "BRK.B", "JPM", "V",
    "JNJ", "WMT", "PG", "XOM", "UNH", "MA", "HD", "BAC", "KO", "PEP",
    "ABBV", "MRK", "ORCL", "COST", "NFLX", "ADBE", "CSCO", "TMO", "ACN", "AVGO",
    "CRM", "MCD", "PFE", "LLY", "INTC", "AMD", "T", "WFC", "DIS", "NKE",
    "IBM", "BA", "GM", "F", "VZ", "QCOM", "TXN", "AMGN", "GS", "CAT",
];

const INITIAL_PRICES: [f64; MAX_STOCKS] = [
    178.42, 412.88, 142.65, 186.33, 878.54, 248.91, 492.28, 445.67, 198.72, 287.45,
    156.23, 167.88, 162.45, 112.34, 524.10, 482.55, 388.40, 39.85, 62.71, 173.92,
    162.40, 128.55, 142.30, 832.15, 632.80, 552.40, 49.32, 587.95, 367.20, 1745.10,
    298.40, 287.65, 28.12, 758.30, 35.45, 168.20, 19.85, 56.40, 111.30, 82.55,
    175.20, 213.40, 52.30, 12.85, 41.20, 174.60, 198.40, 312.55, 478.20, 358.40,
];

pub const NEWS_HEADLINES: [&str; 20] = [
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

/// Xorshift128 — zero allocation, deterministic (ports worker.ts:10-17).
struct Rng {
    x: u32,
    y: u32,
    z: u32,
    w: u32,
}
impl Rng {
    fn new() -> Self {
        Rng { x: 0xDEAD_BEEF, y: 362_436_069, z: 521_288_629, w: 88_675_123 }
    }
    fn next(&mut self) -> f64 {
        let t = self.x ^ (self.x << 11);
        self.x = self.y;
        self.y = self.z;
        self.z = self.w;
        self.w = self.w ^ (self.w >> 19) ^ (t ^ (t >> 8));
        (self.w as f64) / 4_294_967_296.0 // 0x100000000
    }
}

/// All simulation state. Buffers are flat ring buffers indexed `s * HISTORY_LEN + i`.
pub struct Sim {
    rng: Rng,
    pub mid: Vec<f64>,
    pub bid: Vec<f64>,
    pub ask: Vec<f64>,
    pub time: Vec<f64>,
    pub head: Vec<usize>,
    current_mid: Vec<f64>,
    spread_bps: Vec<f64>,
    pub tick_count: u64,
}

impl Sim {
    pub fn new() -> Self {
        let n = MAX_STOCKS * HISTORY_LEN;
        let mut s = Sim {
            rng: Rng::new(),
            mid: vec![0.0; n],
            bid: vec![0.0; n],
            ask: vec![0.0; n],
            time: vec![0.0; n],
            head: vec![0; MAX_STOCKS],
            current_mid: vec![0.0; MAX_STOCKS],
            spread_bps: vec![0.0; MAX_STOCKS],
            tick_count: 0,
        };
        s.init();
        s
    }

    fn init(&mut self) {
        for st in 0..MAX_STOCKS {
            self.current_mid[st] = INITIAL_PRICES[st];
            self.spread_bps[st] = (2.0 + self.rng.next() * 8.0) / 10_000.0;
            for i in 0..HISTORY_LEN {
                let mid = INITIAL_PRICES[st] * (1.0 + (self.rng.next() - 0.5) * 0.015);
                let spread = mid * self.spread_bps[st];
                let idx = st * HISTORY_LEN + i;
                self.mid[idx] = mid;
                self.bid[idx] = mid - spread / 2.0;
                self.ask[idx] = mid + spread / 2.0;
                self.time[idx] = i as f64;
            }
            self.head[st] = 0;
            self.current_mid[st] = self.mid[st * HISTORY_LEN + HISTORY_LEN - 1];
        }
    }

    /// Advance one tick for the first `n` stocks (ports worker.ts:120-139).
    pub fn tick(&mut self, n: usize) {
        self.tick_count += 1;
        let n = n.min(MAX_STOCKS);
        for st in 0..n {
            let new_mid = self.current_mid[st] * (1.0 + (self.rng.next() - 0.5) * 0.004);
            let spread = new_mid * self.spread_bps[st];
            self.current_mid[st] = new_mid;

            let head = self.head[st];
            let idx = st * HISTORY_LEN + head;
            self.time[idx] = self.tick_count as f64;
            self.mid[idx] = new_mid;
            self.bid[idx] = new_mid - spread / 2.0;
            self.ask[idx] = new_mid + spread / 2.0;
            self.head[st] = (head + 1) % HISTORY_LEN;
        }
    }

    pub fn news_index(&self) -> usize {
        ((self.tick_count as f64 * REFRESH_MS / NEWS_MS) as usize) % NEWS_HEADLINES.len()
    }
}
