//! Per-chart Canvas2D drawing. Ports StockChart.tsx:114-261 (geometry, Y-range
//! hysteresis, line/area paths, grid + axis labels, numeric readouts).

use crate::layout::Rect;
use crate::sim::{Sim, HISTORY_LEN, SYMBOLS};
use crate::state::YCache;
use web_sys::CanvasRenderingContext2d;

// Palette (matches the original dark theme).
const BG: &str = "#1a1f29";
const BORDER: &str = "#2d3748";
const TEXT: &str = "#e6e8eb";
const MUTED: &str = "#6b7280";
const VALUE_MUTED: &str = "#9ca3af";
const GREEN: &str = "#10b981";
const RED: &str = "#ef4444";
const BLUE: &str = "#3b82f6";
const ASK_FILL: &str = "rgba(16,185,129,0.12)";
const BID_FILL: &str = "rgba(239,68,68,0.12)";

// Cell band heights (CSS px).
const HEADER_H: f64 = 22.0;
const DATA_H: f64 = 30.0;
const FOOTER_H: f64 = 18.0;

// Plot padding inside the chart band.
const PAD_L: f64 = 4.0;
const PAD_R: f64 = 30.0;
const PAD_T: f64 = 4.0;
const PAD_B: f64 = 14.0;

const X_TICK_IDX: [usize; 4] = [0, 15, 30, 45];

