# make-latest-json.ps1
#
# Generates release/latest.json from the Tauri build output.
# Run this after "pnpm tauri build" completes successfully.
#
# Output: release/latest.json  (ready to upload to GitHub Release)
#
# Usage (build + generate in one step):
#   $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content "$env:USERPROFILE\.tauri\devstackbox.key" -Raw).Trim()
#   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
#   pnpm tauri build
#   .\scripts\make-latest-json.ps1
#   .\scripts\make-latest-json.ps1 -Notes "Bug fixes and improvements"

param(
    [string]$Notes = "See CHANGELOG.md for details.",
    [switch]$UseMsi
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Read version from tauri.conf.json
$tauriConf = Get-Content "$PSScriptRoot\..\src-tauri\tauri.conf.json" | ConvertFrom-Json
$version = $tauriConf.version
$repoOwner = "ProgrammerNomad"
$repoName  = "DevStackBox"

Write-Host "Building latest.json for v$version"

$bundleRoot = "$PSScriptRoot\..\src-tauri\target\release\bundle"

if ($UseMsi) {
    $msiDir   = Join-Path $bundleRoot "msi"
    $exeFile  = Get-ChildItem $msiDir -Filter "*.msi" | Select-Object -First 1
    $sigFile  = Get-ChildItem $msiDir -Filter "*.msi.sig" | Select-Object -First 1
    $assetExt = ".msi"
} else {
    $nsisDir  = Join-Path $bundleRoot "nsis"
    $exeFile  = Get-ChildItem $nsisDir -Filter "*-setup.exe" | Select-Object -First 1
    $sigFile  = Get-ChildItem $nsisDir -Filter "*-setup.exe.sig" | Select-Object -First 1
    $assetExt = "-setup.exe"
}

if (-not $exeFile) {
    Write-Error "Installer not found in bundle output. Run 'pnpm tauri build' first."
    exit 1
}
if (-not $sigFile) {
    Write-Error "Signature file (.sig) not found. Ensure TAURI_SIGNING_PRIVATE_KEY_PATH is set before building."
    exit 1
}

$signature = (Get-Content $sigFile.FullName -Raw).Trim()
$assetName = $exeFile.Name
$downloadUrl = "https://github.com/$repoOwner/$repoName/releases/download/v$version/$assetName"
$pubDate = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")

$latestJson = [ordered]@{
    version  = $version
    notes    = $Notes
    pub_date = $pubDate
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = $signature
            url       = $downloadUrl
        }
    }
}

$outputDir = "$PSScriptRoot\..\release"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$outputPath = Join-Path $outputDir "latest.json"
$latestJson | ConvertTo-Json -Depth 5 | Set-Content $outputPath -Encoding UTF8

Write-Host ""
Write-Host "latest.json written to: $outputPath"
Write-Host ""
Write-Host "Files to upload to GitHub Release v${version}:"
Write-Host "  $($exeFile.FullName)"
Write-Host "  $($sigFile.FullName)"

if ($UseMsi) {
    $altNsis = Get-ChildItem (Join-Path $bundleRoot "nsis") -Filter "*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    $altSig  = Get-ChildItem (Join-Path $bundleRoot "nsis") -Filter "*-setup.exe.sig" -ErrorAction SilentlyContinue | Select-Object -First 1
} else {
    $altNsis = Get-ChildItem (Join-Path $bundleRoot "msi") -Filter "*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
    $altSig  = Get-ChildItem (Join-Path $bundleRoot "msi") -Filter "*.msi.sig" -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($altNsis) { Write-Host "  $($altNsis.FullName)" }
if ($altSig)  { Write-Host "  $($altSig.FullName)" }
Write-Host "  $outputPath"
Write-Host ""
Write-Host "GitHub Release URL:"
Write-Host "  https://github.com/$repoOwner/$repoName/releases/new?tag=v$version&title=DevStackBox+v$version"
