// commands.rs — Tauri commands exposed to the Svelte frontend via IPC.
//
// These wrap the Rust-side daemon management and native capabilities.
// Business data (REST + WS) flows directly from the WebView to the daemon;
// Tauri IPC is reserved for native-only operations.

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::AppHandle;

use crate::daemon::{ensure_daemon, kimi_home, server_log_path, EnsureResult};
use crate::sea_path::resolve_sea_path;

/// On-disk filename of the daemon's persistent bearer token (under KIMI_CODE_HOME).
const SERVER_TOKEN_FILE: &str = "server.token";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureServerResult {
    /// Daemon origin, e.g. "http://127.0.0.1:58627".
    pub origin: String,
}

/// Start (or reuse) the shared Kimi daemon and return its origin.
///
/// Called once on app startup. Emits a `daemon:status` event with either
/// `{ ok: true, origin }` or `{ ok: false, error }` so the frontend can
/// render loading / error screens.
#[tauri::command]
pub async fn ensure_server(app: AppHandle) -> Result<EnsureServerResult, String> {
    let sea_path = resolve_sea_path(&app)?;
    let EnsureResult { origin } = ensure_daemon(&sea_path).await?;
    let _ = app.emit("daemon:ready", &origin);
    Ok(EnsureServerResult { origin })
}

/// Read the daemon's bearer token so the frontend can authenticate without
/// showing the manual token dialog on a fresh launch.
/// Returns null when the token cannot be read (frontend falls back to the dialog).
#[tauri::command]
pub fn read_server_token() -> Option<String> {
    let token_path = kimi_home().join(SERVER_TOKEN_FILE);
    match fs::read_to_string(&token_path) {
        Ok(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
        }
        Err(_) => None,
    }
}

/// Return the daemon log file path (for the "Open server log" menu item).
#[tauri::command]
pub fn get_server_log_path() -> String {
    server_log_path().to_string_lossy().into_owned()
}

/// Open a file or folder in the system's default application.
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("Failed to open {path}: {e}"))
}

/// Resolve the kimi-code home directory (useful for the frontend to build paths).
#[tauri::command]
pub fn get_kimi_home() -> String {
    kimi_home().to_string_lossy().into_owned()
}
