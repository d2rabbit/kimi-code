// lib.rs — library entry point for kimi-desktop-tauri.
//
// Exposes a `run()` function that builds and starts the Tauri app.
// This split (lib + main) follows the Tauri 2 convention and allows tests
// to import the app builder.

mod commands;
mod daemon;
mod sea_path;

use tauri::Manager;

/// The window title.
const WINDOW_TITLE: &str = "Kimi Code Desktop";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_title(WINDOW_TITLE);
                }
            }

            // The frontend calls `ensure_server` directly on mount. We do NOT
            // spawn a duplicate background call here — that would race with the
            // frontend's invoke and risk double-forking the daemon. The
            // frontend's daemon store handles the full lifecycle.
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ensure_server,
            commands::read_server_token,
            commands::get_server_log_path,
            commands::open_path,
            commands::get_kimi_home,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
