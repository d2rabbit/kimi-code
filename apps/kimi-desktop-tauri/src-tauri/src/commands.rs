// commands.rs — Tauri commands exposed to the Svelte frontend via IPC.
//
// These wrap the Rust-side daemon management and native capabilities.
// Business data (REST + WS) flows directly from the WebView to the daemon;
// Tauri IPC is reserved for native-only operations.

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::agent::{agent_home, start_embedded_agent, StartAgentOptions};
use crate::daemon::kimi_home;

/// On-disk filename of the daemon's persistent bearer token (under the agent home).
const SERVER_TOKEN_FILE: &str = "server.token";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureServerResult {
    /// Embedded agent origin, e.g. "http://127.0.0.1:58731" (ephemeral port).
    pub origin: String,
}

/// Start (or return the running) app-owned embedded agent and return its origin.
///
/// Called once on app startup. The agent is a private child process with its
/// own KIMI_CODE_HOME (~/.kimi-code/desktop) and an ephemeral port — never a
//  shared/foreign daemon. Emits `daemon:ready` with the origin.
///
/// `log_level` overrides the daemon's Pino log level (default `info`; one of
/// fatal|error|warn|info|debug|trace|silent). `debug_endpoints` mounts the
/// `/api/v1/debug/*` introspection routes. Both are read from env vars set by
/// `build-run.sh` so testers can tune diagnostics without rebuilding Rust:
///   KIMI_DESKTOP_LOG_LEVEL=debug
///   KIMI_DESKTOP_DEBUG_ENDPOINTS=1
#[tauri::command]
pub async fn ensure_server(app: AppHandle) -> Result<EnsureServerResult, String> {
    let opts = StartAgentOptions {
        log_level: std::env::var("KIMI_DESKTOP_LOG_LEVEL")
            .unwrap_or_else(|_| "info".to_string()),
        debug_endpoints: std::env::var("KIMI_DESKTOP_DEBUG_ENDPOINTS").as_deref() == Ok("1"),
    };
    let origin = start_embedded_agent(&app, opts).await?;
    let _ = app.emit("daemon:ready", &origin);
    Ok(EnsureServerResult { origin })
}

/// Read the embedded agent's bearer token so the frontend can authenticate
/// without showing the manual token dialog on a fresh launch.
/// Returns null when the token cannot be read (frontend falls back to the dialog).
#[tauri::command]
pub fn read_server_token() -> Option<String> {
    let token_path = agent_home().join(SERVER_TOKEN_FILE);
    match fs::read_to_string(&token_path) {
        Ok(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
        }
        Err(_) => None,
    }
}

/// Return the embedded agent's log file path (for the "Open server log" menu item).
#[tauri::command]
pub fn get_server_log_path() -> String {
    agent_home()
        .join("server")
        .join("server.log")
        .to_string_lossy()
        .into_owned()
}

// ---- Desktop renderer log --------------------------------------------------
// Appended to <agent home>/logs/kimi-code-desktop.log — the exact path the
// daemon's session export reads when the client passes `desktop: true`
// (packages/agent-core-v2/src/app/sessionExport/sessionExportService.ts).

/// On-disk filename of the desktop app log bundled into session exports.
const DESKTOP_LOG_FILE: &str = "kimi-code-desktop.log";
/// Rotate once the log grows past this size; one previous generation is kept.
const DESKTOP_LOG_MAX_BYTES: u64 = 4 * 1024 * 1024;

/// Resolve the desktop app log path (<agent home>/logs/kimi-code-desktop.log).
pub fn desktop_log_path() -> PathBuf {
    agent_home().join("logs").join(DESKTOP_LOG_FILE)
}

