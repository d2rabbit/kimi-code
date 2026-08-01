// agent.rs — app-owned embedded Kimi agent (private server process).
//
// Spawns the kimi-code JS bundle (main.cjs) via the Node runtime as a
// long-lived child process: `node main.cjs web --no-open --port <eph>`.
// No SEA injection (postject) is needed — the tsdown-produced main.cjs is
// executed directly, so kimi-code updates are a fast `tsdown + copy` instead
// of a full SEA rebuild.
//
// Uses an ISOLATED KIMI_CODE_HOME (~/.kimi-code/desktop) so it never contends
// with the shared CLI daemon for the server lock / token / sessions, and an
// ephemeral loopback port instead of the well-known 58627. The desktop client
// must never attach to a foreign daemon: the agent starts with the app and
// dies with it.

use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

use crate::sea_path::{resolve_agent_script, resolve_node_path};

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
/// and MCP config — instead of a blank slate.
///
/// Two policies coexist:
/// - **Config merge** (config.toml + mcp.json): the CLI's config is the
///   read-only base; the desktop home's config overrides matching fields.
///   Re-merged on every launch so CLI-side provider/model edits flow through
///   without a manual re-seed. The CLI config file is NEVER modified — merge
///   is one-way (CLI → desktop), result written to the desktop home only.
/// - **One-time seed** (sessions/plugins/skills/agents/user-history): copied
///   only when missing on the desktop side (never overwrites data the desktop
///   user has since created).
fn seed_agent_home_if_needed(home: &Path) -> Result<(), String> {
    std::fs::create_dir_all(home).map_err(|e| format!("create agent home: {e}"))?;
    let shared = crate::daemon::kimi_home();
    if shared == home {
        return Ok(());
    }
    // Never seed the server lock/token/device identity: those belong to the
    // owning process/install. Sessions/plugins/skills are user data and are
    // carried over via a one-time-per-item copy.
    for item in [
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
    // Config + MCP are re-merged every launch (CLI base + desktop overlay).
    merge_config_toml(&shared, home)?;
    merge_mcp_json(&shared, home)?;
    // Inject builtin codegraph MCP server if the CLI is on PATH.
    inject_builtin_codegraph_mcp(home);
    // Inject builtin BrowserSkill skill if bsk CLI is on PATH.
    inject_builtin_browser_skill(home);
    seed_session_index(&shared, home)?;
    Ok(())
}

/// Merge `<shared>/config.toml` (read-only base) with `<home>/config.toml`
/// (desktop overlay). Desktop values win on key collision; CLI values fill
/// the gaps. Result is written to `<home>/config.toml` only — the shared CLI
/// config file is never touched. Both files are parsed as TOML; merge is a
/// shallow table-level union with nested `[providers."X"]` / `[models."X"]`
/// merged key-by-key (desktop wins).
fn merge_config_toml(shared: &Path, home: &Path) -> Result<(), String> {
    let cli_path = shared.join("config.toml");
    let dst_path = home.join("config.toml");
    let cli_text = std::fs::read_to_string(&cli_path).unwrap_or_default();
    let dst_text = std::fs::read_to_string(&dst_path).unwrap_or_default();
    let cli_val: toml::Value = toml::from_str(&cli_text)
        .map_err(|e| format!("parse shared config.toml: {e}"))?;
    let mut dst_val: toml::Value = toml::from_str(&dst_text)
        .unwrap_or(toml::Value::Table(Default::default()));

    // In-place deep merge: dst starts as itself, then we pull in every CLI
    // field that dst doesn't already set. Tables recurse so per-provider /
    // per-model entries merge rather than wholesale-replace.
    if let (Some(cli_tbl), Some(dst_tbl)) = (cli_val.as_table(), dst_val.as_table_mut()) {
        deep_merge_tables(cli_tbl, dst_tbl);
    }
    let merged = toml::to_string_pretty(&dst_val)
        .map_err(|e| format!("serialize merged config.toml: {e}"))?;
    std::fs::write(&dst_path, merged).map_err(|e| format!("write config.toml: {e}"))?;
    Ok(())
}

/// Recursively merge `src` (CLI, read-only) into `dst` (desktop overlay).
/// For each key in `src`: if `dst` doesn't have it, copy it; if both are
/// tables, recurse; otherwise keep `dst`'s value (desktop wins).
fn deep_merge_tables(src: &toml::value::Table, dst: &mut toml::value::Table) {
    for (key, cli_val) in src {
        match dst.get_mut(key) {
            Some(toml::Value::Table(dst_sub)) => {
                if let Some(cli_sub) = cli_val.as_table() {
                    deep_merge_tables(cli_sub, dst_sub);
                }
                // If dst[key] is a table but cli_val isn't, keep dst (desktop wins).
            }
            Some(_) => {
                // dst already has a non-table value for this key — desktop wins.
            }
            None => {
                // dst doesn't have it — pull from CLI (clone the whole subtree).
                dst.insert(key.clone(), cli_val.clone());
            }
        }
    }
}

/// Merge `<shared>/mcp.json` (read-only base) with `<home>/mcp.json`.
/// Servers are keyed by name in `mcpServers`; desktop entries override
/// same-named CLI entries, CLI entries fill the rest. Result written to
/// `<home>/mcp.json` only.
fn merge_mcp_json(shared: &Path, home: &Path) -> Result<(), String> {
    let cli_path = shared.join("mcp.json");
    let dst_path = home.join("mcp.json");
    let cli_text = std::fs::read_to_string(&cli_path).unwrap_or_default();
    let dst_text = std::fs::read_to_string(&dst_path).unwrap_or_default();

    let cli_val: serde_json::Value = serde_json::from_str(&cli_text).unwrap_or_default();
    let mut dst_val: serde_json::Value = serde_json::from_str(&dst_text).unwrap_or_default();

    // Both files use { "mcpServers": { "<name>": {...} } } — merge the inner
    // object so desktop's same-named server wins, CLI's fill the gaps.
    if let (Some(cli_servers), Some(dst_obj)) = (
        cli_val.get("mcpServers").and_then(|v| v.as_object()),
        dst_val.as_object_mut(),
    ) {
        let dst_servers = dst_obj
            .entry("mcpServers".to_string())
            .or_insert_with(|| serde_json::Value::Object(Default::default()));
        if let Some(dst_servers_obj) = dst_servers.as_object_mut() {
            for (name, cli_cfg) in cli_servers {
                dst_servers_obj
                    .entry(name.clone())
                    .or_insert_with(|| cli_cfg.clone());
            }
        }
    }
    let merged = serde_json::to_string_pretty(&dst_val)
        .map_err(|e| format!("serialize mcp.json: {e}"))?;
    std::fs::write(&dst_path, merged).map_err(|e| format!("write mcp.json: {e}"))?;
    Ok(())
}

/// Merge the shared session_index.jsonl into the desktop home, REWRITING each
/// entry's sessionDir from the shared home to the desktop home.
///
/// Why a rewrite instead of a plain copy or letting reindex() rebuild:
/// - index entries record ABSOLUTE sessionDir paths; the daemon drops any
///   entry outside <home>/sessions, so a plain copy surfaces zero sessions;
/// - the daemon's boot-time reindex() cannot recover old sessions whose
/// Inject the builtin codegraph MCP server into `<home>/mcp.json` if the
/// `codegraph` CLI is on PATH. This makes codegraph available to the agent
/// as an MCP tool (symbol search, call graph, file structure) without the
/// user having to manually configure it.
///
/// No-op when codegraph isn't installed — the hook and MCP entry simply
/// don't appear, matching the 'opt-in via install' behavior.
fn inject_builtin_codegraph_mcp(home: &Path) {
    let bin_name = if cfg!(windows) { "codegraph.exe" } else { "codegraph" };
    if which::which(bin_name).is_err() {
        return; // codegraph not installed — skip silently.
    }
    let mcp_path = home.join("mcp.json");
    let text = std::fs::read_to_string(&mcp_path).unwrap_or_else(|_| "{}".to_string());
    let mut val: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
    let servers = val
        .as_object_mut()
        .and_then(|o| o.entry("mcpServers".to_string()).or_insert_with(|| serde_json::json!({})).as_object_mut());
    if let Some(servers) = servers {
        // Only inject if not already configured by the user.
        servers.entry("codegraph".to_string()).or_insert_with(|| {
            serde_json::json!({
                "command": "codegraph",
                "args": ["serve", "--mcp"],
                "transport": "stdio"
            })
        });
    }
    if let Ok(merged) = serde_json::to_string_pretty(&val) {
        let _ = std::fs::write(&mcp_path, merged);
    }
}

/// Inject the builtin BrowserSkill skill into `<home>/skills/browser-skill/`
/// if the `bsk` CLI is on PATH. This makes browser automation (open pages,
/// fill forms, scrape data, click flows) available to the agent as a skill
/// without the user having to manually run `bsk install-skill`.
///
/// No-op when bsk isn't installed — the skill simply doesn't appear, matching
/// the 'opt-in via install' behavior.
fn inject_builtin_browser_skill(home: &Path) {
    let bin_name = if cfg!(windows) { "bsk.exe" } else { "bsk" };
    if which::which(bin_name).is_err() {
        return; // bsk not installed — skip silently.
    }
    let skill_dir = home.join("skills").join("browser-skill");
    let skill_path = skill_dir.join("SKILL.md");

    // Don't overwrite a user-customized or newer skill.
    if skill_path.exists() {
        return;
    }

    let _ = std::fs::create_dir_all(&skill_dir);
    let _ = std::fs::write(&skill_path, BROWSER_SKILL_MD);
}

/// Embedded BrowserSkill SKILL.md — teaches the agent how to drive the user's
/// real Chromium browser through the `bsk` CLI. Sourced from
/// https://github.com/Tencent/BrowserSkill/blob/main/skill/SKILL.md
const BROWSER_SKILL_MD: &str = r#"---
name: browser-skill
description: |
  Use when the user asks to perform browser automation tasks against their
  logged-in browser: visit and read pages, fill forms, scrape data, click
  through a flow, regression-test a PR's UI, validate a deployed page.
  Requires the bsk CLI installed and the browser-skill extension loaded.
---

# browser-skill

Drive the user's **real Chromium browser** (with their logins and cookies) through the `bsk` CLI. The extension opens an isolated **Agent Window** for automation; the user's normal windows stay protected unless you explicitly borrow a tab.

## When to use

- Open pages, read titles/text, scrape structured data from sites the user can already access
- Fill forms, click through multi-step flows, smoke-test a UI change
- Understand pages with `bsk snapshot` first; use `bsk get-html` or `bsk screenshot` only when the snapshot is insufficient
- Operate on a specific user tab they point you at (after `bsk tab borrow`)

## When NOT to use

- Tasks with **no browser** involved (files, APIs, databases only)
- Installing or configuring the extension (point the user to setup docs instead)
- **Credential harvesting** — never run `bsk evaluate` on banking, SSO, or password-manager pages to extract tokens, cookies, or secrets
- Long-lived control of a user's personal login window — borrow only for the immediate step, then `bsk tab return` or end the session
- Replacing the user's manual browsing when they only wanted an explanation

## Prerequisites

1. `bsk` on `PATH` (Rust CLI from browser-skill)
2. browser-skill **extension** loaded in Chromium and connected (popup shows green)
3. Any `bsk` command auto-starts background services as needed; use `bsk doctor` if anything fails

## Mandatory workflow

Every automation task **must** follow this lifecycle. Do **not** rely on idle timeouts (default session idle is 5 minutes).

```
1. bsk session start              → capture the session id printed on stdout
2. … every tool command …        → always pass --session <id>
3. bsk session stop <id>          → REQUIRED when done (even on error paths)
```

## Core interaction loop

```
bsk navigate <url> --session <id>
bsk snapshot --session <id>          → aria tree with @e1, @e2, … refs
bsk click @e3 --session <id>          → or bsk fill, bsk select, bsk press
bsk snapshot --session <id>            → again after navigation / DOM change
```

Refs invalidate after navigation — always re-snapshot before clicking on a new page.

## Observation priority

1. `bsk snapshot` — default for page understanding and interaction planning
2. `bsk get-html` — when hidden DOM, metadata, or markup details are required
3. `bsk screenshot` — when visual layout, canvas/image content, or styling cannot be inferred from the snapshot

## CLI command reference

### Diagnostics
- `bsk status` — connection health, connected browsers, active sessions
- `bsk doctor` — deep diagnostics and repair hints
- `bsk browsers` — list connected browser instances

### Session lifecycle
- `bsk session start [--browser <id>]` — begin a browser automation session
- `bsk session stop <id>` — end session (REQUIRED)
- `bsk session stop --all` — emergency cleanup

### Navigation & tabs
- `bsk navigate <url>` — navigate the active agent tab
- `bsk tab create` — open a new tab in the Agent Window
- `bsk tab list --scope user` — list the user's tabs (read-only)
- `bsk tab borrow <tab-id>` — borrow a user tab into the Agent Window
- `bsk tab return <tab-id>` — return a borrowed tab

### Interaction
- `bsk click @eN | <selector>` — click an element
- `bsk fill @eN <text>` — type into an input
- `bsk select @eN <value>` — select a dropdown option
- `bsk press <key>` — press a keyboard key

### Observation
- `bsk snapshot` — accessibility tree with element refs
- `bsk get-html [@eN]` — get DOM HTML
- `bsk screenshot [@eN]` — capture a screenshot

### Human-in-the-loop
- `bsk request-help` — pause and ask the user to take over (captcha, login, payment)

## Global flags
- `--json` — machine-readable JSON output
- `--quiet` — suppress informational stderr
- `-v` / `-vv` — verbose logging
"#;

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

    let agent_script = resolve_agent_script(app)?;
    let node_bin = resolve_node_path(app)?;
    let port = pick_port()?;
    let home = agent_home();
    seed_agent_home_if_needed(&home)?;
    let cors_origins = if cfg!(debug_assertions) {
        "http://tauri.localhost,tauri://localhost,http://localhost:1420,http://127.0.0.1:1420"
    } else {
        "http://tauri.localhost,tauri://localhost"
    };

    // Spawn: node main.cjs web --no-open --port <eph> --log-level <level>
    // The agent is the kimi-code JS bundle (tsdown output), executed by the
    // Node runtime. No SEA injection needed — just node + main.cjs.
    let mut cmd = tokio::process::Command::new(&node_bin);
    let desktop_version = app.package_info().version.to_string();
    cmd.arg(&agent_script);
    cmd.args([
        "web",
        "--no-open",
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
        .env("KIMI_CODE_EMBEDDED_HOST_PRODUCT", "kimi-code-desktop")
        .env("KIMI_CODE_EMBEDDED_HOST_VERSION", desktop_version)
        .env("KIMI_CODE_EMBEDDED_HOST_PLATFORM", "kimi_code_desktop")
        .env("KIMI_CODE_EMBEDDED_HOST_USER_AGENT_SUFFIX", "desktop")
        .env("KIMI_CODE_EMBEDDED_HOST_DISPLAY_NAME", "Kimi Code Desktop")
        .env("KIMI_CODE_EMBEDDED_HOST_UI_MODE", "desktop")
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
        .map_err(|e| format!("spawn embedded agent ({} {}): {e}", node_bin.display(), agent_script.display()))?;

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

#[cfg(test)]
mod merge_tests {
    use super::*;

    #[test]
    fn merge_toml_cli_base_desktop_overlay() {
        // CLI has default_model + provider x-aio; desktop has default_model override.
        // After merge: desktop's default_model wins, CLI's provider fills in.
        let tmp = tempfile::tempdir().unwrap();
        let shared = tmp.path().join("shared");
        let home = tmp.path().join("home");
        std::fs::create_dir_all(&shared).unwrap();
        std::fs::create_dir_all(&home).unwrap();
        std::fs::write(shared.join("config.toml"), r#"
default_model = "cli-model"

[providers."x-aio"]
type = "kimi"
base_url = "https://cli.example.com/v1"
api_key = "cli-key"
"#).unwrap();
        std::fs::write(home.join("config.toml"), r#"
default_model = "desktop-model"
telemetry = false
"#).unwrap();

        merge_config_toml(&shared, &home).unwrap();

        let merged = std::fs::read_to_string(home.join("config.toml")).unwrap();
        assert!(merged.contains("desktop-model"), "desktop default_model should win: {}", merged);
        assert!(merged.contains("x-aio"), "CLI provider should fill in: {}", merged);
        assert!(merged.contains("telemetry"), "desktop-only field should remain: {}", merged);
        // CLI file must be untouched (read-only).
        let cli_after = std::fs::read_to_string(shared.join("config.toml")).unwrap();
        assert!(cli_after.contains("cli-model"), "CLI config must not be modified");
    }

    #[test]
    fn merge_mcp_desktop_overrides_cli() {
        let tmp = tempfile::tempdir().unwrap();
        let shared = tmp.path().join("shared");
        let home = tmp.path().join("home");
        std::fs::create_dir_all(&shared).unwrap();
        std::fs::create_dir_all(&home).unwrap();
        std::fs::write(shared.join("mcp.json"), r#"{"mcpServers":{"cli-srv":{"command":"a"},"both-srv":{"command":"cli-ver"}}}"#).unwrap();
        std::fs::write(home.join("mcp.json"), r#"{"mcpServers":{"desktop-srv":{"command":"b"},"both-srv":{"command":"desktop-ver"}}}"#).unwrap();

        merge_mcp_json(&shared, &home).unwrap();

        let merged = std::fs::read_to_string(home.join("mcp.json")).unwrap();
        assert!(merged.contains("cli-srv"), "CLI-only server should fill in");
        assert!(merged.contains("desktop-srv"), "desktop-only server should remain");
        assert!(merged.contains("desktop-ver"), "desktop should override same-named server");
        assert!(!merged.contains("cli-ver"), "CLI version of same-named server should be overridden");
    }
}
