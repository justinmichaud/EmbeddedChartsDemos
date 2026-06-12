// Slint stock-chart demo — native counterpart to the Qt/Flutter ports.
//
// Threading model mirrors the others: a 5 Hz `slint::Timer` advances the
// simulation and pushes a fresh model into the UI, while the renderer free-runs
// (we re-request a redraw every frame from the rendering notifier) so the
// framerate reflects the toolkit's drawing throughput. When BENCH_FPS=1 we emit
// one `BENCHFPS <n>` line per second to stdout for the benchmark harness.
pub mod sim;

use std::cell::{Cell, RefCell};
use std::rc::Rc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use slint::{ModelRc, SharedString, VecModel};

use sim::{Engine, HISTORY_LEN};

slint::include_modules!();

const CURRENCIES: [&str; 8] = ["USD", "EUR", "GBP", "JPY", "CNY", "CHF", "AUD", "CAD"];

pub fn run() {
    let emit_fps = std::env::var("BENCH_FPS").as_deref() == Ok("1");
    let reset = std::env::var("BENCH_RESET").as_deref() == Ok("1");

    let settings = Settings::load(reset);

    let state = Rc::new(RefCell::new(State {
        engine: Engine::new(),
        ystate: vec![(0.0, 0.0); sim::MAX_STOCKS],
        num_charts: settings.num_charts,
        currency_idx: settings.currency_idx,
    }));

    let app = MainWindow::new().expect("failed to create window");
    app.set_currency(SharedString::from(CURRENCIES[settings.currency_idx]));

    let model: Rc<VecModel<StockCardData>> = Rc::new(VecModel::default());
    app.set_cards(ModelRc::from(model.clone()));
    let news: Rc<VecModel<SharedString>> = Rc::new(VecModel::default());
    app.set_news(ModelRc::from(news.clone()));

    // Populate once up front so the first frame has data.
    refresh(&state, &model, &news, &app);

    // --- 5 Hz simulation timer -------------------------------------------
    let sim_timer = slint::Timer::default();
    {
        let state = state.clone();
        let model = model.clone();
        let news = news.clone();
        let weak = app.as_weak();
        sim_timer.start(
            slint::TimerMode::Repeated,
            Duration::from_millis(sim::REFRESH_RATE_MS),
            move || {
                let app = weak.unwrap();
                let t0 = Instant::now();
                {
                    let n = state.borrow().num_charts;
                    state.borrow_mut().engine.tick(n);
                }
                refresh(&state, &model, &news, &app);
                app.set_lag_ms(t0.elapsed().as_secs_f32() * 1000.0);
            },
        );
    }

    // --- UI callbacks -----------------------------------------------------
    {
        let state = state.clone();
        let weak = app.as_weak();
        app.on_toggle_lag(move || {
            let on = {
                let mut s = state.borrow_mut();
                s.engine.artificial_lag = !s.engine.artificial_lag;
                s.engine.artificial_lag
            };
            weak.unwrap().set_lag_on(on);
        });
    }
    {
        let state = state.clone();
        let weak = app.as_weak();
        app.on_cycle_currency(move || {
            let idx = {
                let mut s = state.borrow_mut();
                s.currency_idx = (s.currency_idx + 1) % CURRENCIES.len();
                s.currency_idx
            };
            weak.unwrap().set_currency(SharedString::from(CURRENCIES[idx]));
            Settings::from(&state.borrow()).save();
        });
    }
    {
        let state = state.clone();
        app.on_set_charts(move |n| {
            state.borrow_mut().num_charts = (n as usize).clamp(1, sim::MAX_STOCKS);
            Settings::from(&state.borrow()).save();
        });
    }

    // --- Free-running render loop + FPS counter ---------------------------
    {
        let frames = Cell::new(0u32);
        let last = Cell::new(Instant::now());
        let weak = app.as_weak();
        let res = app.window().set_rendering_notifier(move |state, _| {
            if !matches!(state, slint::RenderingState::BeforeRendering) {
                return;
            }
            frames.set(frames.get() + 1);
            let elapsed = last.get().elapsed();
            if elapsed >= Duration::from_secs(1) {
                let fps = (frames.get() as f64 / elapsed.as_secs_f64()).round() as i32;
                frames.set(0);
                last.set(Instant::now());
                if let Some(app) = weak.upgrade() {
                    app.set_fps(fps);
                }
                if emit_fps {
                    println!("BENCHFPS {fps}");
                    use std::io::Write;
                    let _ = std::io::stdout().flush();
                }
            }
            // Keep drawing every frame so the framerate reflects draw throughput.
            if let Some(app) = weak.upgrade() {
                app.window().request_redraw();
            }
        });
        if let Err(e) = res {
            eprintln!("[SlintCharts] rendering notifier unavailable: {e:?}");
        }
    }

    app.run().expect("event loop failed");
}

struct State {
    engine: Engine,
    ystate: Vec<(f64, f64)>,
    num_charts: usize,
    currency_idx: usize,
}