pub fn draw_chart(
    ctx: &CanvasRenderingContext2d,
    rect: Rect,
    sim: &Sim,
    s: usize,
    currency: &str,
    yc: &mut YCache,
    enlarged: bool,
) {
    // --- cell background + border ---
    ctx.set_fill_style_str(BG);
    ctx.fill_rect(rect.x, rect.y, rect.w, rect.h);
    ctx.set_stroke_style_str(BORDER);
    ctx.set_line_width(1.0);
    let _ = ctx.set_line_dash(&js_sys::Array::new());
    ctx.stroke_rect(rect.x + 0.5, rect.y + 0.5, rect.w - 1.0, rect.h - 1.0);

    // --- single pass over the ring buffer (StockChart.tsx:114-130) ---
    let head = sim.head[s];
    let base = s * HISTORY_LEN;
    let mut mids = [0.0f64; HISTORY_LEN];
    let mut bids = [0.0f64; HISTORY_LEN];
    let mut asks = [0.0f64; HISTORY_LEN];
    let (mut high, mut low) = (f64::NEG_INFINITY, f64::INFINITY);
    let (mut y_min, mut y_max) = (f64::INFINITY, f64::NEG_INFINITY);
    for i in 0..HISTORY_LEN {
        let idx = base + (head + i) % HISTORY_LEN;
        let a = sim.ask[idx];
        let b = sim.bid[idx];
        let m = sim.mid[idx];
        if a > high { high = a; }
        if b < low { low = b; }
        if a > y_max { y_max = a; }
        if b < y_min { y_min = b; }
        mids[i] = m;
        bids[i] = b;
        asks[i] = a;
    }

    // --- Y-range with lazy re-snap / hysteresis (StockChart.tsx:137-142) ---
    if yc.hi <= yc.lo || y_min < yc.lo || y_max > yc.hi {
        let data_range = if y_max - y_min != 0.0 {
            y_max - y_min
        } else {
            (y_max * 0.001).max(1e-6)
        };
        yc.lo = y_min - data_range;
        yc.hi = y_max + data_range;
    }
    let (y_lo, y_hi) = (yc.lo, yc.hi);
    let y_range = if y_hi - y_lo != 0.0 { y_hi - y_lo } else { 1.0 };

    let cur_mid = mids[HISTORY_LEN - 1];
    let cur_bid = bids[HISTORY_LEN - 1];
    let cur_ask = asks[HISTORY_LEN - 1];
    let first_mid = mids[0];
    let change = if first_mid != 0.0 { (cur_mid - first_mid) / first_mid * 100.0 } else { 0.0 };
    let change_color = if change >= 0.0 { GREEN } else { RED };

    // --- header: symbol + %change ---
    ctx.set_text_baseline("middle");
    ctx.set_fill_style_str(TEXT);
    ctx.set_font("600 11px ui-monospace, monospace");
    ctx.set_text_align("left");
    let _ = ctx.fill_text(SYMBOLS[s], rect.x + 8.0, rect.y + HEADER_H * 0.5);
    ctx.set_fill_style_str(change_color);
    ctx.set_font("600 10px ui-monospace, monospace");
    ctx.set_text_align("right");
    let _ = ctx.fill_text(
        &format!("{}{:.3}%", if change >= 0.0 { "+" } else { "" }, change),
        rect.x + rect.w - 8.0,
        rect.y + HEADER_H * 0.5,
    );
    separator(ctx, rect.x, rect.y + HEADER_H, rect.w);

    // --- data row: BID / MID / ASK / HIGH / LOW ---
    let data_y = rect.y + HEADER_H;
    let cols = [
        ("BID", cur_bid, RED),
        ("MID", cur_mid, TEXT),
        ("ASK", cur_ask, GREEN),
        ("HIGH", high, VALUE_MUTED),
        ("LOW", low, VALUE_MUTED),
    ];
    let col_w = rect.w / 5.0;
    ctx.set_text_align("left");
    for (i, (label, value, color)) in cols.iter().enumerate() {
        let cx = rect.x + col_w * i as f64 + 6.0;
        ctx.set_fill_style_str(MUTED);
        ctx.set_font("9px ui-monospace, monospace");
        let _ = ctx.fill_text(label, cx, data_y + 9.0);
        ctx.set_fill_style_str(color);
        ctx.set_font("600 9px ui-monospace, monospace");
        let _ = ctx.fill_text(&format!("{:.3}", value), cx, data_y + 21.0);
    }
    separator(ctx, rect.x, data_y + DATA_H, rect.w);

    // --- chart band ---
    let chart_top = data_y + DATA_H;
    let chart_h = rect.h - HEADER_H - DATA_H - FOOTER_H;
    let plot_l = rect.x + PAD_L;
    let plot_r = rect.x + rect.w - PAD_R;
    let plot_t = chart_top + PAD_T;
    let plot_b = chart_top + chart_h - PAD_B;
    let plot_w = (plot_r - plot_l).max(1.0);
    let plot_h = (plot_b - plot_t).max(1.0);

    // fill chart band background (slightly darker than card)
    ctx.set_fill_style_str("#0f1419");
    ctx.fill_rect(rect.x + 1.0, chart_top, rect.w - 2.0, chart_h);

    let x_px = |i: usize| plot_l + plot_w * (i as f64 / (HISTORY_LEN as f64 - 1.0));
    let y_px = |v: f64| plot_t + plot_h * (1.0 - (v - y_lo) / y_range);

    // ask area (fill to baseline), then bid area on top
    fill_area(ctx, &asks, plot_b, &x_px, &y_px, ASK_FILL);
    fill_area(ctx, &bids, plot_b, &x_px, &y_px, BID_FILL);
    // stroked lines: ask, bid, mid
    stroke_line(ctx, &asks, &x_px, &y_px, GREEN, 1.0);
    stroke_line(ctx, &bids, &x_px, &y_px, RED, 1.0);
    stroke_line(ctx, &mids, &x_px, &y_px, BLUE, if enlarged { 2.0 } else { 1.5 });

    // --- grid + axis labels (ChartOverlay) ---
    draw_grid(ctx, plot_l, plot_t, plot_w, plot_h, y_lo, y_hi);

    // --- footer: CCY / SPR / UPD ---
    let foot_y = rect.y + rect.h - FOOTER_H;
    separator(ctx, rect.x, foot_y, rect.w);
    ctx.set_font("8px ui-monospace, monospace");
    ctx.set_text_align("left");
    let foot_cols = [
        format!("CCY: {}", currency),
        format!("SPR: ${:.4}", cur_ask - cur_bid),
        "UPD: 5Hz".to_string(),
    ];
    let fcw = rect.w / 3.0;
    for (i, t) in foot_cols.iter().enumerate() {
        ctx.set_fill_style_str(MUTED);
        let _ = ctx.fill_text(t, rect.x + fcw * i as f64 + 6.0, foot_y + FOOTER_H * 0.5);
    }
}

