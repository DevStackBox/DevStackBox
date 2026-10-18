# make-latest-json.ps1
#
# Generates release/latest.json from the Tauri build output.
# Run this after "npm run build:release" completes successfully.
#
# Output: release/latest.json  (ready to upload to GitHub Release)
#
# Usage (build + generate in one step):
#   npm run build:release
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
$repoOwner = "DevStackBox"
$repoName  = "DevStackBox"

Write-Host "Building latest.json for v$version"

$bundleRoot = "$PSScriptRoot\..\src-tauri\target\release\bundle"

$bundleDir = if ($UseMsi) { Join-Path $bundleRoot "msi" } else { Join-Path $bundleRoot "nsis" }
$extension = if ($UseMsi) { ".msi" } else { "-setup.exe" }
$expectedName = "DevStackBox_${version}_x64${extension}"
if ($UseMsi) {
    $matchingInstallers = @(Get-ChildItem -LiteralPath $bundleDir -File | Where-Object { $_.Name -match ("^DevStackBox_" + [regex]::Escape($version) + "_x64(?:_[A-Za-z-]+)?\.msi$") })
    if ($matchingInstallers.Count -ne 1) { throw "Expected exactly one MSI for v$version x64; found $($matchingInstallers.Count)." }
    $expectedName = $matchingInstallers[0].Name
}
$installerPath = Join-Path $bundleDir $expectedName
$signaturePath = $installerPath + ".sig"
if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
    throw "Matching installer missing: $installerPath. Complete the release build first."
}
if (-not (Test-Path -LiteralPath $signaturePath -PathType Leaf)) {
    throw "Matching signature missing: $signaturePath. Complete the signed release build first."
}
$exeFile = Get-Item -LiteralPath $installerPath
$sigFile = Get-Item -LiteralPath $signaturePath
if ($sigFile.LastWriteTimeUtc -lt $exeFile.LastWriteTimeUtc) {
    throw "Signature predates the installer. Complete signing before generating update metadata."
}

$signature = (Get-Content $sigFile.FullName -Raw).Trim()
$assetName = $exeFile.Name
$downloadUrl = "https://github.com/$repoOwner/$repoName/releases/download/v$version/$assetName"
$pubDate = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")

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

Write-Host "  $outputPath"
Write-Host ""
Write-Host "GitHub Release URL:"
Write-Host "  https://github.com/$repoOwner/$repoName/releases/new?tag=v$version&title=DevStackBox+v$version"
