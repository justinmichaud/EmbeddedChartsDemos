// Headless screenshot tool: renders the real MainWindow with the software
// renderer (no compositor needed) and writes a PPM. Used to eyeball the layout
// in environments where no screen-capture tool is available.
//
//   cargo run --example shot -- /tmp/slint_shot.ppm
use std::rc::Rc;

use slint::platform::software_renderer::{
    MinimalSoftwareWindow, PremultipliedRgbaColor, RepaintBufferType,
};
use slint::platform::{Platform, PlatformError, WindowAdapter};
use slint::{ModelRc, PhysicalSize, VecModel};
use slintcharts::{build_cards, news_lines, sim, MainWindow};

struct SwPlatform {
    window: Rc<MinimalSoftwareWindow>,
}
impl Platform for SwPlatform {
    fn create_window_adapter(&self) -> Result<Rc<dyn WindowAdapter>, PlatformError> {
        Ok(self.window.clone())
    }
}

fn main() {
    let window = MinimalSoftwareWindow::new(RepaintBufferType::ReusedBuffer);
    slint::platform::set_platform(Box::new(SwPlatform {
        window: window.clone(),
    }))
    .unwrap();

    let app = MainWindow::new().unwrap();

    let mut ystate = vec![(0.0, 0.0); sim::MAX_STOCKS];
    let mut engine = sim::Engine::new();
    for _ in 0..40 {
        engine.tick(sim::MAX_STOCKS);
    }
    app.set_cards(ModelRc::from(Rc::new(VecModel::from(build_cards(
        &engine, 50, &mut ystate,
    )))));
    app.set_news(ModelRc::from(Rc::new(VecModel::from(news_lines(&engine)))));
    app.set_currency("USD".into());
    app.set_fps(42);
    app.set_clock("12:34:56".into());

    let (w, h) = (1280u32, 860u32);
    window.set_size(PhysicalSize::new(w, h));
    window.request_redraw();
    let mut buf = vec![
        PremultipliedRgbaColor { red: 0, green: 0, blue: 0, alpha: 0 };
        (w * h) as usize
    ];
    window.draw_if_needed(|r| {
        r.render(&mut buf, w as usize);
    });

    let path = std::env::args().nth(1).unwrap_or_else(|| "/tmp/slint_shot.ppm".into());
    let mut out = format!("P6\n{w} {h}\n255\n").into_bytes();
    for p in &buf {
        let a = p.alpha as u32;
        let un = |c: u8| -> u8 {
            if a == 0 {
                0
            } else {
                ((c as u32 * 255) / a).min(255) as u8
            }
        };
        out.push(un(p.red));
        out.push(un(p.green));
        out.push(un(p.blue));
    }
    std::fs::write(&path, out).unwrap();
    eprintln!("wrote {path} ({w}x{h})");
}
