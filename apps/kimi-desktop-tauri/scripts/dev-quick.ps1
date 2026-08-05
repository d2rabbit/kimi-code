<#
.SYNOPSIS
  Partial Lunar Eclipse — tester / developer one-click launch (Windows).
  PowerShell port of scripts/dev-quick.sh.

.DESCRIPTION
  Equivalent to:
    .\scripts\build-run.ps1 -Foreground -LogLevel info

  Runs in foreground (Ctrl+C to stop). The daemon writes info-level logs to
  ~\.kimi-code\desktop\server\server.log for diagnosing prompt failures.

  For deeper diagnostics:
    .\scripts\build-run.ps1 -Foreground -LogLevel debug -DebugEndpoints

.PARAMETER SkipAgent
  Forwarded to build-run.ps1 — reuse an existing main.cjs instead of rebuilding.

.PARAMETER BuildPackages
  Forwarded to build-run.ps1 — rebuild packages/ first (after upstream merge).
#>
[CmdletBinding()]
param(
  [switch]$SkipAgent,
  [switch]$BuildPackages
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentLog = Join-Path $env:USERPROFILE '.kimi-code\desktop\server\server.log'

Write-Host "[ Partial Lunar Eclipse - Quick Launch ]" -ForegroundColor Cyan
Write-Host "  Mode: foreground (Ctrl+C to stop)"
Write-Host "  Daemon log: $AgentLog"
Write-Host ""

$logDir = Split-Path -Parent $AgentLog
if (-not (Test-Path $logDir)) {
  Write-Host "[ First launch: embedded agent will create log dir at $logDir ]" -ForegroundColor Yellow
  Write-Host ""
}

# Forward to build-run.ps1 with preset diagnostics. Pass through extra flags.
$extraArgs = @()
if ($SkipAgent) { $extraArgs += '-SkipAgent' }
if ($BuildPackages) { $extraArgs += '-BuildPackages' }

& (Join-Path $ScriptDir 'build-run.ps1') -Foreground -LogLevel info @extraArgs
