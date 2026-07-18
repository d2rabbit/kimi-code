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

/// First-boot seed: copy user-level config from the shared CLI home so the
/// embedded agent starts with the user's existing providers, plugins, skills
/// and agents instead of a blank slate. Runs only when the desktop home does
/// not exist yet; never touches sessions (those stay private per home).
fn seed_agent_home_if_needed(home: &Path) -> Result<(), String> {
    if home.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(home).map_err(|e| format!("create agent home: {e}"))?;
    let shared = crate::daemon::kimi_home();
    for item in ["config.json", "plugins", "skills", "agents"] {
        let src = shared.join(item);
        if src.exists() {
            copy_recursively(&src, &home.join(item))?;
        }
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

/// Spawn (or return the running) embedded agent; resolves once healthy.
pub async fn start_embedded_agent(app: &AppHandle) -> Result<String, String> {
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

    let mut child = tokio::process::Command::new(&sea)
        .args([
            "server",
            "run",
            "--foreground",
            "--port",
            &port.to_string(),
            "--log-level",
            "error",
        ])
        .env("KIMI_CODE_HOME", &home)
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