/// Recompute every card's view-model and the news feed, then push to the UI.
fn refresh(
    state: &Rc<RefCell<State>>,
    model: &Rc<VecModel<StockCardData>>,
    news: &Rc<VecModel<SharedString>>,
    app: &MainWindow,
) {
    let mut s = state.borrow_mut();
    let n = s.num_charts.min(sim::MAX_STOCKS);
    let State { engine, ystate, .. } = &mut *s;

    model.set_vec(build_cards(engine, n, ystate));
    news.set_vec(news_lines(engine));
    app.set_clock(SharedString::from(clock()));
}

/// Build the per-stock view-models (quote text + SVG path strings) for the
/// first `n` stocks, updating each chart's persistent Y domain in `ystate`.
/// Pure given (engine, ystate) — also used by the headless screenshot tool.
pub fn build_cards(
    engine: &Engine,
    n: usize,
    ystate: &mut [(f64, f64)],
) -> Vec<StockCardData> {
    let n = n.min(sim::MAX_STOCKS);
    let mut mid = [0.0f64; HISTORY_LEN];
    let mut bid = [0.0f64; HISTORY_LEN];
    let mut ask = [0.0f64; HISTORY_LEN];

    let mut cards = Vec::with_capacity(n);
    for i in 0..n {
        engine.series(i, &mut mid, &mut bid, &mut ask);

        // Data extents, then lazy re-snap with hysteresis (matches chart.ts).
        let (mut y_min, mut y_max) = (f64::INFINITY, f64::NEG_INFINITY);
        for k in 0..HISTORY_LEN {
            if ask[k] > y_max {
                y_max = ask[k];
            }
            if bid[k] < y_min {
                y_min = bid[k];
            }
        }
        let (mut lo, mut hi) = ystate[i];
        if hi <= lo || y_min < lo || y_max > hi {
            let range = if y_max - y_min > 0.0 {
                y_max - y_min
            } else {
                (y_max * 0.001).max(1e-6)
            };
            lo = y_min - range;
            hi = y_max + range;
            ystate[i] = (lo, hi);
        }
        let y_range = if hi - lo != 0.0 { hi - lo } else { 1.0 };

        let (ask_fill, ask_line) = paths(&ask, lo, y_range);
        let (bid_fill, bid_line) = paths(&bid, lo, y_range);
        let (_, mid_line) = paths(&mid, lo, y_range);

        let first = mid[0];
        let last = mid[HISTORY_LEN - 1];
        let pct = if first != 0.0 {
            (last - first) / first * 100.0
        } else {
            0.0
        };
        let high = ask.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let low = bid.iter().copied().fold(f64::INFINITY, f64::min);

        cards.push(StockCardData {
            symbol: sim::SYMBOLS[i].into(),
            change: format!("{pct:+.2}%").into(),
            up: pct >= 0.0,
            bid: format!("{:.2}", bid[HISTORY_LEN - 1]).into(),
            mid: format!("{:.2}", last).into(),
            ask: format!("{:.2}", ask[HISTORY_LEN - 1]).into(),
            high: format!("{high:.2}").into(),
            low: format!("{low:.2}").into(),
            spread: format!("{:.4}", ask[HISTORY_LEN - 1] - bid[HISTORY_LEN - 1]).into(),
            ask_fill: ask_fill.into(),
            ask_line: ask_line.into(),
            bid_fill: bid_fill.into(),
            bid_line: bid_line.into(),
            mid_line: mid_line.into(),
            yl0: format!("{:.1}", lo).into(),
            yl1: format!("{:.1}", lo + y_range * 0.25).into(),
            yl2: format!("{:.1}", lo + y_range * 0.5).into(),
            yl3: format!("{:.1}", lo + y_range * 0.75).into(),
            yl4: format!("{:.1}", hi).into(),
        });
    }
    cards
}

/// News feed: latest headline + the two before it.
pub fn news_lines(engine: &Engine) -> Vec<SharedString> {
    let ni = engine.news_index();
    let len = sim::HEADLINES.len();
    (0..3)
        .map(|k| sim::HEADLINES[(ni + len - k) % len].into())
        .collect()
}

#[inline]
fn signf(x: f64) -> f64 {
    if x > 0.0 {
        1.0
    } else if x < 0.0 {
        -1.0
    } else {
        0.0
    }
}

