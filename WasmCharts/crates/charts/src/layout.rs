//! Responsive grid layout. Mirrors the Tailwind grid in StockGrid.tsx
//! (grid-cols-2 sm:3 md:4 lg:5 xl:6) with gap-2 p-2 (8px).

#[derive(Clone, Copy)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}
impl Rect {
    pub fn contains(&self, px: f64, py: f64) -> bool {
        px >= self.x && px < self.x + self.w && py >= self.y && py < self.y + self.h
    }
}

const GAP: f64 = 8.0;
const PAD: f64 = 8.0;

fn columns_for(width: f64) -> usize {
    // Tailwind default breakpoints: sm 640, md 768, lg 1024, xl 1280.
    if width >= 1280.0 {
        6
    } else if width >= 1024.0 {
        5
    } else if width >= 768.0 {
        4
    } else if width >= 640.0 {
        3
    } else {
        2
    }
}

/// Cell height in the grid. The original cards are content-sized (~170px) with a
/// 96px chart; we approximate a fixed row height so cards keep that compact look.
const ROW_H: f64 = 188.0;

/// Lay out `n` cells in the available area. Returns one Rect per cell.
pub fn grid_rects(width: f64, _height: f64, n: usize) -> Vec<Rect> {
    let cols = columns_for(width).min(n.max(1));
    let inner_w = (width - 2.0 * PAD - GAP * (cols as f64 - 1.0)).max(1.0);
    let cell_w = inner_w / cols as f64;
    let mut rects = Vec::with_capacity(n);
    for i in 0..n {
        let r = i / cols;
        let c = i % cols;
        rects.push(Rect {
            x: PAD + c as f64 * (cell_w + GAP),
            y: PAD + r as f64 * (ROW_H + GAP),
            w: cell_w,
            h: ROW_H,
        });
    }
    rects
}

/// Total content height the grid needs for `n` cells at this width — the host
/// sizes the (scrollable) canvas to this so rows below the fold aren't clipped.
pub fn grid_content_height(width: f64, n: usize) -> f64 {
    let cols = columns_for(width).min(n.max(1));
    let rows = (n + cols - 1) / cols;
    PAD + rows as f64 * (ROW_H + GAP)
}

/// The single enlarged chart rect for the detail view.
pub fn detail_rect(width: f64, height: f64) -> Rect {
    Rect { x: PAD, y: PAD, w: width - 2.0 * PAD, h: height - 2.0 * PAD }
}
