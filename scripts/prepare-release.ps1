# DevStackBox Release Script v0.1.0-alpha.1
# PowerShell version for Windows

Write-Host "🚀 DevStackBox Release Helper" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green

# Check if build artifacts exist
$msiPath = "src-tauri\target\release\bundle\msi\DevStackBox_0.1.0-1_x64_en-US.msi"
$nsisPath = "src-tauri\target\release\bundle\nsis\DevStackBox_0.1.0-1_x64-setup.exe"

if (-not (Test-Path $msiPath)) {
    Write-Host "❌ MSI installer not found. Please run 'npm run tauri build' first." -ForegroundColor Red
    Write-Host "Expected: $msiPath" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $nsisPath)) {
    Write-Host "❌ NSIS installer not found. Please run 'npm run tauri build' first." -ForegroundColor Red
    Write-Host "Expected: $nsisPath" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Build artifacts found!" -ForegroundColor Green

# Create release directory
if (-not (Test-Path "release")) {
    New-Item -ItemType Directory -Path "release" | Out-Null
}

# Copy installers
Copy-Item $msiPath "release\" -Force
Copy-Item $nsisPath "release\" -Force

# Copy release notes
Copy-Item "RELEASE_NOTES.md" "release\" -Force

Write-Host "📦 Release assets prepared in .\release\ directory:" -ForegroundColor Cyan
Get-ChildItem "release\" | Format-Table Name, Length, LastWriteTime

Write-Host ""
Write-Host "🎯 Next Steps:" -ForegroundColor Yellow
Write-Host "1. Create a new release on GitHub: https://github.com/DevStackBox/DevStackBox/releases/new"
Write-Host "2. Tag: v0.1.0-alpha.1"
Write-Host "3. Title: DevStackBox v0.1.0-alpha.1 - First Alpha Release"
Write-Host "4. Upload these files as release assets:"
Write-Host "   - DevStackBox_0.1.0-1_x64_en-US.msi"
Write-Host "   - DevStackBox_0.1.0-1_x64-setup.exe"
Write-Host "5. Use RELEASE_NOTES.md as the release description"
Write-Host "6. Mark as 'Pre-release' since it is an alpha"
Write-Host ""
Write-Host "🔗 GitHub Release URL: https://github.com/DevStackBox/DevStackBox/releases/new" -ForegroundColor Cyan

# Open GitHub releases page
$response = Read-Host "Would you like to open the GitHub releases page now? (y/n)"
if ($response -eq "y" -or $response -eq "Y") {
    Start-Process "https://github.com/DevStackBox/DevStackBox/releases/new"
}
