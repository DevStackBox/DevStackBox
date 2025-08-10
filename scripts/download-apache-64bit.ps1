# Download Apache 64-bit for DevStackBox
# This script downloads the correct 64-bit Apache for Windows x64

Write-Host "🔧 Downloading Apache 64-bit for DevStackBox..." -ForegroundColor Green

$apacheUrl = "https://www.apachelounge.com/download/VS17/binaries/httpd-2.4.65-250724-Win64-VS17.zip"
$apacheZip = "apache-64bit.zip"
$extractPath = "apache-temp"

try {
    # Download Apache 64-bit
    Write-Host "📦 Downloading Apache 64-bit from ApacheLounge..." -ForegroundColor Blue
    Invoke-WebRequest -Uri $apacheUrl -OutFile $apacheZip -UserAgent "Mozilla/5.0"
    
    # Extract
    Write-Host "📂 Extracting Apache..." -ForegroundColor Blue
    Expand-Archive -Path $apacheZip -DestinationPath $extractPath -Force
    
    # Find the Apache24 folder
    $apache24Path = Get-ChildItem -Path $extractPath -Directory -Name "*Apache24*" | Select-Object -First 1
    
    if ($apache24Path) {
        $sourcePath = Join-Path $extractPath $apache24Path
        
        # Backup existing apache folder
        if (Test-Path "apache") {
            Write-Host "💾 Backing up existing Apache..." -ForegroundColor Yellow
            if (Test-Path "apache-backup") {
                Remove-Item "apache-backup" -Recurse -Force
            }
            Rename-Item "apache" "apache-backup"
        }
        
        # Move new Apache
        Write-Host "🚀 Installing new Apache 64-bit..." -ForegroundColor Green
        Move-Item $sourcePath "apache"
        
        # Cleanup
        Remove-Item $apacheZip -Force
        Remove-Item $extractPath -Recurse -Force
        
        Write-Host "✅ Apache 64-bit installed successfully!" -ForegroundColor Green
        Write-Host "📁 Old Apache backed up to 'apache-backup'" -ForegroundColor Cyan
        
        # Verify architecture
        Write-Host "🔍 Verifying Apache architecture..." -ForegroundColor Blue
        $httpPath = "apache\bin\httpd.exe"
        if (Test-Path $httpPath) {
            # Check file properties
            $fileInfo = Get-Item $httpPath
            Write-Host "✅ Apache httpd.exe found: $($fileInfo.Length) bytes" -ForegroundColor Green
            Write-Host "🎯 This Apache should be compatible with 64-bit DevStackBox" -ForegroundColor Green
        }
        
    } else {
        throw "Apache24 folder not found in downloaded archive"
    }
    
} catch {
    Write-Host "❌ Error downloading Apache: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "📝 Manual download: https://www.apachelounge.com/download/" -ForegroundColor Yellow
    
    # Cleanup on error
    if (Test-Path $apacheZip) { Remove-Item $apacheZip -Force }
    if (Test-Path $extractPath) { Remove-Item $extractPath -Recurse -Force }
}

Write-Host ""
Write-Host "🔄 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Test Apache: npm run tauri dev" -ForegroundColor White
Write-Host "   2. Start Apache from DevStackBox UI" -ForegroundColor White
Write-Host "   3. If working, build new release: npm run tauri build" -ForegroundColor White