/// Append renderer log lines to the desktop app log. Each entry becomes exactly
/// one line (embedded newlines are flattened so a crafted message cannot forge
/// log entries). Best-effort diagnostics — the frontend swallows failures.
#[tauri::command]
pub fn append_desktop_log(lines: Vec<String>) -> Result<(), String> {
    if lines.is_empty() {
        return Ok(());
    }
    let path = desktop_log_path();
    let dir = path.parent().ok_or("desktop log path has no parent")?;
    fs::create_dir_all(dir).map_err(|e| format!("create desktop log dir: {e}"))?;
    if let Ok(meta) = fs::metadata(&path) {
        if meta.len() > DESKTOP_LOG_MAX_BYTES {
            let _ = fs::rename(&path, dir.join(format!("{DESKTOP_LOG_FILE}.1")));
        }
    }
    use std::io::Write as _;
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open desktop log: {e}"))?;
    let mut out = String::new();
    for line in &lines {
        out.push_str(&line.replace(['\r', '\n'], " "));
        out.push('\n');
    }
    f.write_all(out.as_bytes())
        .map_err(|e| format!("write desktop log: {e}"))
}

// ---- Git helpers (branch list / checkout, driven by the GitTree panel) ----

/// Run `git` in `cwd` and return stdout on success.
fn run_git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("spawn git: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "git {:?} failed ({}): {}",
            args,
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// List local branches of the repo at `cwd` (current first).
#[tauri::command]
pub fn list_git_branches(cwd: String) -> Result<Vec<String>, String> {
    let out = run_git(&cwd, &["branch", "--format=%(refname:short)"])?;
    let current = run_git(&cwd, &["branch", "--show-current"]).unwrap_or_default();
    let current = current.trim().to_string();
    let mut branches: Vec<String> = out
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    branches.retain(|b| b != &current);
    if !current.is_empty() {
        branches.insert(0, current);
    }
    Ok(branches)
}

/// Checkout a branch in the repo at `cwd`.
#[tauri::command]
pub fn git_checkout(cwd: String, branch: String) -> Result<(), String> {
    if branch.trim().is_empty()
        || branch.contains("..")
        || branch.starts_with('-')
        || branch.contains(' ')
    {
        return Err(format!("invalid branch name: {branch}"));
    }
    run_git(&cwd, &["checkout", branch.trim()])?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub relative_time: String,
    pub subject: String,
}

/// Return a compact commit timeline for the repository at `cwd`.
#[tauri::command]
pub fn git_log(cwd: String, limit: Option<u32>) -> Result<Vec<GitCommit>, String> {
    let limit = limit.unwrap_or(20).clamp(1, 100).to_string();
    let out = run_git(
        &cwd,
        &[
            "log",
            "--no-decorate",
            "--date=relative",
            "--format=%H%x1f%h%x1f%an%x1f%ar%x1f%s%x1e",
            "-n",
            &limit,
        ],
    )?;
    Ok(out
        .split('\x1e')
        .filter_map(|record| {
            let fields: Vec<&str> = record.trim().split('\x1f').collect();
            if fields.len() != 5 || fields[0].is_empty() {
                return None;
            }
            Some(GitCommit {
                hash: fields[0].to_string(),
                short_hash: fields[1].to_string(),
                author: fields[2].to_string(),
                relative_time: fields[3].to_string(),
                subject: fields[4].to_string(),
            })
        })
        .collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitFile {
    pub path: String,
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
    pub diff: String,
}

/// Return the changed files and compact patches for a commit.
#[tauri::command]
pub fn git_commit_files(cwd: String, hash: String) -> Result<Vec<GitCommitFile>, String> {
    if hash.is_empty() || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("invalid commit hash".to_string());
    }
    let names = run_git(&cwd, &["diff-tree", "--root", "--no-commit-id", "--name-status", "-r", &hash])?;
    let mut files = Vec::new();
    for line in names.lines().filter(|line| !line.trim().is_empty()) {
        let mut parts = line.splitn(2, '\t');
        let status = parts.next().unwrap_or("?").to_string();
        let path = parts.next().unwrap_or("").to_string();
        if path.is_empty() {
            continue;
        }
        let diff = run_git(&cwd, &["show", "--format=", "--no-ext-diff", "--unified=3", &hash, "--", &path])?;
        let additions = diff.lines().filter(|line| line.starts_with('+') && !line.starts_with("+++")).count() as u32;
        let deletions = diff.lines().filter(|line| line.starts_with('-') && !line.starts_with("---")).count() as u32;
        files.push(GitCommitFile { path, status, additions, deletions, diff });
    }
    Ok(files)
}

// ---- Window controls (platform-adapted) ----
// These are implemented in Rust because the JS-side window API is not
// reliable across platforms (e.g. `hide()` availability). Close behavior is
// adapted per platform: on Linux/Windows the app is tray-resident, so
// "close" hides to the tray; on macOS custom traffic lights are not rendered
// at all (native overlay owns the semantics).

#[tauri::command]
pub fn win_minimize(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.minimize().map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn win_toggle_maximize(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        let maximized = w.is_maximized().map_err(|e| e.to_string())?;
        if maximized {
            w.unmaximize().map_err(|e| e.to_string())
        } else {
            w.maximize().map_err(|e| e.to_string())
        }
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn win_close(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        // Tray-resident on Linux/Windows: close = hide to tray (quit lives in
        // the tray menu, matching the macOS convention).
        #[cfg(not(target_os = "macos"))]
        {
            w.hide().map_err(|e| e.to_string())
        }
        #[cfg(target_os = "macos")]
        {
            w.close().map_err(|e| e.to_string())
        }
    } else {
        Ok(())
    }
}

/// Set the main window title (e.g. to the active session name).
#[tauri::command]
pub fn set_window_title(app: AppHandle, title: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_title(&title).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
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
// File read/write for AGENTS.md memory management
// ---------------------------------------------------------------------------

/// Read a text file (e.g. AGENTS.md) from an absolute path.
/// Returns the file content as a string, or an error if the file doesn't exist.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    stdfs::read_to_string(&path).map_err(|e| format!("Cannot read file {path}: {e}"))
}

/// Write text content to a file (e.g. AGENTS.md) at an absolute path.
/// Creates the file if it doesn't exist, overwrites if it does.
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    stdfs::write(&path, &content).map_err(|e| format!("Cannot write file {path}: {e}"))
}

// ---------------------------------------------------------------------------
// Plugin management (read installed.json + manifests from ~/.kimi-code/plugins/)
// ---------------------------------------------------------------------------

/// Information about an installed plugin, assembled from installed.json + the
/// plugin's own manifest (kimi.plugin.json or package.json).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub id: String,
    pub root: String,
    pub source: String,
    pub enabled: bool,
    pub installed_at: String,
    pub original_source: String,
    /// Display name from the manifest (falls back to id).
    pub display_name: String,
    /// Version from the manifest (falls back to "unknown").
    pub version: String,
    /// Description from the manifest.
    pub description: String,
    /// Developer/publisher name.
    pub developer: String,
    /// Whether this plugin provides MCP servers.
    pub has_mcp: bool,
    /// Number of bundled skills (`<root>/skills/*` directories).
    pub skill_count: u32,
    /// Number of bundled commands (`<root>/commands/*` entries).
    pub command_count: u32,
}

/// Count entries inside `<root>/<subdir>` (dirs and files both count; missing
/// dir → 0). Used for the plugin bundle chips (N 技能 / N 命令).
fn count_subdir_entries(root: &str, subdir: &str) -> u32 {
    let dir = std::path::PathBuf::from(root).join(subdir);
    match stdfs::read_dir(&dir) {
        Ok(entries) => entries.flatten().count() as u32,
        Err(_) => 0,
    }
}

/// Read and parse the installed plugins registry + manifests.
///
/// Plugin install / enable / disable / remove all go through the daemon REST
/// API (`/plugins*`), and the embedded daemon's registry lives under the
/// AGENT home (`~/.kimi-code/desktop/plugins/`) — so the list must read from
/// there to show the same set the daemon reports. The shared CLI home is only
/// a fallback for plugins seeded there before the agent home existed.
#[tauri::command]
pub fn list_installed_plugins() -> Result<Vec<PluginInfo>, String> {
    let shared_plugins_dir = kimi_home().join("plugins");
    let shared_installed = shared_plugins_dir.join("installed.json");
    let desktop_plugins_dir = agent_home().join("plugins");
    let desktop_installed = desktop_plugins_dir.join("installed.json");

    // Prefer the agent-home registry (where the daemon REST API writes).
    // Fall back to the shared CLI home, then to an empty list — never
    // hard-error so the panel can render a "no plugins installed" state
    // instead of a crash.
    let installed_path = if desktop_installed.exists() {
        desktop_installed
    } else if shared_installed.exists() {
        shared_installed
    } else {
        return Ok(Vec::new());
    };

    let installed_content = stdfs::read_to_string(&installed_path)
        .map_err(|e| format!("Cannot read installed.json: {e}"))?;

    let installed: serde_json::Value = serde_json::from_str(&installed_content)
        .map_err(|e| format!("Cannot parse installed.json: {e}"))?;

    let plugins_arr = installed.get("plugins")
        .and_then(|v| v.as_array())
        .ok_or("installed.json has no 'plugins' array")?;

    let mut result = Vec::new();
    for entry in plugins_arr {
        let id = entry.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let root = entry.get("root").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let source = entry.get("source").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
        let enabled = entry.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
        let installed_at = entry.get("installedAt").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let original_source = entry.get("originalSource").and_then(|v| v.as_str()).unwrap_or("").to_string();

        // Try to read the manifest for richer metadata.
        let mut display_name = id.clone();
        let mut version = "unknown".to_string();
        let mut description = String::new();
        let mut developer = String::new();
        let mut has_mcp = false;

        // Try kimi.plugin.json first.
        let kimi_manifest = std::path::PathBuf::from(&root).join("kimi.plugin.json");
        if let Ok(content) = stdfs::read_to_string(&kimi_manifest) {
            if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(name) = manifest.get("interface").and_then(|v| v.get("displayName")).and_then(|v| v.as_str()) {
                    display_name = name.to_string();
                } else if let Some(name) = manifest.get("name").and_then(|v| v.as_str()) {
                    display_name = name.to_string();
                }
                if let Some(v) = manifest.get("version").and_then(|v| v.as_str()) {
                    version = v.to_string();
                }
                if let Some(desc) = manifest.get("description").and_then(|v| v.as_str()) {
                    description = desc.to_string();
                } else if let Some(desc) = manifest.get("interface").and_then(|v| v.get("shortDescription")).and_then(|v| v.as_str()) {
                    description = desc.to_string();
                }
                if let Some(dev) = manifest.get("interface").and_then(|v| v.get("developerName")).and_then(|v| v.as_str()) {
                    developer = dev.to_string();
                }
                if manifest.get("mcpServers").is_some() {
                    has_mcp = true;
                }
            }
        }

        // Fall back to package.json.
        if version == "unknown" {
            let pkg_path = std::path::PathBuf::from(&root).join("package.json");
            if let Ok(content) = stdfs::read_to_string(&pkg_path) {
                if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(name) = pkg.get("name").and_then(|v| v.as_str()) {
                        if display_name == id { display_name = name.to_string(); }
                    }
                    if let Some(v) = pkg.get("version").and_then(|v| v.as_str()) {
                        version = v.to_string();
                    }
                    if description.is_empty() {
                        if let Some(desc) = pkg.get("description").and_then(|v| v.as_str()) {
                            description = desc.to_string();
                        }
                    }
                }
            }
        }

        let skill_count = count_subdir_entries(&root, "skills");
        let command_count = count_subdir_entries(&root, "commands");

        result.push(PluginInfo {
            id,
            root,
            source,
            enabled,
            installed_at,
            original_source,
            display_name,
            version,
            description,
            developer,
            has_mcp,
            skill_count,
            command_count,
        });
    }

    // Sort by display name for stable rendering.
    result.sort_by(|a, b| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()));
    Ok(result)
}

