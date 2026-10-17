# Removes local build artifacts, bundle refresh backups, and on-demand PHP copies.
# Safe to run anytime; does not touch tracked mysql/apache/phpmyadmin bundles (except gitignored php versions).
param(
  [switch]$Force
)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Remove-TreeIfExists {
  param([string]$RelativePath)
  $full = Join-Path $RepoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $full)) { return }
  if (-not $Force) {
    Write-Host "[WhatIf] Would remove: $RelativePath"
    return
  }
  Write-Host "Removing: $RelativePath"
  try {
    Remove-Item -LiteralPath $full -Recurse -Force -ErrorAction Stop
  } catch {
    Write-Warning "Could not fully remove ${RelativePath}: $($_.Exception.Message)"
  }
}

Write-Host "DevStackBox local cleanup (repo: $RepoRoot)"
if (-not $Force) {
  Write-Host "Dry run. Re-run with -Force to delete.`n"
}

Remove-TreeIfExists "src-tauri/target"
Remove-TreeIfExists "release"
Remove-TreeIfExists "dist"

Get-ChildItem -Path $RepoRoot -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^(mysql-backup-|phpmyadmin-backup-|apache-backup)' } |
  ForEach-Object { Remove-TreeIfExists $_.Name }

foreach ($p in @("php/8.1", "php/8.2", "php/8.4", "php/8.5", "php/current")) {
  Remove-TreeIfExists $p
}

$logsDir = Join-Path $RepoRoot "logs"
if (Test-Path -LiteralPath $logsDir) {
  if ($Force) {
    Write-Host "Clearing logs/"
    Get-ChildItem -LiteralPath $logsDir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "[WhatIf] Would clear: logs/"
  }
}

$tmpLog = Join-Path $RepoRoot ".tmp-tauri-build.log"
if (Test-Path -LiteralPath $tmpLog) {
  if ($Force) { Remove-Item -LiteralPath $tmpLog -Force; Write-Host "Removed .tmp-tauri-build.log" }
  else { Write-Host "[WhatIf] Would remove: .tmp-tauri-build.log" }
}

if ($Force) { Write-Host "`nDone." } else { Write-Host "`nNo files deleted. Use: .\scripts\cleanup-local.ps1 -Force" }
