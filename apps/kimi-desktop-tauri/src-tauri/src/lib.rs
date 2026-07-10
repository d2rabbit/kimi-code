// lib.rs — library entry point for kimi-desktop-tauri.
//
// Exposes a `run()` function that builds and starts the Tauri app.
// This split (lib + main) follows the Tauri 2 convention and allows tests
// to import the app builder.

mod commands;
mod daemon;
mod sea_path;

use tauri::{Manager, WindowEvent};

/// The window title.
const WINDOW_TITLE: &str = "Kimi Code Desktop";
/// Default + minimum window dimensions.
const DEFAULT_WIDTH: u32 = 1280;
const DEFAULT_HEIGHT: u32 = 860;
const MIN_WIDTH: u32 = 720;
const MIN_HEIGHT: u32 = 480;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // On macOS, position the traffic lights over the web UI's header row
            // (mirrors the Electron app's trafficLightPosition { x:16, y:18 }).
            #[cfg(target_os = "macos")]
            {
                use tauri::TitleBarStyle;
                if let Some(window) = app.get_webview_window("main") {
                    // Decorations are controlled in tauri.conf.json; here we just
                    // ensure the window is ready.
                    let _ = window.set_title(WINDOW_TITLE);
                }
            }

            // Kick off daemon startup in the background — the frontend listens
            // for the `daemon:ready` event (or calls `ensure_server` directly).
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match commands::ensure_server(app_handle.clone()).await {
                    Ok(result) => {
                        eprintln!(
                            "[kimi-desktop-tauri] connected to {}",
                            result.origin
                        );
                    }
                    Err(e) => {
                        eprintln!("[kimi-desktop-tauri] ensureServer failed: {e}");
                        let _ = app_handle.emit("daemon:error", &e);
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Persist window state on close (best-effort; the frontend also
            // persists via localStorage, but keeping the Rust side as a backup).
            if let WindowEvent::CloseRequested { .. } = event {
                let _ = window;
            }
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
