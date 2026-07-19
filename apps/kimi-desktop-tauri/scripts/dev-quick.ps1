<#
.SYNOPSIS
  Kimi Code Desktop — tester / developer one-click launch (Windows).
  PowerShell port of scripts/dev-quick.sh.

.DESCRIPTION
  Equivalent to:
    .\scripts\build-run.ps1 -Foreground -LogLevel info

  Runs in foreground (Ctrl+C to stop). The daemon writes info-level logs to
  ~\.kimi-code\desktop\server\server.log for diagnosing prompt failures.

  For deeper diagnostics:
    .\scripts\build-run.ps1 -Foreground -LogLevel debug -DebugEndpoints

.PARAMETER SkipSea
  Forwarded to build-run.ps1 — reuse an existing SEA instead of rebuilding.
#>
[CmdletBinding()]
param(
  [switch]$SkipSea
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentLog = Join-Path $env:USERPROFILE '.kimi-code\desktop\server\server.log'

Write-Host "▸ Kimi Code Desktop · 快速启动" -ForegroundColor Cyan
Write-Host "  模式：前台（Ctrl+C 退出）"
Write-Host "  daemon 日志：$AgentLog"
Write-Host "  停止：Ctrl+C，或关闭客户端窗口"
Write-Host ""

$logDir = Split-Path -Parent $AgentLog
if (-not (Test-Path $logDir)) {
  Write-Host "⚠ 首次启动：embedded agent 将在 $logDir 创建日志目录" -ForegroundColor Yellow
  Write-Host ""
}

# Forward to build-run.ps1 with preset diagnostics. Pass through extra flags.
$extraArgs = @()
if ($SkipSea) { $extraArgs += '-SkipSea' }

& (Join-Path $ScriptDir 'build-run.ps1') -Foreground -LogLevel info @extraArgs
