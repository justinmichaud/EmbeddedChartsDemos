// Thin binary entry point; all logic lives in the library crate so the
// headless screenshot tool (examples/shot.rs) can reuse the UI + data code.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    slintcharts::run();
}
