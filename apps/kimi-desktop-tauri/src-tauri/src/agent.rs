// agent.rs — app-owned embedded Kimi agent (private server process).
//
// Spawns the bundled SEA (`kimi server run --foreground`) as a long-lived
// child process bound to the app lifecycle. Uses an ISOLATED KIMI_CODE_HOME
// (~/.kimi-code/desktop) so it never contends with the shared CLI daemon for
// the server lock / token / sessions, and an ephemeral loopback port instead
// of the well-known 58627. The desktop client must never attach to a foreign
// daemon: the agent starts with the app and dies with it.

use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

use crate::sea_path::resolve_sea_path;

const HEALTH_TIMEOUT: Duration = Duration::from_secs(20);
const HEALTH_POLL: Duration = Duration::from_millis(200);

/// Private home of the embedded agent (private lock/token/sessions).
/// Nested under the shared kimi-code home so everything stays in one place,
/// while remaining fully isolated from the shared daemon's lock file.
pub fn agent_home() -> PathBuf {
    crate::daemon::kimi_home().join("desktop")
}

/// State held in Tauri's managed state: the running embedded agent child.
pub struct AgentProcess {
    child: tokio::process::Child,
    pub origin: String,
}

pub struct AgentState(pub Mutex<Option<AgentProcess>>);

/// Reserve an ephemeral loopback port (never the shared 58627).
fn pick_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .map_err(|e| format!("failed to reserve ephemeral port: {e}"))
}

/// Seed/backfill: copy user-level data from the shared CLI home so the
/// embedded agent sees the user's real providers, models, sessions, plugins
/// and MCP config — instead of a blank slate. Idempotent per item: an item
/// is only copied when missing on the desktop side (never overwrites data the
/// desktop user has since created).
fn seed_agent_home_if_needed(home: &Path) -> Result<(), String> {
    std::fs::create_dir_all(home).map_err(|e| format!("create agent home: {e}"))?;
    let shared = crate::daemon::kimi_home();
    if shared == home {
        return Ok(());
    }
    // Never seed the server lock/token/device identity: those belong to the
    // owning process/install. Sessions/config/plugins are user data and are
    // carried over via this one-time-per-item copy.
    for item in [
        "config.toml",
        "mcp.json",
        "sessions",
        "plugins",
        "skills",
        "agents",
        "user-history",
    ] {
        let src = shared.join(item);
        let dst = home.join(item);
        if src.exists() && !dst.exists() {
            copy_recursively(&src, &dst)?;
        }
    }
    seed_session_index(&shared, home)?;
    Ok(())
}

/// Merge the shared session_index.jsonl into the desktop home, REWRITING each
/// entry's sessionDir from the shared home to the desktop home.
///
/// Why a rewrite instead of a plain copy or letting reindex() rebuild:
/// - index entries record ABSOLUTE sessionDir paths; the daemon drops any
///   entry outside <home>/sessions, so a plain copy surfaces zero sessions;
/// - the daemon's boot-time reindex() cannot recover old sessions whose
///   state.json predates the workDir field (recoverWorkDir returns undefined),
///   so without the index these sessions are invisible.
/// Entries are appended only when missing (by sessionId) and only if the
/// rewritten sessionDir actually exists on disk.
fn seed_session_index(shared: &Path, home: &Path) -> Result<(), String> {
    let src = shared.join("session_index.jsonl");
    if !src.exists() {
        return Ok(());
    }
    let dst = home.join("session_index.jsonl");
    let shared_sessions = shared.join("sessions");
    let home_sessions = home.join("sessions");

    let existing_raw = std::fs::read_to_string(&dst).unwrap_or_default();
    let mut existing_ids = std::collections::HashSet::new();
    for line in existing_raw.lines() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(id) = v.get("sessionId").and_then(|x| x.as_str()) {
                existing_ids.insert(id.to_string());
            }
        }
    }

    let raw = std::fs::read_to_string(&src)
        .map_err(|e| format!("read shared session index: {e}"))?;
    let mut out = String::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(mut v) = serde_json::from_str::<serde_json::Value>(trimmed) else {
            continue;
        };
        let Some(id) = v.get("sessionId").and_then(|x| x.as_str()).map(|x| x.to_string()) else {
            continue;
        };
        if existing_ids.contains(&id) {
            continue;
        }
        let Some(dir) = v.get("sessionDir").and_then(|x| x.as_str()).map(|x| x.to_string()) else {
            continue;
        };
        let Some(suffix) = dir.strip_prefix(shared_sessions.to_string_lossy().as_ref()) else {
            continue;
        };
        let rewritten = format!("{}{}", home_sessions.to_string_lossy(), suffix);
        if !std::path::Path::new(&rewritten).is_dir() {
            continue;
        }
        v["sessionDir"] = serde_json::Value::String(rewritten);
        existing_ids.insert(id);
        out.push_str(&v.to_string());
        out.push('\n');
    }
    if !out.is_empty() {
        use std::io::Write as _;
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&dst)
            .map_err(|e| format!("open desktop session index: {e}"))?;
        f.write_all(out.as_bytes())
            .map_err(|e| format!("write desktop session index: {e}"))?;
    }
    Ok(())
}

