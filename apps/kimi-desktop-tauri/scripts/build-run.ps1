<#
.SYNOPSIS
  Kimi Code Desktop (Tauri) — Windows build + run script.
  PowerShell port of scripts/build-run.sh.

.DESCRIPTION
  Builds the complete desktop client (Tauri + embedded kimi-code agent):
    - Default / -NoRun / -Foreground: executable release binary (dev use)
    - -Dist: distributable installers (.msi via Tauri bundler)

  The client's agent capabilities come from kimi-code core (tsdown bundles
  to main.cjs, executed by Node at runtime). This replaces the old SEA
  (Single Executable Application) architecture for 10x faster rebuilds.

.PARAMETER Foreground
  Run in foreground (Ctrl+C in this window stops the app).

.PARAMETER NoRun
  Build only, do not launch.

.PARAMETER Dist
  Tauri packaging mode — produce .msi installers via `tauri build`.

.PARAMETER SkipAgent
  Skip kimi-code build, reuse existing main.cjs (frontend/Rust debugging).

.PARAMETER SkipSea
  Alias for -SkipAgent (legacy name, kept for compatibility).

.PARAMETER NoTypecheck
  Skip svelte-check / cargo check (faster iteration).

.PARAMETER Clean
  Clean target/release before rebuilding (diagnose odd compile errors).

.PARAMETER BuildPackages
  Run pnpm build:packages first (required after upstream merges that change
  packages/ source — otherwise main.cjs references stale dist/).

.PARAMETER LogLevel
  Daemon Pino log level (fatal|error|warn|info|debug|trace|silent).
  Default: info. Passed to the embedded agent via KIMI_DESKTOP_LOG_LEVEL.

