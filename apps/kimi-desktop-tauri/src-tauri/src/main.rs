// main.rs — binary entry point. Delegates to the library's `run()`.
// Prevents additional windows on macOS (standard Tauri 2 pattern).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kimi_desktop_tauri_lib::run()
}
