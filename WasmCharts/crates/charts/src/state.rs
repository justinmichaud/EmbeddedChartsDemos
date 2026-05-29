//! Small value types for engine state.

/// Per-chart Y-range cache for hysteresis (ports StockChart.tsx yRangeRef).
#[derive(Clone, Copy)]
pub struct YCache {
    pub lo: f64,
    pub hi: f64,
}
impl Default for YCache {
    fn default() -> Self {
        YCache { lo: 0.0, hi: 0.0 }
    }
}

#[derive(Clone, Copy, PartialEq)]
pub enum View {
    Grid,
    Detail(usize),
}

pub struct Settings {
    pub currency: String,
    pub num_charts: usize,
}
impl Default for Settings {
    fn default() -> Self {
        Settings { currency: "USD".to_string(), num_charts: 14 }
    }
}
