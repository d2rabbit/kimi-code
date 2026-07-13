// daemon.rs — ensure the shared Kimi Code daemon is running.
//
// Translated from apps/kimi-desktop/src/main/ensure-server.ts.
// The desktop app participates in the same local-server ecosystem as the CLI,
// browser, and TUI: it reuses a running daemon or starts one the others can
// reuse — never a private, app-only server.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::Deserialize;

/// Overall budget for the bundled `kimi server run` to finish ensuring a daemon.
const RUN_TIMEOUT: Duration = Duration::from_secs(30);
/// How long to keep polling `/healthz` before declaring the daemon unhealthy.
const HEALTH_TIMEOUT: Duration = Duration::from_secs(20);
const HEALTH_POLL: Duration = Duration::from_millis(200);

/// Subset of the server lock JSON we read (apps/kimi-code writes the full shape).
/// snake_case to match the on-disk format.
#[derive(Debug, Deserialize)]
struct LockContents {
    pid: i64,
    #[serde(default)]
    host: Option<String>,
    port: u16,
}

/// `<KIMI_CODE_HOME>` or `~/.kimi-code` — must match the server's `resolveKimiHome`.
pub fn kimi_home() -> PathBuf {
    if let Ok(dir) = std::env::var("KIMI_CODE_HOME") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    dirs::home_dir()
        .map(|h| h.join(".kimi-code"))
        .unwrap_or_else(|| PathBuf::from("~/.kimi-code"))
}

/// Path to the daemon lock file.
fn lock_path() -> PathBuf {
    kimi_home().join("server").join("lock")
}

/// Path to the daemon log file (surfaced in the error screen / menu).
pub fn server_log_path() -> PathBuf {
    kimi_home().join("server").join("server.log")
}

/// Read and parse the lock file. Returns None if missing or unparseable.
fn read_lock() -> Option<LockContents> {
    let content = std::fs::read_to_string(lock_path()).ok()?;
    let lock: LockContents = serde_json::from_str(&content).ok()?;
    Some(lock)
}

/// Build the daemon origin (http://host:port) from a parsed lock.
/// `0.0.0.0` and missing host both resolve to `127.0.0.1`.
fn origin_from_lock(lock: &LockContents) -> String {
    let host = match &lock.host {
        Some(h) if h != "0.0.0.0" => h.as_str(),
        _ => "127.0.0.1",
    };
    format!("http://{host}:{}", lock.port)
}

/// Poll `/api/v1/healthz` once with a short timeout.
async fn is_healthy(origin: &str, timeout: Duration) -> bool {
    let url = format!("{origin}/api/v1/healthz");
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .unwrap_or_default();
    match client.get(&url).send().await {
        Ok(res) if res.status().is_success() => {
            matches!(res.json::<serde_json::Value>().await, Ok(v) if v.get("code").and_then(|c| c.as_i64()) == Some(0))
        }
        _ => false,
    }
}

/// Run the bundled SEA's `server run`, which reuses a live shared daemon or
/// spawns one and exits once it is healthy. All discovery / port / lock logic
/// lives in apps/kimi-code's `ensureDaemon`; we do not reimplement it.
async fn run_server_run(sea_path: &Path) -> Result<(), String> {
    let output = tokio::process::Command::new(sea_path)
        .args(["server", "run", "--log-level", "error"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to spawn SEA: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "kimi server run failed (exit {:?}): {}",
            output.status.code(),
            stderr.trim()
        ));
    }
    Ok(())
}

pub struct EnsureResult {
    pub origin: String,
}

/// Ensure the shared kimi-code daemon is running and return its origin.
///
/// Mirrors the Electron version's `ensureServer()`:
/// 1. Run `kimi server run` (reuses or starts the shared daemon).
/// 2. Read the lock for the real port.
/// 3. Poll `/healthz` until healthy (or timeout).
pub async fn ensure_daemon(sea_path: &Path) -> Result<EnsureResult, String> {
    // Step 1: run the SEA with an overall timeout.
    let run_future = run_server_run(sea_path);
    match tokio::time::timeout(RUN_TIMEOUT, run_future).await {
        Ok(inner) => inner?,
        Err(_) => return Err(format!(
            "kimi server run did not finish within {}s",
            RUN_TIMEOUT.as_secs()
        )),
    }

    // Step 2: read the lock.
    let lock = read_lock().ok_or_else(|| {
        format!(
            "Kimi server lock not found at {} after starting the server.",
            lock_path().display()
        )
    })?;
    let origin = origin_from_lock(&lock);

    // Step 3: poll healthz.
    let deadline = Instant::now() + HEALTH_TIMEOUT;
    while Instant::now() < deadline {
        if is_healthy(&origin, Duration::from_millis(500)).await {
            return Ok(EnsureResult { origin });
        }
        tokio::time::sleep(HEALTH_POLL).await;
    }
    Err(format!(
        "Kimi server at {origin} did not become healthy within {}ms.",
        HEALTH_TIMEOUT.as_millis()
    ))
}