// ---------------------------------------------------------------------------
// Dock badge / taskbar overlay (unread session count)
// ---------------------------------------------------------------------------

/// Resolve the codegraph CLI binary. Priority:
///   1. Bundled codegraph at <resource_dir>/codegraph/bin/codegraph
///      (staged by scripts/stage-codegraph.sh — 34MB, ships with the app)
///   2. System codegraph on PATH (user-installed via curl|bash)
///   3. Error (caller treats as 'not installed, skip silently')
///
/// The bundled launcher script uses the project's Node runtime, so users
/// don't need to install Node or codegraph separately — it just works.
fn resolve_codegraph_cli() -> Result<std::path::PathBuf, String> {
    let bin_name = if cfg!(windows) { "codegraph.exe" } else { "codegraph" };

    // 1. Try bundled (Tauri resource dir). In dev mode we use CARGO_MANIFEST_DIR
    //    to find the unstaged copy under src-tauri/resources/.
    let is_dev = cfg!(debug_assertions)
        || std::env::var("KIMI_DESKTOP_DEV").as_deref() == Ok("1");

    if is_dev {
        let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("codegraph")
            .join("bin")
            .join(bin_name);
        if dev_path.exists() {
            return Ok(dev_path);
        }
    } else {
        // Packaged: try common resource_dir locations. Tauri bundles
        // resources/ under the app's resource directory.
        if let Ok(home) = std::env::var("HOME") {
            let candidates = [
                // Linux: /usr/lib/<app>/resources/codegraph/bin/codegraph
                std::path::PathBuf::from(&home)
                    .join(".local/share")
                    .join("ai.moonshot.kimi.desktop.tauri"),
                // macOS: app bundle Resources/
                std::path::PathBuf::from(&home)
                    .join("Library/Application Support/ai.moonshot.kimi.desktop.tauri"),
            ];
            for base in &candidates {
                let codegraph_bin = base
                    .join("codegraph")
                    .join("bin")
                    .join(bin_name);
                if codegraph_bin.exists() {
                    return Ok(codegraph_bin);
                }
            }
        }
    }

    // 2. Fallback: system PATH
    which::which(bin_name).map_err(|_| {
        "codegraph not found (neither bundled nor on PATH)".to_string()
    })
}

