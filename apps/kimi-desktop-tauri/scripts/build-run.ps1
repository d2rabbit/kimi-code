<#
.SYNOPSIS
  Kimi Code Desktop (Tauri) — Windows build + run script.
  PowerShell port of scripts/build-run.sh.

.DESCRIPTION
  Builds the complete desktop client (Tauri + embedded kimi-code SEA agent):
    - Default / -NoRun / -Foreground: executable release binary (dev use)
    - -Dist: distributable installers (.msi via Tauri bundler)

  The client's agent capabilities all come from kimi-code core (embedded SEA
  = Single Executable Application). This script builds the SEA from kimi-code
  source, embeds it into the Tauri client, and launches the result.

.PARAMETER Foreground
  Run in foreground (Ctrl+C in this window stops the app).

.PARAMETER NoRun
  Build only, do not launch.

.PARAMETER Dist
  Tauri packaging mode — produce .msi installers via `tauri build`.

.PARAMETER SkipSea
  Reuse the existing SEA at apps/kimi-code/dist-native/bin/win32-x64/kimi.exe
  instead of rebuilding kimi-code from source. Combinable with -Dist.

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
  .\scripts\build-run.ps1 -Dist -SkipSea
  .\scripts\build-run.ps1 -Foreground -LogLevel debug -DebugEndpoints
#>
[CmdletBinding()]
param(
  [switch]$Foreground,
  [switch]$NoRun,
  [switch]$Dist,
  [switch]$SkipSea,
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
$WebPkg = '@moonshot-ai/kimi-web'

# ---- Platform (Windows = win32-x64) ----
$Target = 'win32-x64'
$Exe = 'kimi.exe'

function Write-Log([string]$msg) {
  Write-Host "▸ $msg" -ForegroundColor Cyan
}
function Write-Warn([string]$msg) {
  Write-Host "⚠ $msg" -ForegroundColor Yellow
}
function Write-Err([string]$msg) {
  Write-Host "✖ $msg" -ForegroundColor Red
}

# ---- Toolchain checks ----
foreach ($tool in @('pnpm', 'cargo', 'node')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Write-Err "error: $tool is required but not found on PATH"
    exit 1
  }
}

# ---- 1. SEA (Single Executable Application) ----
$SeaSrc = Join-Path $RepoRoot "apps\kimi-code\dist-native\bin\$Target\$Exe"

if ($SkipSea) {
  if (-not (Test-Path $SeaSrc)) {
    Write-Err "SEA binary not found at $SeaSrc (-SkipSea requires an existing build)"
    exit 1
  }
  Write-Log "复用已有 SEA（-SkipSea）: $SeaSrc"
} else {
  Write-Log "构建 kimi-web 前端（SEA 内嵌用）…"
  pnpm --filter $WebPkg run build
  if ($LASTEXITCODE -ne 0) { Write-Err "kimi-web build failed"; exit 1 }

  Write-Log "拷贝 kimi-web 资源到 kimi-code/dist-web …"
  $copyScript = Join-Path $RepoRoot "apps\kimi-code\scripts\copy-web-assets.mjs"
  node $copyScript
  if ($LASTEXITCODE -ne 0) { Write-Err "copy-web-assets failed"; exit 1 }

  Write-Log "构建内嵌 agent（SEA，首次约需 5–10 分钟）…"
  pnpm --filter $CliPkg run build:native:sea
  if ($LASTEXITCODE -ne 0) { Write-Err "SEA build failed"; exit 1 }

  if (-not (Test-Path $SeaSrc)) {
    Write-Err "SEA build finished but binary not found at $SeaSrc"
    exit 1
  }
  Write-Log "内嵌 agent: $SeaSrc"
}

# ---- 2. Frontend type check ----
Write-Log "检查前端类型（svelte-check）…"
pnpm --filter $Pkg run typecheck
if ($LASTEXITCODE -ne 0) { Write-Err "svelte-check failed"; exit 1 }

# ---- 3. Rust check ----
Write-Log "检查客户端 Rust 代码（cargo check）…"
cargo check --manifest-path (Join-Path $AppDir "src-tauri\Cargo.toml") --no-default-features
if ($LASTEXITCODE -ne 0) { Write-Err "cargo check failed"; exit 1 }

# =====================================================================
# Path A: -Dist — Tauri bundler produces .msi installers
# =====================================================================
if ($Dist) {
  Write-Log "Tauri 打包（tauri build，产出 .msi 安装包）…"
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
  Write-Log "打包完成。安装包产物："
  if (Test-Path $BundleDir) {
    Get-ChildItem -Path $BundleDir -Recurse -Include '*.msi','*.exe' -ErrorAction SilentlyContinue |
      ForEach-Object { Write-Host "    $($_.FullName)" }
    $hasArtifacts = $true
  }
  if (-not $hasArtifacts) {
    Write-Warn "未发现 .msi/.exe 安装包，检查 $BundleDir"
  }
  exit 0
}

# =====================================================================
# Path B: Dev mode — compile release binary + launch
# =====================================================================

# ---- 4. Frontend production build ----
Write-Log "构建前端（vite production）…"
pnpm --filter $Pkg run build
if ($LASTEXITCODE -ne 0) { Write-Err "vite build failed"; exit 1 }

# ---- 5. Rust release build ----
# custom-protocol feature is required: tauri's build.rs uses
# `dev = !custom_protocol` to decide the mode. Without it the binary
# loads devUrl localhost:1420 instead of the embedded frontend (white screen).
Write-Log "构建客户端（cargo --release --features custom-protocol）…"
cargo build --release --features custom-protocol --manifest-path (Join-Path $AppDir "src-tauri\Cargo.toml")
if ($LASTEXITCODE -ne 0) { Write-Err "cargo build failed"; exit 1 }

# ---- 6. Stage SEA for the release binary ----
# The release binary resolves SEA from <exe_dir>/bin/<target>/kimi.exe.
$Dest = Join-Path $AppDir "src-tauri\target\release\bin\$Target"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item -Force $SeaSrc (Join-Path $Dest $Exe)
Write-Log "agent 已配备: $(Join-Path $Dest $Exe)"

if ($NoRun) {
  Write-Log "构建完成（-NoRun）。二进制: $(Join-Path $AppDir 'src-tauri\target\release\kimi-desktop-tauri.exe')"
  exit 0
}

# ---- 7. Launch ----
$Bin = Join-Path $AppDir "src-tauri\target\release\kimi-desktop-tauri.exe"
$env:KIMI_DESKTOP_LOG_LEVEL = $LogLevel
$env:KIMI_DESKTOP_DEBUG_ENDPOINTS = if ($DebugEndpoints) { '1' } else { '' }

if ($LogLevel -ne 'info' -or $DebugEndpoints) {
  Write-Log "诊断模式：log-level=$LogLevel debug-endpoints=$(if ($DebugEndpoints) {'on'} else {'off'})"
  Write-Log "  daemon 日志：~\.kimi-code\desktop\server\server.log"
}

if ($Foreground) {
  Write-Log "前台启动客户端（Ctrl+C 退出）…"
  & $Bin
  exit $LASTEXITCODE
}

# Detached launch: Start-Process creates an independent window that survives
# this script's exit (equivalent to setsid -f on Linux).
Write-Log "后台启动客户端（独立窗口）…"
Start-Process -FilePath $Bin -WindowStyle Normal
Write-Log "客户端已作为独立进程启动"
