# Replaces ./mysql with MySQL 8.4 LTS Windows x64 ZIP (fresh bundle for the installer).
# User data stays in %LOCALAPPDATA%\devstackbox\mysql-data - no in-place 8.0→8.4 migration in this script.
param(
  [string]$Version = "8.4.11",
  [string]$ZipPath = "",
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference = "Stop"
$mysqlDir = Join-Path $RepoRoot "mysql"
$zipName = "mysql-$Version-winx64.zip"
$url = "https://cdn.mysql.com/Downloads/MySQL-8.4/$zipName"
$temp = Join-Path $env:TEMP "devstackbox-mysql-refresh"
New-Item -ItemType Directory -Force -Path $temp | Out-Null
$zipPath = if ($ZipPath) { $ZipPath } else { Join-Path $temp $zipName }
if (-not (Test-Path -LiteralPath $zipPath)) {
  Write-Host "Downloading $url ..."
  curl.exe -fsSL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -o $zipPath $url
}
if (-not (Test-Path -LiteralPath $zipPath)) { throw "MySQL zip not found: $zipPath" }
Expand-Archive -Path $zipPath -DestinationPath $temp -Force
$extracted = Get-ChildItem -Path $temp -Directory | Where-Object { $_.Name -like "mysql-*" } | Select-Object -First 1
if (-not $extracted) { throw "Extracted folder not found" }
if (Test-Path $mysqlDir) {
  Rename-Item -Path $mysqlDir -NewName ("mysql-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
}
Copy-Item -Path $extracted.FullName -Destination $mysqlDir -Recurse
& (Join-Path $mysqlDir "bin\mysqld.exe") --version
Write-Host "MySQL bundle updated under $mysqlDir"