.PARAMETER DebugEndpoints
  Mount /api/v1/debug/* introspection routes on the embedded agent.

.EXAMPLE
  .\scripts\build-run.ps1
  .\scripts\build-run.ps1 -Foreground
  .\scripts\build-run.ps1 -NoRun
  .\scripts\build-run.ps1 -Dist
  .\scripts\build-run.ps1 -SkipAgent
  .\scripts\build-run.ps1 -NoTypecheck -Clean
  .\scripts\build-run.ps1 -Foreground -LogLevel debug -DebugEndpoints
  .\scripts\build-run.ps1 -BuildPackages  # after upstream merge
#>
[CmdletBinding()]
param(
  [switch]$Foreground,
  [switch]$NoRun,
  [switch]$Dist,
  [switch]$SkipAgent,
  [switch]$SkipSea,
  [switch]$NoTypecheck,
  [switch]$Clean,
  [switch]$BuildPackages,
  [ValidateSet('fatal','error','warn','info','debug','trace','silent')]
  [string]$LogLevel = 'info',
  [switch]$DebugEndpoints,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'

if ($Help) {
  Get-Help $MyInvocation.MyCommand.Path -Detailed
  exit 0
}

# -SkipSea is a legacy alias for -SkipAgent.
if ($SkipSea) { $SkipAgent = $true }

# Mutex: -Dist cannot combine with -Foreground / -NoRun.
if ($Dist -and ($Foreground -or $NoRun)) {
  Write-Error "error: -Dist cannot be combined with -Foreground or -NoRun"
  exit 2
}

# ---- Paths ----
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Split-Path -Parent $ScriptDir
$RepoRoot = Split-Path -Parent (Split-Path -Parent $AppDir)
$Pkg = '@moonshot-ai/kimi-desktop-tauri'
$CliPkg = '@moonshot-ai/kimi-code'

# ---- Platform (Windows = win32-x64) ----
$Target = 'win32-x64'

function Write-Log([string]$msg) {
  Write-Host "[1;36m[1m $msg[0m" -NoNewline
  Write-Host ""
}
function Write-Warn([string]$msg) {
  Write-Host "[1;33m $msg[0m"
}
function Write-Err([string]$msg) {
  Write-Host "[1;31m $msg[0m"
}

# ---- Toolchain checks ----
foreach ($tool in @('pnpm', 'cargo', 'node')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Write-Err "error: $tool is required but not found on PATH"
    exit 1
  }
}

# ---- 0. Optional: build packages/ (required after upstream merge) ----
if ($BuildPackages) {
  Write-Log "building packages/ (pnpm build:packages)..."
  Push-Location $RepoRoot
  try {
    pnpm run build:packages
    if ($LASTEXITCODE -ne 0) { Write-Err "build:packages failed"; exit 1 }
  } finally {
    Pop-Location
  }
}

# ---- 1. Build embedded agent (tsdown -> main.cjs) ----
$AgentScript = Join-Path $RepoRoot "apps\kimi-code\dist-native\intermediates\main.cjs"

if ($SkipAgent) {
  if (-not (Test-Path $AgentScript)) {
    Write-Err "main.cjs not found at $AgentScript (-SkipAgent requires an existing build)"
    Write-Err "Run a full build first without -SkipAgent"
    exit 1
  }
  Write-Log "skipping kimi-code build (-SkipAgent), reuse: $AgentScript"
} else {
  # 本分支已移除 apps/kimi-web（Tauri-only 方向）：daemon 仅提供 REST/WS，
  # 没有浏览器 UI 资源需要构建/拷贝。
  # Build vis asset (native build prerequisite), then tsdown.
  $buildVis = Join-Path $RepoRoot "apps\kimi-code\scripts\build-vis-asset.mjs"
  if (Test-Path $buildVis) { node $buildVis }

  Write-Log "building embedded agent (tsdown, ~30 seconds)..."
  Push-Location (Join-Path $RepoRoot "apps\kimi-code")
  try {
    # Prefer repo-local tsdown CLI to avoid npx re-resolution.
    $tsdownCli = $null
    try {
      $tsdownCli = node -e "console.log(require.resolve('tsdown/run'))" 2>$null
    } catch {}
    if ($tsdownCli) {
      node $tsdownCli --config tsdown.native.config.ts
    } else {
      npx tsdown --config tsdown.native.config.ts
    }
    if ($LASTEXITCODE -ne 0) { Write-Err "tsdown build failed"; exit 1 }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path $AgentScript)) {
    Write-Err "tsdown finished but main.cjs not found at $AgentScript"
    exit 1
  }
  $size = [math]::Round((Get-Item $AgentScript).Length / 1MB, 1)
  Write-Log "embedded agent: $AgentScript (${size}MB)"
}

# ---- 1b. --Clean: wipe target/release ----
if ($Clean) {
  Write-Log "cleaning target/release (-Clean)..."
  cargo clean --release --manifest-path (Join-Path $AppDir "src-tauri\Cargo.toml")
}

# ---- 2. Frontend type check (skippable) ----
if ($NoTypecheck) {
  Write-Warn "skipping svelte-check / cargo check (-NoTypecheck)"
} else {
  Write-Log "checking frontend types (svelte-check)..."
  pnpm --filter $Pkg run typecheck
  if ($LASTEXITCODE -ne 0) { Write-Err "svelte-check failed"; exit 1 }

  Write-Log "checking client Rust code (cargo check)..."
  cargo check --manifest-path (Join-Path $AppDir "src-tauri\Cargo.toml") --no-default-features
  if ($LASTEXITCODE -ne 0) { Write-Err "cargo check failed"; exit 1 }
}

# =====================================================================
# Path A: -Dist — Tauri bundler produces .msi installers
# =====================================================================
if ($Dist) {
  Write-Log "Tauri packaging (tauri build, producing .msi installers)..."
  $env:TAURI_PLATFORM = 'win32'
  $env:TAURI_ARCH = 'x64'

  Push-Location $AppDir
  try {
    pnpm run tauri:build
    if ($LASTEXITCODE -ne 0) {
      Write-Err "Tauri build failed"
      exit 1
    }
  } finally {
    Pop-Location
  }

  $BundleDir = Join-Path $AppDir "src-tauri\target\release\bundle"
  Write-Log "packaging complete. Installer artifacts:"
  if (Test-Path $BundleDir) {
    Get-ChildItem -Path $BundleDir -Recurse -Include '*.msi','*.exe' -ErrorAction SilentlyContinue |
      ForEach-Object { Write-Host "    $($_.FullName)" }
  } else {
    Write-Warn "no bundle directory found at $BundleDir"
  }
  exit 0
}

# =====================================================================
# Path B: Dev mode — compile release binary + launch
# =====================================================================

# ---- 4. Frontend production build ----
Write-Log "building frontend (vite production)..."
pnpm --filter $Pkg run build
if ($LASTEXITCODE -ne 0) { Write-Err "vite build failed"; exit 1 }

# ---- 5. Rust release build ----
# custom-protocol feature is required: tauri's build.rs uses
# `dev = !custom_protocol` to decide the mode. Without it the binary
# loads devUrl localhost:1420 instead of the embedded frontend (white screen).
Write-Log "building client (cargo --release --features custom-protocol)..."
cargo build --release --features custom-protocol --manifest-path (Join-Path $AppDir "src-tauri\Cargo.toml")
if ($LASTEXITCODE -ne 0) { Write-Err "cargo build failed"; exit 1 }

# ---- 6. Agent ready (dev mode references main.cjs directly) ----
Write-Log "agent ready (dev references directly): $AgentScript"

if ($NoRun) {
  Write-Log "build complete (-NoRun). Binary: $(Join-Path $AppDir 'src-tauri\target\release\kimi-desktop-tauri.exe')"
  exit 0
}

# ---- 7. Launch ----
$Bin = Join-Path $AppDir "src-tauri\target\release\kimi-desktop-tauri.exe"
$env:KIMI_DESKTOP_DEV = '1'
$env:KIMI_DESKTOP_LOG_LEVEL = $LogLevel
$env:KIMI_DESKTOP_DEBUG_ENDPOINTS = if ($DebugEndpoints) { '1' } else { '' }

if ($LogLevel -ne 'info' -or $DebugEndpoints) {
  Write-Log "diagnostics: log-level=$LogLevel debug-endpoints=$(if ($DebugEndpoints) {'on'} else {'off'})"
  Write-Log "  daemon log: ~\.kimi-code\desktop\server\server.log"
}

if ($Foreground) {
  Write-Log "launching client in foreground (Ctrl+C to exit)..."
  & $Bin
  exit $LASTEXITCODE
}

# Detached launch: Start-Process creates an independent window that survives
# this script's exit (equivalent to setsid -f on Linux).
Write-Log "launching client in background (independent window)..."
Start-Process -FilePath $Bin -WindowStyle Normal
Write-Log "client launched as independent process"
