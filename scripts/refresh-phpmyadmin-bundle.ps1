param(
  [string]$Version = "5.2.2",
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [bool]$RemovePreviousBackup = $true
)
$ErrorActionPreference = "Stop"
$pmaDir = Join-Path $RepoRoot "phpmyadmin"
$zipName = "phpMyAdmin-$Version-all-languages.zip"
$url = "https://files.phpmyadmin.net/phpMyAdmin/$Version/$zipName"
$temp = Join-Path $env:TEMP "devstackbox-pma-refresh"
New-Item -ItemType Directory -Force -Path $temp | Out-Null
$zipPath = Join-Path $temp $zipName
Write-Host "Downloading $url ..."
Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
Expand-Archive -Path $zipPath -DestinationPath $temp -Force
$extracted = Get-ChildItem -Path $temp -Directory | Where-Object { $_.Name -like "phpMyAdmin-*" } | Select-Object -First 1
if (-not $extracted) { throw "Extracted folder not found" }
$backupDir = $null
if (Test-Path $pmaDir) {
  $backupName = "phpmyadmin-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss")
  Rename-Item -Path $pmaDir -NewName $backupName
  $backupDir = Join-Path $RepoRoot $backupName
}
Copy-Item -Path $extracted.FullName -Destination $pmaDir -Recurse
if ($RemovePreviousBackup -and $backupDir -and (Test-Path -LiteralPath $backupDir)) {
  Remove-Item -LiteralPath $backupDir -Recurse -Force
  Write-Host "Removed previous backup: $(Split-Path -Leaf $backupDir)"
}
Write-Host "phpMyAdmin updated under $pmaDir"
