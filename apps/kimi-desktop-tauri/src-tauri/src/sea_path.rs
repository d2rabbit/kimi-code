// sea_path.rs — resolve the bundled Kimi SEA backend executable path.
//
// Translated from apps/kimi-desktop/src/main/sea-path.ts.
// The bundled backend targets the same 6 platform/arch pairs the kimi-code
// native SEA build supports (apps/kimi-code/scripts/native/native-deps.mjs).

use std::path::PathBuf;
use tauri::{Manager, plugin::TauriPlugin};

/// The 6 supported platform-arch targets.
const SUPPORTED_TARGETS: &[&str] = &[
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64",
    "linux-x64",
    "win32-arm64",
    "win32-x64",
];

/// Current platform-arch triple, e.g. "darwin-arm64" or "win32-x64".
///
/// Maps Rust's `std::env::consts` (OS, ARCH) to the kimi-code target naming
/// convention. Returns an error if the running target is not in the supported set.
pub fn current_target() -> Result<String, String> {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        "linux" => "linux",
        other => return Err(format!("Unsupported OS: {other}")),
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => return Err(format!("Unsupported arch: {other}")),
    };
    let target = format!("{os}-{arch}");
    if !SUPPORTED_TARGETS.contains(&target.as_str()) {
        return Err(format!("No bundled Kimi server for this platform: {target}"));
    }
    Ok(target)
}

/// The SEA executable name for the current platform (`kimi.exe` on Windows, `kimi` elsewhere).
fn executable_name() -> &'static str {
    if cfg!(windows) { "kimi.exe" } else { "kimi" }
}

/// Absolute path to the bundled SEA backend executable.
///
/// - **Packaged**: `<resources>/bin/<target>/kimi[.exe]` — placed there by the
///   Tauri `beforeBundleCommand` / resource bundling.
/// - **Dev**: `apps/kimi-code/dist-native/bin/<target>/kimi[.exe]` — produced by
///   `pnpm -C apps/kimi-code build:native:sea`. In dev the app path is
///   `apps/kimi-desktop-tauri`, so the sibling app is two levels up.
pub fn resolve_sea_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let target = current_target()?;
    let exe = executable_name();

    if app.package_info().is_none() {
        // Dev mode: resolve relative to the workspace root.
        // app.path().app_dir() in dev points to apps/kimi-desktop-tauri;
        // the kimi-code dist is a sibling app.
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        // manifest_dir = apps/kimi-desktop-tauri/src-tauri
        // workspace root   = apps/kimi-desktop-tauri/src-tauri/../../..  = repo root
        let workspace_root = manifest_dir
            .ancestors()
            .nth(2)
            .ok_or("Cannot determine workspace root")?;
        let dev_path = workspace_root
            .join("apps")
            .join("kimi-code")
            .join("dist-native")
            .join("bin")
            .join(&target)
            .join(exe);
        return Ok(dev_path);
    }

    // Packaged: <resource_dir>/bin/<target>/kimi[.exe]
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Cannot resolve resource dir: {e}"))?;
    Ok(resource_dir.join("bin").join(&target).join(exe))
}