/// Update the codegraph index for the project at `cwd`. Called automatically
/// by the frontend whenever a session transitions to idle (task complete),
/// so the index reflects whatever file changes the agent just made.
///
/// Strategy:
///   1. If `<cwd>/.codegraph/` exists → run `codegraph sync <cwd>` (incremental)
///   2. Otherwise → run `codegraph init <cwd>` (first-time index build)
///   3. If `codegraph` is not installed → return Ok(()) silently (the hook
///      is opt-in; users without codegraph shouldn't see errors)
///
/// Runs in a detached child so the agent UI doesn't block on indexing
/// (which can take seconds on large repos). Returns a status string for
/// the frontend toast.
#[tauri::command]
pub async fn update_codegraph_index(cwd: String) -> Result<String, String> {
    let project_path = std::path::PathBuf::from(&cwd);
    if !project_path.is_dir() {
        return Err(format!("project directory does not exist: {cwd}"));
    }
    let codegraph_bin = match resolve_codegraph_cli() {
        Ok(p) => p,
        Err(_) => {
            // codegraph not installed — silent no-op (the hook is opt-in).
            return Ok("codegraph not installed (skipped)".to_string());
        }
    };

    let needs_init = !project_path.join(".codegraph").is_dir();
    let subcmd = if needs_init { "init" } else { "sync" };

    // Run with --quiet to keep stdout clean (frontend just needs the exit
    // status). Time out after 5 minutes so a stuck index build doesn't
    // hold the task pool forever.
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(300),
        tokio::process::Command::new(&codegraph_bin)
            .arg(subcmd)
            .arg(&project_path)
            .arg("--quiet")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output(),
    )
    .await
    .map_err(|_| format!("codegraph {subcmd} timed out after 5 minutes"))?
    .map_err(|e| format!("Failed to spawn codegraph {subcmd}: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        // Don't surface codegraph failures as errors — they're often
        // 'language not supported' or 'already up to date' non-issues.
        return Ok(format!("codegraph {subcmd}: {stderr}"));
    }
    Ok(format!(
        "codegraph {} done for {}",
        subcmd,
        project_path.display()
    ))
}