fn copy_recursively(src: &Path, dst: &Path) -> Result<(), String> {
    if src.is_dir() {
        std::fs::create_dir_all(dst).map_err(|e| format!("create {}: {e}", dst.display()))?;
        let entries = std::fs::read_dir(src).map_err(|e| format!("read {}: {e}", src.display()))?;
        for entry in entries.flatten() {
            copy_recursively(&entry.path(), &dst.join(entry.file_name()))?;
        }
    } else {
        std::fs::copy(src, dst).map_err(|e| format!("copy {}: {e}", src.display()))?;
    }
    Ok(())
}

/// Spawn options for the embedded agent. Defaults favour diagnosability:
/// `info`-level logging so turn processing / model calls / MCP connections
/// land in `<home>/server/server.log` — the previous `error` default left
/// `turn.started → <silence>` failures invisible.
pub struct StartAgentOptions {
    /// Pino log level passed via `--log-level`. Defaults to `info`.
    pub log_level: String,
    /// Mount `/api/v1/debug/*` introspection routes. Defaults to off.
    pub debug_endpoints: bool,
}

impl Default for StartAgentOptions {
    fn default() -> Self {
        Self {
            log_level: "info".to_string(),
            debug_endpoints: false,
        }
    }
}

/// Spawn (or return the running) embedded agent; resolves once healthy.
///
/// `opts` only apply to a freshly-spawned agent; a reused live child keeps
/// its original flags. To change log level at runtime, restart the app.
pub async fn start_embedded_agent(
    app: &AppHandle,
    opts: StartAgentOptions,
) -> Result<String, String> {
    let state = app.state::<AgentState>();
    let mut guard = state.0.lock().await;

    // Reuse the live child when present; respawn if it died.
    if let Some(proc) = guard.as_mut() {
        match proc.child.try_wait() {
            Ok(None) => return Ok(proc.origin.clone()),
            _ => *guard = None,
        }
    }

    let sea = resolve_sea_path(app)?;
    let port = pick_port()?;
    let home = agent_home();
    seed_agent_home_if_needed(&home)?;
    let cors_origins = if cfg!(debug_assertions) {
        "http://tauri.localhost,tauri://localhost,http://localhost:1420,http://127.0.0.1:1420"
    } else {
        "http://tauri.localhost,tauri://localhost"
    };

    let mut cmd = tokio::process::Command::new(&sea);
    cmd.args([
        "server",
        "run",
        "--foreground",
        "--port",
        &port.to_string(),
        "--log-level",
        &opts.log_level,
    ]);
    if opts.debug_endpoints {
        cmd.arg("--debug-endpoints");
    }

    let mut child = cmd
        .env("KIMI_CODE_HOME", &home)
        // The WebView runs on Tauri's custom protocol (tauri.localhost), which
        // is cross-origin to the agent's 127.0.0.1 origin. The daemon's CORS
        // middleware is whitelist-based (KIMI_CODE_CORS_ORIGINS), so whitelist
        // both spellings for REST + WS to work from the WebView.
        .env("KIMI_CODE_CORS_ORIGINS", cors_origins)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("spawn embedded agent {}: {e}", sea.display()))?;

    let origin = format!("http://127.0.0.1:{port}");
    let deadline = Instant::now() + HEALTH_TIMEOUT;
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Err(format!("embedded agent exited early: {status}"));
        }
        if crate::daemon::is_healthy(&origin, Duration::from_millis(500)).await {
            break;
        }
        if Instant::now() > deadline {
            let _ = child.kill().await;
            return Err(format!(
                "embedded agent at {origin} did not become healthy within {:?}",
                HEALTH_TIMEOUT
            ));
        }
        tokio::time::sleep(HEALTH_POLL).await;
    }

    *guard = Some(AgentProcess {
        child,
        origin: origin.clone(),
    });
    Ok(origin)
}

/// Kill the embedded agent on app exit (tray quit included). Best-effort:
/// `kill_on_drop` on the child also covers us when the state is dropped.
pub fn stop_embedded_agent(app: &AppHandle) {
    if let Some(state) = app.try_state::<AgentState>() {
        if let Ok(mut guard) = state.0.try_lock() {
            if let Some(mut proc) = guard.take() {
                let _ = proc.child.start_kill();
            }
        }
    }
}
