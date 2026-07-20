// sea_path.rs — resolve the bundled Kimi agent (main.cjs) + Node runtime paths.
//
// Architecture: instead of injecting kimi-code into a Node binary via SEA
// (postject), we bundle the tsdown-produced main.cjs as a Tauri resource and
// spawn it with a Node runtime. This skips the slow + fragile SEA injection
// step (sea-config → blob → postject → sign), making kimi-code updates a
// 30-second `tsdown` + copy instead of a 5–10 minute full SEA rebuild.
//
// Two files are needed at runtime:
//   1. main.cjs  — kimi-code JS bundle (tsdown native config output)
//   2. node      — Node.js runtime (>= 24.15)
//
// Resolution order:
//   - Dev: apps/kimi-code/dist-native/intermediates/main.cjs + system node
//   - Packaged: <resource_dir>/main.cjs + <resource_dir>/node[.exe]

use std::path::PathBuf;
use tauri::Manager;

/// Resolve the main.cjs path (the kimi-code JS bundle).
///
/// - **Dev**: `apps/kimi-code/dist-native/intermediates/main.cjs` — produced
///   by `tsdown --config tsdown.native.config.ts` (skipping the SEA injection
///   steps). Falls back to `~/.kimi-code/bin/main.cjs` if the dev build is
///   missing.
/// - **Packaged**: `<resource_dir>/main.cjs` — placed there by the Tauri
///   `beforeBundleCommand` / resource bundling.
pub fn resolve_agent_script(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let apps_dir = manifest_dir
            .ancestors()
            .nth(2)
            .ok_or("Cannot determine apps directory")?;

        // Path 1: tsdown native output (the fast dev path — no SEA needed)
        let dev_path = apps_dir
            .join("kimi-code")
            .join("dist-native")
            .join("intermediates")
            .join("main.cjs");
        if dev_path.exists() {
            return Ok(dev_path);
        }

        // Path 2: manually placed in src-tauri/resources
        let local_path = manifest_dir.join("resources").join("main.cjs");
        if local_path.exists() {
            return Ok(local_path);
        }

        // Fallback: return path 1 (will error clearly when spawned)
        return Ok(dev_path);
    }

    // Packaged: <resource_dir>/main.cjs
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Cannot resolve resource dir: {e}"))?;
    Ok(resource_dir.join("main.cjs"))
}

/// Resolve the Node.js runtime path.
///
/// - **Dev**: system `node` (must be >= 24.15 — the caller's responsibility to
///   verify, e.g. via build-run.sh's fnm/mise/nvm auto-switch).
/// - **Packaged**: `<resource_dir>/node[.exe]` — bundled alongside main.cjs so
///   the app is self-contained without requiring users to install Node.
pub fn resolve_node_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        // Dev: use system node
        which_node()
    } else {
        // Packaged: <resource_dir>/node[.exe]
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Cannot resolve resource dir: {e}"))?;
        let node_name = if cfg!(windows) { "node.exe" } else { "node" };
        let node_path = resource_dir.join(node_name);
        if node_path.exists() {
            Ok(node_path)
        } else {
            // Fallback to system node if bundled node is missing
            which_node()
        }
    }
}

/// Find system `node` on PATH. Errors if not found.
fn which_node() -> Result<PathBuf, String> {
    let node_name = if cfg!(windows) { "node.exe" } else { "node" };
    let path_env = std::env::var("PATH").unwrap_or_default();
    for dir in std::env::split_paths(&path_env) {
        let candidate = dir.join(node_name);
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(format!(
        "Node.js runtime not found on PATH. Install Node >= 24.15 or bundle it as a Tauri resource."
    ))
}