/// Set the macOS Dock badge (or Windows taskbar overlay) to show the number
/// of unread sessions. Pass 0 to clear.
#[tauri::command]
pub fn set_badge_count(app: AppHandle, count: u32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if count == 0 {
            let _ = window.set_badge_count(None);
        } else {
            // Cap at 99 to avoid overly wide badges.
            let badge = if count > 99 { 99 } else { count as i64 };
            let _ = window.set_badge_count(Some(badge));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Skill file management (filesystem CRUD)
// ---------------------------------------------------------------------------
// The daemon does NOT expose REST endpoints for creating/editing/deleting
// skills — only list + activate. These commands operate directly on the
// filesystem under ~/.kimi-code/skills/ to provide a GUI management layer.

use std::fs as stdfs;

/// The embedded agent's skills directory: <agent-home>/skills/
/// (Kept in sync with what the embedded agent serves.)
fn user_skills_dir() -> PathBuf {
    agent_home().join("skills")
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

#[cfg(test)]
mod desktop_log_tests {
    use super::*;

    /// append_desktop_log writes to <agent home>/logs/kimi-code-desktop.log —
    /// the exact file the daemon's session export bundles on `desktop: true`.
    /// KIMI_CODE_HOME drives both kimi_home() and (transitively) agent_home().
    /// Single test function: env mutation is process-global and must not race.
    #[test]
    fn append_desktop_log_lifecycle() {
        let tmp = tempfile::tempdir().unwrap();
        // SAFETY: assertions in this crate touching KIMI_CODE_HOME live in
        // this one test, so no concurrent readers exist.
        unsafe { std::env::set_var("KIMI_CODE_HOME", tmp.path()) };

        // Write + newline flattening.
        append_desktop_log(vec![
            "2026-07-27T00:00:00.000Z ERROR [renderer] first".to_string(),
            "line with\nembedded\r\nnewlines".to_string(),
        ])
        .unwrap();
        let path = desktop_log_path();
        assert!(path.ends_with("logs/kimi-code-desktop.log"), "path: {path:?}");
        let content = std::fs::read_to_string(&path).unwrap();
        assert_eq!(
            content,
            "2026-07-27T00:00:00.000Z ERROR [renderer] first\nline with embedded  newlines\n"
        );

        // Append preserves existing content; empty batch is a no-op.
        append_desktop_log(vec!["second batch".to_string()]).unwrap();
        append_desktop_log(vec![]).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.ends_with("second batch\n"));

        // Rotation: an oversized log moves to .1 and the write starts fresh.
        std::fs::write(&path, "x".repeat((DESKTOP_LOG_MAX_BYTES + 1) as usize)).unwrap();
        append_desktop_log(vec!["after rotation".to_string()]).unwrap();
        let rotated = path.with_file_name("kimi-code-desktop.log.1");
        assert!(rotated.exists(), "previous generation should be kept");
        let content = std::fs::read_to_string(&path).unwrap();
        assert_eq!(content, "after rotation\n");

        unsafe { std::env::remove_var("KIMI_CODE_HOME") };
    }
}