/// Build (filled area, stroked line) SVG path command strings for a 60-sample
/// series, projected into a 0..100 view box with monotone-cubic interpolation
/// (Fritsch–Carlson, same as the Canvas demo's curveMonotoneX).
fn paths(ys: &[f64], y_lo: f64, y_range: f64) -> (String, String) {
    let n = ys.len();
    let mut px = [0.0f64; HISTORY_LEN];
    let mut py = [0.0f64; HISTORY_LEN];
    for i in 0..n {
        px[i] = 100.0 * i as f64 / (n - 1) as f64;
        py[i] = 100.0 * (1.0 - (ys[i] - y_lo) / y_range);
    }
    let mut sec = [0.0f64; HISTORY_LEN];
    for i in 0..n - 1 {
        sec[i] = (py[i + 1] - py[i]) / (px[i + 1] - px[i]);
    }
    let mut m = [0.0f64; HISTORY_LEN];
    for i in 1..n - 1 {
        let (s0, s1) = (sec[i - 1], sec[i]);
        let (h0, h1) = (px[i] - px[i - 1], px[i + 1] - px[i]);
        let p = (s0 * h1 + s1 * h0) / (h0 + h1);
        let t = (signf(s0) + signf(s1)) * s0.abs().min(s1.abs()).min(0.5 * p.abs());
        m[i] = if t.is_finite() { t } else { 0.0 };
    }
    m[0] = (3.0 * sec[0] - m[1]) / 2.0;
    m[n - 1] = (3.0 * sec[n - 2] - m[n - 2]) / 2.0;

    let mut line = format!("M {:.2} {:.2}", px[0], py[0]);
    let mut fill = format!("M {:.2} 100 L {:.2} {:.2}", px[0], px[0], py[0]);
    for i in 0..n - 1 {
        let dx = (px[i + 1] - px[i]) / 3.0;
        let seg = format!(
            " C {:.2} {:.2} {:.2} {:.2} {:.2} {:.2}",
            px[i] + dx,
            py[i] + dx * m[i],
            px[i + 1] - dx,
            py[i + 1] - dx * m[i + 1],
            px[i + 1],
            py[i + 1],
        );
        line.push_str(&seg);
        fill.push_str(&seg);
    }
    fill.push_str(&format!(" L {:.2} 100 Z", px[n - 1]));
    (fill, line)
}

/// Wall-clock HH:MM:SS (UTC) for the top-bar readout.
fn clock() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        % 86_400;
    format!("{:02}:{:02}:{:02}", secs / 3600, (secs % 3600) / 60, secs % 60)
}

// --- persisted settings ---------------------------------------------------

struct Settings {
    currency_idx: usize,
    num_charts: usize,
}

impl Settings {
    fn path() -> std::path::PathBuf {
        let base = std::env::var_os("XDG_CONFIG_HOME")
            .map(std::path::PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".config")))
            .unwrap_or_else(|| std::path::PathBuf::from("."));
        base.join("EmbeddedDemos").join("SlintCharts.conf")
    }

    fn load(reset: bool) -> Settings {
        let default = Settings {
            currency_idx: 0,
            num_charts: sim::MAX_STOCKS,
        };
        let path = Self::path();
        if reset {
            let _ = std::fs::remove_file(&path);
            return default;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            return default;
        };
        let mut lines = text.lines();
        let currency_idx = lines
            .next()
            .and_then(|s| CURRENCIES.iter().position(|c| *c == s))
            .unwrap_or(0);
        let num_charts = lines
            .next()
            .and_then(|s| s.trim().parse::<usize>().ok())
            .unwrap_or(sim::MAX_STOCKS)
            .clamp(1, sim::MAX_STOCKS);
        Settings {
            currency_idx,
            num_charts,
        }
    }

    fn from(s: &State) -> Settings {
        Settings {
            currency_idx: s.currency_idx,
            num_charts: s.num_charts,
        }
    }

    fn save(&self) {
        let path = Self::path();
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(
            &path,
            format!("{}\n{}\n", CURRENCIES[self.currency_idx], self.num_charts),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_produces_sane_finite_series() {
        let mut e = Engine::new();
        for _ in 0..200 {
            e.tick(sim::MAX_STOCKS);
        }
        let mut mid = [0.0; HISTORY_LEN];
        let mut bid = [0.0; HISTORY_LEN];
        let mut ask = [0.0; HISTORY_LEN];
        for s in 0..sim::MAX_STOCKS {
            e.series(s, &mut mid, &mut bid, &mut ask);
            for k in 0..HISTORY_LEN {
                assert!(mid[k].is_finite() && mid[k] > 0.0);
                // bid below mid below ask (a real spread).
                assert!(bid[k] <= mid[k] && mid[k] <= ask[k]);
            }
        }
        // The sweep wraps in [0, 1).
        assert!(e.sweep_pos >= 0.0 && e.sweep_pos < 1.0);
    }

    #[test]
    fn paths_are_well_formed_and_in_viewbox() {
        // A gently rising series.
        let ys: Vec<f64> = (0..HISTORY_LEN).map(|i| 100.0 + i as f64).collect();
        let y_lo = 90.0;
        let y_range = 80.0;
        let (fill, line) = paths(&ys, y_lo, y_range);

        assert!(line.starts_with("M 0.00"));
        // One initial M + (n-1) cubic segments for the line.
        assert_eq!(line.matches(" C ").count(), HISTORY_LEN - 1);
        // The fill is a closed area down to the baseline.
        assert!(fill.starts_with("M 0.00 100"));
        assert!(fill.trim_end().ends_with("Z"));

        // Every on-curve Y the line passes through must sit inside the 0..100
        // view box (a rising series maps to descending Y, never clipped).
        for tok in line.split_whitespace() {
            if let Ok(v) = tok.parse::<f64>() {
                assert!((-1.0..=101.0).contains(&v), "coord {v} out of view box");
            }
        }
    }
}
