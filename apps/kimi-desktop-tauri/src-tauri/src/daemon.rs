// daemon.rs — shared primitives: kimi-code home resolution + health checks.
//
// The desktop app NO LONGER attaches to the shared CLI daemon (see agent.rs):
// this module only keeps the pieces the embedded agent flow reuses.

use std::path::PathBuf;
use std::time::Duration;

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

/// Poll `/api/v1/healthz` once with a short timeout.
pub(crate) async fn is_healthy(origin: &str, timeout: Duration) -> bool {
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
