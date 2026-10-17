# release-build.ps1 - see docs/development/RELEASE-RUNBOOK.md
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot
Get-Process light -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item "src-tauri\target\release\wix" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "src-tauri\target\release\bundle\msi" -Recurse -Force -ErrorAction SilentlyContinue
$keyPath = Join-Path $env:USERPROFILE ".tauri\devstackbox.key"
if (-not (Test-Path $keyPath)) { Write-Error "Missing $keyPath" }
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
pnpm tauri build 2>&1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$setup = Get-ChildItem "src-tauri\target\release\bundle\nsis\*-setup.exe" | Select-Object -First 1
if ($setup) { Get-FileHash $setup.FullName -Algorithm SHA256 | Format-List }
