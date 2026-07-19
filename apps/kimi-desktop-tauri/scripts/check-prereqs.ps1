<#
.SYNOPSIS
  Checks the Windows prerequisites for building kimi-desktop-tauri.
  Run this FIRST before build-run.ps1 / dev-quick.ps1 on a fresh machine.

.DESCRIPTION
  Verifies:
  - Node.js >= 24.15.0
  - pnpm 10.33.x
  - Rust toolchain (cargo, rustc, target x86_64-pc-windows-msvc)
  - WebView2 runtime (Windows 10/11 ships it via Edge; older builds need install)

  Exits 0 if all pass, 1 if any missing/wrong version.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$script:failures = 0

function Check-Version([string]$Name, [string]$Current, [string]$Required, [scriptblock]$Test) {
  if ($Current -eq $null -or $Current -eq '') {
    Write-Host "  ✖ $Name : NOT FOUND" -ForegroundColor Red
    $script:failures++
    return
  }
  if (& $Test $Current) {
    Write-Host "  ✓ $Name : $Current" -ForegroundColor Green
  } else {
    Write-Host "  ✖ $Name : $Current (需要 $Required)" -ForegroundColor Red
    $script:failures++
  }
}

# Semantic version comparison: returns true if $a >= $b (both like "24.15.0").
function SemVer-Ge([string]$a, [string]$b) {
  $ra = [version]($a -replace '-.*$','')
  $rb = [version]($b -replace '-.*$','')
  return $ra -ge $rb
}

Write-Host "=== kimi-desktop-tauri Windows 前置检查 ===" -ForegroundColor Cyan
Write-Host ""

# ---- Node.js ----
Write-Host "[Node.js]"
try {
  $nodeVer = (node --version) -replace '^v',''
  Check-Version 'Node.js' $nodeVer '>= 24.15.0' { param($v) SemVer-Ge $v '24.15.0' }
} catch {
  Write-Host "  ✖ Node.js : NOT FOUND — install from https://nodejs.org/" -ForegroundColor Red
  Write-Host "    需要 Node.js >= 24.15.0 (推荐 LTS)" -ForegroundColor Yellow
  $script:failures++
}

# ---- pnpm ----
Write-Host "[pnpm]"
try {
  $pnpmVer = (pnpm --version)
  Check-Version 'pnpm' $pnpmVer '10.33.x' { param($v) $v -like '10.33.*' -or $v -like '10.3[3-9].*' -or ([int]($v.Split('.')[0]) -gt 10) }
} catch {
  Write-Host "  ✖ pnpm : NOT FOUND — install via 'npm install -g pnpm@10.33.0'" -ForegroundColor Red
  $script:failures++
}

# ---- Rust ----
Write-Host "[Rust toolchain]"
try {
  $rustVer = (rustc --version) -replace '^rustc\s+','' -replace '\s.*$',''
  Check-Version 'rustc' $rustVer 'stable (>= 1.77)' { param($v) SemVer-Ge $v '1.77.0' }
} catch {
  Write-Host "  ✖ rustc : NOT FOUND — install from https://rustup.rs/" -ForegroundColor Red
  Write-Host "    Tauri 2 要求 Rust 稳定版工具链" -ForegroundColor Yellow
  $script:failures++
}

try {
  cargo --version | Out-Null
  Write-Host "  ✓ cargo : 已安装" -ForegroundColor Green
} catch {
  Write-Host "  ✖ cargo : NOT FOUND — 通过 rustup 安装" -ForegroundColor Red
  $script:failures++
}

# Check the Windows MSVC target is installed.
try {
  $targets = (rustup target list --installed) 2>$null
  if ($targets -match 'x86_64-pc-windows-msvc') {
    Write-Host "  ✓ target x86_64-pc-windows-msvc : 已安装" -ForegroundColor Green
  } else {
    Write-Host "  ✖ target x86_64-pc-windows-msvc : 缺失" -ForegroundColor Red
    Write-Host "    运行: rustup target add x86_64-pc-windows-msvc" -ForegroundColor Yellow
    $script:failures++
  }
} catch {
  Write-Host "  ⚠ 无法检查 rustup targets（rustup 可能未安装）" -ForegroundColor Yellow
}

# ---- WebView2 ----
Write-Host "[WebView2 Runtime]"
$webviewKeys = @(
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
  'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
  'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
)
$webviewFound = $false
foreach ($key in $webviewKeys) {
  if (Test-Path $key) {
    $pv = (Get-ItemProperty $key -ErrorAction SilentlyContinue).pv
    if ($pv -and $pv -ne '0.0.0.0') {
      Write-Host "  ✓ WebView2 Runtime : $pv" -ForegroundColor Green
      $webviewFound = $true
      break
    }
  }
}
if (-not $webviewFound) {
  Write-Host "  ✖ WebView2 Runtime : 未检测到" -ForegroundColor Red
  Write-Host "    Windows 10/11 通常自带（通过 Edge）；缺失时从 https://developer.microsoft.com/microsoft-edge/webview2/ 下载" -ForegroundColor Yellow
  $script:failures++
}

# ---- MSVC build tools (C++ build tools required by Rust MSVC target) ----
Write-Host "[MSVC C++ Build Tools]"
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vsWhere) {
  $vsPath = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
  if ($vsPath) {
    Write-Host "  ✓ Visual Studio C++ Build Tools : $vsPath" -ForegroundColor Green
  } else {
    Write-Host "  ✖ MSVC C++ Tools : 缺失（Rust MSVC target 需要）" -ForegroundColor Red
    Write-Host "    安装 Visual Studio Build Tools: https://visualstudio.microsoft.com/visual-cpp-build-tools/" -ForegroundColor Yellow
    Write-Host "    勾选 '使用 C++ 的桌面开发'" -ForegroundColor Yellow
    $script:failures++
  }
} else {
  Write-Host "  ⚠ vswhere 未找到 — 如果 Rust 编译报 link.exe 错误，安装 Visual Studio Build Tools" -ForegroundColor Yellow
}

Write-Host ""
if ($script:failures -eq 0) {
  Write-Host "=== 全部检查通过 ✓ ===" -ForegroundColor Green
  Write-Host "现在可以运行: .\scripts\dev-quick.ps1" -ForegroundColor Cyan
  exit 0
} else {
  Write-Host "=== $script:failures 项检查失败 ✖ ===" -ForegroundColor Red
  Write-Host "修复上述问题后重新运行此脚本。" -ForegroundColor Yellow
  exit 1
}
