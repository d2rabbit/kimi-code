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

/// Open a URL or file path in the system's default application.
/// URLs must use http/https; file paths are opened as-is (Tauri IPC is only
/// reachable from our own WebView, so the attack surface is limited, but we
/// still validate to prevent accidental shell injection on Windows).
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    // Allow only http(s) URLs and local file paths; reject anything that
    // looks like a command (e.g. "cmd /c ..." on Windows).
    let trimmed = path.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        open::that(trimmed).map_err(|e| format!("Failed to open URL: {e}"))
    } else if trimmed.starts_with('/')
        || trimmed.starts_with('\\')
        || trimmed.chars().nth(1) == Some(':')
    {
        // Looks like a file path (Unix absolute, Windows drive letter, or UNC).
        open::that(trimmed).map_err(|e| format!("Failed to open path: {e}"))
    } else {
        Err(format!("Refused to open (not a URL or absolute path): {trimmed}"))
    }
}

/// Resolve the kimi-code home directory (useful for the frontend to build paths).
#[tauri::command]
pub fn get_kimi_home() -> String {
    kimi_home().to_string_lossy().into_owned()
}

// ---------------------------------------------------------------------------
// Skill file management (filesystem CRUD)
// ---------------------------------------------------------------------------
// The daemon does NOT expose REST endpoints for creating/editing/deleting
// skills — only list + activate. These commands operate directly on the
// filesystem under ~/.kimi-code/skills/ to provide a GUI management layer.

use std::fs as stdfs;

/// The user-level skills directory: <KIMI_CODE_HOME>/skills/
fn user_skills_dir() -> PathBuf {
    kimi_home().join("skills")
}

/// List user-level skills by scanning <home>/skills/ for SKILL.md files.
/// Returns a list of { name, path, content } for each skill found.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFileInfo {
    pub name: String,
    /// Absolute path to the SKILL.md file.
    pub path: String,
    /// Full file content (frontmatter + body).
    pub content: String,
}

#[tauri::command]
pub fn list_user_skills() -> Result<Vec<SkillFileInfo>, String> {
    let dir = user_skills_dir();
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut skills = Vec::new();
    let entries = stdfs::read_dir(&dir).map_err(|e| format!("Cannot read skills dir: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = if path.is_dir() {
            // Directory form: <name>/SKILL.md
            let skill_file = path.join("SKILL.md");
            if !skill_file.exists() {
                continue;
            }
            // Skip unreadable files instead of aborting the entire list.
            let content = match stdfs::read_to_string(&skill_file) {
                Ok(c) => c,
                Err(_) => continue,
            };
            SkillFileInfo {
                name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                path: skill_file.to_string_lossy().into_owned(),
                content,
            }
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            // Flat form: <name>.md
            let content = match stdfs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let name = path
                .file_stem()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            // Skip SKILL.md at the top level (not a skill itself)
            if name.eq_ignore_ascii_case("SKILL") {
                continue;
            }
            SkillFileInfo {
                name,
                path: path.to_string_lossy().into_owned(),
                content,
            }
        } else {
            continue;
        };
        skills.push(name);
    }
    // Deterministic order for stable UI rendering.
    skills.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(skills)
}

/// Create or overwrite a skill file.
/// Writes to <home>/skills/<name>/SKILL.md (directory form).
#[tauri::command]
pub fn write_user_skill(name: String, content: String) -> Result<String, String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Skill name cannot be empty".into());
    }
    // Validate name: no path separators, no dots (avoid directory traversal).
    if trimmed_name.contains('/') || trimmed_name.contains('\\') || trimmed_name.contains("..") {
        return Err("Invalid skill name".into());
    }
    let skill_dir = user_skills_dir().join(trimmed_name);
    stdfs::create_dir_all(&skill_dir).map_err(|e| format!("Cannot create skill dir: {e}"))?;
    let skill_path = skill_dir.join("SKILL.md");
    stdfs::write(&skill_path, &content)
        .map_err(|e| format!("Cannot write skill file: {e}"))?;
    Ok(skill_path.to_string_lossy().into_owned())
}

/// Delete a user-level skill (removes the entire <name>/ directory or <name>.md file).
#[tauri::command]
pub fn delete_user_skill(name: String) -> Result<(), String> {
    let trimmed_name = name.trim();
    if trimmed_name.contains('/') || trimmed_name.contains('\\') || trimmed_name.contains("..") {
        return Err("Invalid skill name".into());
    }
    let skill_dir = user_skills_dir().join(trimmed_name);
    if skill_dir.exists() {
        stdfs::remove_dir_all(&skill_dir)
            .map_err(|e| format!("Cannot delete skill directory: {e}"))?;
        return Ok(());
    }
    // Try flat form
    let flat = user_skills_dir().join(format!("{trimmed_name}.md"));
    if flat.exists() {
        stdfs::remove_file(&flat)
            .map_err(|e| format!("Cannot delete skill file: {e}"))?;
        return Ok(());
    }
    Err(format!("Skill '{trimmed_name}' not found"))
}