fn separator(ctx: &CanvasRenderingContext2d, x: f64, y: f64, w: f64) {
    ctx.set_stroke_style_str(BORDER);
    ctx.set_line_width(1.0);
    let _ = ctx.set_line_dash(&js_sys::Array::new());
    ctx.begin_path();
    ctx.move_to(x, y + 0.5);
    ctx.line_to(x + w, y + 0.5);
    ctx.stroke();
}

fn stroke_line(
    ctx: &CanvasRenderingContext2d,
    pts: &[f64; HISTORY_LEN],
    x_px: &dyn Fn(usize) -> f64,
    y_px: &dyn Fn(f64) -> f64,
    color: &str,
    width: f64,
) {
    ctx.set_stroke_style_str(color);
    ctx.set_line_width(width);
    let _ = ctx.set_line_dash(&js_sys::Array::new());
    ctx.begin_path();
    for i in 0..HISTORY_LEN {
        let (px, py) = (x_px(i), y_px(pts[i]));
        if i == 0 { ctx.move_to(px, py); } else { ctx.line_to(px, py); }
    }
    ctx.stroke();
}

fn fill_area(
    ctx: &CanvasRenderingContext2d,
    pts: &[f64; HISTORY_LEN],
    baseline: f64,
    x_px: &dyn Fn(usize) -> f64,
    y_px: &dyn Fn(f64) -> f64,
    fill: &str,
) {
    ctx.set_fill_style_str(fill);
    ctx.begin_path();
    ctx.move_to(x_px(0), baseline);
    for i in 0..HISTORY_LEN {
        ctx.line_to(x_px(i), y_px(pts[i]));
    }
    ctx.line_to(x_px(HISTORY_LEN - 1), baseline);
    ctx.close_path();
    ctx.fill();
}

fn draw_grid(
    ctx: &CanvasRenderingContext2d,
    plot_l: f64,
    plot_t: f64,
    plot_w: f64,
    plot_h: f64,
    y_lo: f64,
    y_hi: f64,
) {
    let y_range = if y_hi - y_lo != 0.0 { y_hi - y_lo } else { 1.0 };
    let y_to_px = |v: f64| plot_t + plot_h * (1.0 - (v - y_lo) / y_range);
    let x_to_px = |idx: usize| plot_l + plot_w * (idx as f64 / (HISTORY_LEN as f64 - 1.0));
    let y_vals = [
        y_lo,
        y_lo + y_range * 0.25,
        y_lo + y_range * 0.5,
        y_lo + y_range * 0.75,
        y_hi,
    ];

    // dashed grid lines
    ctx.set_stroke_style_str(BORDER);
    ctx.set_global_alpha(0.4);
    ctx.set_line_width(1.0);
    let dash = js_sys::Array::new();
    dash.push(&3.0.into());
    dash.push(&3.0.into());
    let _ = ctx.set_line_dash(&dash);
    ctx.begin_path();
    for v in y_vals.iter() {
        let y = y_to_px(*v);
        ctx.move_to(plot_l, y);
        ctx.line_to(plot_l + plot_w, y);
    }
    for idx in X_TICK_IDX.iter() {
        let x = x_to_px(*idx);
        ctx.move_to(x, plot_t);
        ctx.line_to(x, plot_t + plot_h);
    }
    ctx.stroke();
    ctx.set_global_alpha(1.0);

    // solid axis lines (right + bottom)
    let _ = ctx.set_line_dash(&js_sys::Array::new());
    ctx.set_stroke_style_str(BORDER);
    ctx.begin_path();
    ctx.move_to(plot_l + plot_w, plot_t);
    ctx.line_to(plot_l + plot_w, plot_t + plot_h);
    ctx.move_to(plot_l, plot_t + plot_h);
    ctx.line_to(plot_l + plot_w, plot_t + plot_h);
    ctx.stroke();

    // tick labels
    ctx.set_fill_style_str(MUTED);
    ctx.set_font("8px ui-monospace, monospace");
    ctx.set_text_baseline("middle");
    ctx.set_text_align("left");
    for v in y_vals.iter() {
        let _ = ctx.fill_text(&format!("{:.1}", v), plot_l + plot_w + 4.0, y_to_px(*v));
    }
    ctx.set_text_align("center");
    for idx in X_TICK_IDX.iter() {
        let _ = ctx.fill_text(
            &format!("{}s", HISTORY_LEN - *idx),
            x_to_px(*idx),
            plot_t + plot_h + 8.0,
        );
    }
}
