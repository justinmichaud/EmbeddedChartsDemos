//! The whole application: simulation + layout + drawing + state, all in Rust.
//! JS only creates the canvas, pumps events, and runs the rAF loop.

mod draw;
mod layout;
mod sim;
mod state;

use layout::Rect;
use sim::{Sim, MAX_STOCKS, NEWS_HEADLINES, REFRESH_MS, SYMBOLS};

// Sweep advances one discrete step per tick (only when new data arrives),
// completing a cycle every 10s — matches JSChartsFast's worker sweep.
const SWEEP_STEP: f64 = REFRESH_MS / 10_000.0;
use state::{Settings, View, YCache};
use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement};

#[wasm_bindgen]
pub struct Engine {
    ctx: CanvasRenderingContext2d,
    css_w: f64,
    css_h: f64,
    dpr: f64,
    sim: Sim,
    settings: Settings,
    view: View,
    y_caches: Vec<YCache>,
    last_tick_ms: f64,
    sweep_pos: f64,
    lag: bool,
    dirty: bool,
}

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<Engine, JsValue> {
        #[cfg(feature = "console_error_panic_hook")]
        console_error_panic_hook::set_once();

        let ctx = canvas
            .get_context("2d")?
            .ok_or_else(|| JsValue::from_str("no 2d context"))?
            .dyn_into::<CanvasRenderingContext2d>()?;

        Ok(Engine {
            ctx,
            css_w: canvas.width() as f64,
            css_h: canvas.height() as f64,
            dpr: 1.0,
            sim: Sim::new(),
            settings: Settings::default(),
            view: View::Grid,
            y_caches: vec![YCache::default(); MAX_STOCKS],
            last_tick_ms: f64::NEG_INFINITY,
            sweep_pos: 0.0,
            lag: false,
            dirty: true,
        })
    }

    /// Sets the backing-store size for crisp HiDPI rendering and scales the
    /// context so all drawing uses CSS pixels.
    pub fn resize(&mut self, css_w: f64, css_h: f64, dpr: f64) {
        self.css_w = css_w;
        self.css_h = css_h;
        self.dpr = dpr;
        let canvas = self.ctx.canvas().unwrap();
        canvas.set_width((css_w * dpr).round() as u32);
        canvas.set_height((css_h * dpr).round() as u32);
        let _ = self.ctx.set_transform(dpr, 0.0, 0.0, dpr, 0.0, 0.0);
        self.dirty = true;
    }

    /// Host rAF loop calls this every frame. Advances the sim at 5 Hz and
    /// repaints only when something changed.
    pub fn frame(&mut self, now_ms: f64) {
        if self.last_tick_ms.is_infinite() {
            self.last_tick_ms = now_ms;
        }
        if now_ms - self.last_tick_ms >= REFRESH_MS {
            self.sim.tick(self.settings.num_charts);
            self.sweep_pos = (self.sweep_pos + SWEEP_STEP) % 1.0;
            self.last_tick_ms = now_ms;
            self.dirty = true;
            if self.lag {
                // Artificial main-thread lag (the demo's TOGGLE_LAG, now on-thread).
                let mut sum = 0.0f64;
                for i in 0..50_000_000u64 {
                    sum += (i as f64).sqrt();
                }
                if sum < 0.0 {
                    self.dirty = false; // never taken; defeats dead-code elimination
                }
            }
        }
        if self.dirty {
            self.render();
            self.dirty = false;
        }
    }

    fn render(&mut self) {
        // clear whole canvas
        self.ctx.set_fill_style_str("#0f1419");
        self.ctx.fill_rect(0.0, 0.0, self.css_w, self.css_h);

        match self.view {
            View::Grid => {
                let rects = self.grid_rects();
                for (i, rect) in rects.iter().enumerate() {
                    draw::draw_chart(
                        &self.ctx,
                        *rect,
                        &self.sim,
                        i,
                        &self.settings.currency,
                        &mut self.y_caches[i],
                        false,
                    );
                }
            }
            View::Detail(s) => {
                let rect = layout::detail_rect(self.css_w, self.css_h);
                draw::draw_chart(
                    &self.ctx,
                    rect,
                    &self.sim,
                    s,
                    &self.settings.currency,
                    &mut self.y_caches[s],
                    true,
                );
            }
        }
    }

    /// Pointer down in CSS-pixel canvas coords. Negative coords (or any click in
    /// detail view) returns to the grid; a grid click opens that chart's detail.
    pub fn pointer_down(&mut self, x: f64, y: f64) {
        match self.view {
            View::Detail(_) => {
                self.view = View::Grid;
                self.dirty = true;
            }
            View::Grid => {
                if x < 0.0 || y < 0.0 {
                    return;
                }
                if let Some(s) = self.hit_test(x, y) {
                    self.view = View::Detail(s);
                    self.dirty = true;
                }
            }
        }
    }

    pub fn set_currency(&mut self, c: &str) {
        if c != self.settings.currency {
            self.settings.currency = c.to_string();
            self.dirty = true;
        }
    }

    pub fn set_num_charts(&mut self, n: u32) {
        let n = (n as usize).clamp(2, MAX_STOCKS);
        if n != self.settings.num_charts {
            self.settings.num_charts = n;
            if let View::Detail(s) = self.view {
                if s >= n {
                    self.view = View::Grid;
                }
            }
            self.dirty = true;
        }
    }

    pub fn toggle_lag(&mut self) {
        self.lag = !self.lag;
    }

    pub fn view(&self) -> u8 {
        match self.view {
            View::Grid => 0,
            View::Detail(_) => 1,
        }
    }

    pub fn current_news(&self) -> String {
        NEWS_HEADLINES[self.sim.news_index()].to_string()
    }

    /// Sweep cycle position in [0,1). Advances one step per tick, so the host
    /// can drive the CSS sweep line that moves only when new data arrives.
    pub fn sweep_pos(&self) -> f64 {
        self.sweep_pos
    }

    /// The 3 most recent headlines, newest first — for the NEWSFEED panel
    /// (mirrors NewsView.tsx, which shows newsIndex and the two before it).
    pub fn news_lines(&self) -> Vec<String> {
        let n = NEWS_HEADLINES.len();
        let idx = self.sim.news_index();
        (0..3)
            .map(|off| NEWS_HEADLINES[(idx + n - off) % n].to_string())
            .collect()
    }

    pub fn symbol_at(&self, x: f64, y: f64) -> Option<String> {
        self.hit_test(x, y).map(|s| SYMBOLS[s].to_string())
    }

    /// Content height the grid needs at `width` for the current chart count, so
    /// the host can size the scrollable canvas (0 in detail view = use viewport).
    pub fn grid_height(&self, width: f64) -> f64 {
        match self.view {
            View::Grid => layout::grid_content_height(width, self.settings.num_charts),
            View::Detail(_) => 0.0,
        }
    }

    /// FNV-1a hash of a sparse pixel sample — lets tests assert the canvas is
    /// live (changing) without pulling the whole bitmap across the boundary.
    pub fn debug_pixel_hash(&self) -> u32 {
        let w = (self.css_w * self.dpr) as u32;
        let h = (self.css_h * self.dpr) as u32;
        if w == 0 || h == 0 {
            return 0;
        }
        let mut hash: u32 = 2166136261;
        if let Ok(img) = self.ctx.get_image_data(0.0, 0.0, w as f64, h as f64) {
            let data = img.data();
            // sample every 997th byte (prime) to keep it cheap
            let mut i = 0usize;
            while i < data.len() {
                hash ^= data[i] as u32;
                hash = hash.wrapping_mul(16777619);
                i += 997;
            }
        }
        hash
    }

    // --- helpers ---
    fn grid_rects(&self) -> Vec<Rect> {
        layout::grid_rects(self.css_w, self.css_h, self.settings.num_charts)
    }

    fn hit_test(&self, x: f64, y: f64) -> Option<usize> {
        self.grid_rects()
            .iter()
            .position(|r| r.contains(x, y))
    }
}
