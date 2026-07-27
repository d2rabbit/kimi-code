// lib.rs — library entry point for kimi-desktop-tauri.
//
// Exposes a `run()` function that builds and starts the Tauri app.
// This split (lib + main) follows the Tauri 2 convention and allows tests
// to import the app builder.
//
// Native desktop features:
// - System tray: minimize-to-tray, show/hide window, quit
// - Global shortcut: Cmd/Ctrl+Shift+K toggles window visibility
// - Window state persistence: save/restore position, size, maximized state

mod agent;
mod commands;
mod daemon;
mod sea_path;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// The window title — only used by the macOS startup block below (the
/// title-bar overlay window carries no title on its own). Gated so the
/// constant isn't flagged dead_code on Linux/Windows.
#[cfg(target_os = "macos")]
const WINDOW_TITLE: &str = "Kimi Code Desktop";
/// Path to the window state file (under KIMI_CODE_HOME).
const WINDOW_STATE_FILE: &str = "window-state.json";

/// Register the MCP debug plugin on the builder in debug builds.
///
/// Kept as a separate function so the release path does not introduce a
/// spurious `mut` binding (which would trigger `unused_mut` since the
/// conditional reassignment only happens under `#[cfg(debug_assertions)]`).
#[cfg(debug_assertions)]
fn install_mcp_debug_plugin(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.plugin(tauri_plugin_mcp::init_with_config(
        tauri_plugin_mcp::PluginConfig::new("Kimi Code Desktop".to_string())
            .start_socket_server(true)
            .socket_path(std::path::PathBuf::from("/tmp/tauri-mcp.sock")),
    ))
}

#[cfg(not(debug_assertions))]
fn install_mcp_debug_plugin(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder // release: no MCP plugin
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init());

    // MCP debug plugin — debug builds only. Release builds ship without it
    // (and without the tauri_plugin_mcp dependency in the public Cargo.toml).
    let builder = install_mcp_debug_plugin(builder);

    builder
        .setup(|app| {
            // App-owned embedded agent state (spawned lazily by ensure_server).
            app.manage(agent::AgentState(tokio::sync::Mutex::new(None)));

            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_title(WINDOW_TITLE);
                }
            }

            // --- Restore window state (position + size + maximized) ---
            restore_window_state(app);

            // --- System tray ---
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "隐藏到托盘", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Kimi Code Desktop")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Double-click (or single-click on some platforms) toggles window.
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // --- Global shortcut: Cmd/Ctrl+Shift+K toggles window ---
            // Non-fatal: if the hotkey is already registered by another app
            // (common on Linux desktop environments), log and continue.
            let app_handle = app.handle().clone();
            let _ = app.global_shortcut()
                .on_shortcut("Super+Shift+K", move |_app, _shortcut, _event| {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Save window state on close.
            if let WindowEvent::CloseRequested { .. } = event {
                save_window_state(window);
            }
            // On macOS, closing the window hides it instead of quitting (so the
            // tray still works). The user can quit from the tray menu.
            #[cfg(target_os = "macos")]
            {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::ensure_server,
            commands::read_server_token,
            commands::get_server_log_path,
            commands::append_desktop_log,
            commands::open_path,
            commands::set_window_title,
            commands::win_minimize,
            commands::win_toggle_maximize,
            commands::win_close,
            commands::list_git_branches,
            commands::git_checkout,
            commands::git_log,
            commands::git_commit_files,
            commands::get_kimi_home,
            commands::read_text_file,
            commands::write_text_file,
            commands::list_installed_plugins,
            commands::update_codegraph_index,
            commands::set_badge_count,
            commands::list_user_skills,
            commands::write_user_skill,
            commands::delete_user_skill,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // The embedded agent is a private child process: it dies with the app.
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                agent::stop_embedded_agent(app_handle);
            }
        });
}

// ---------------------------------------------------------------------------
// Window state persistence
// ---------------------------------------------------------------------------

use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Serialize, Deserialize)]
struct WindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    maximized: bool,
}

fn state_file_path() -> std::path::PathBuf {
    let home = if let Ok(dir) = std::env::var("KIMI_CODE_HOME") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            std::path::PathBuf::from(trimmed)
        } else {
            dirs::home_dir().unwrap_or_default().join(".kimi-code")
        }
    } else {
        dirs::home_dir().unwrap_or_default().join(".kimi-code")
    };
    home.join(WINDOW_STATE_FILE)
}

fn restore_window_state(app: &tauri::App) {
    let path = state_file_path();
    let Ok(content) = fs::read_to_string(&path) else {
        return;
    };
    let Ok(state) = serde_json::from_str::<WindowState>(&content) else {
        return;
    };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_size(tauri::LogicalSize::new(state.width, state.height));
        let _ = window.set_position(tauri::LogicalPosition::new(state.x, state.y));
        if state.maximized {
            let _ = window.maximize();
        }
    }
}

fn save_window_state(window: &tauri::Window) {
    let Some(scale) = window.scale_factor().ok() else {
        return;
    };
    let Ok(physical_pos) = window.outer_position() else {
        return;
    };
    let Ok(physical_size) = window.outer_size() else {
        return;
    };
    let maximized = window.is_maximized().unwrap_or(false);

    // Convert physical to logical coordinates.
    let state = WindowState {
        width: (physical_size.width as f64 / scale) as u32,
        height: (physical_size.height as f64 / scale) as u32,
        x: (physical_pos.x as f64 / scale) as i32,
        y: (physical_pos.y as f64 / scale) as i32,
        maximized,
    };

    let path = state_file_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(&state) {
        let _ = fs::write(&path, json);
    }
}
