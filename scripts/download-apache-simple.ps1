# Download Apache 64-bit for DevStackBox
Write-Host "Downloading Apache 64-bit for DevStackBox..." -ForegroundColor Green

$apacheUrl = "https://www.apachelounge.com/download/VS17/binaries/httpd-2.4.62-240904-win64-VS17.zip"
$apacheZip = "apache-64bit.zip"
$extractPath = "apache-temp"

try {
    Write-Host "Downloading Apache 64-bit..." -ForegroundColor Blue
    Invoke-WebRequest -Uri $apacheUrl -OutFile $apacheZip -UserAgent "Mozilla/5.0"
    
    Write-Host "Extracting Apache..." -ForegroundColor Blue
    Expand-Archive -Path $apacheZip -DestinationPath $extractPath -Force
    
    $apache24Path = Get-ChildItem -Path $extractPath -Directory -Name "*Apache24*" | Select-Object -First 1
    
    if ($apache24Path) {
        $sourcePath = Join-Path $extractPath $apache24Path
        
        if (Test-Path "apache") {
            Write-Host "Backing up existing Apache..." -ForegroundColor Yellow
            if (Test-Path "apache-backup") {
                Remove-Item "apache-backup" -Recurse -Force
            }
            Rename-Item "apache" "apache-backup"
        }
        
        Write-Host "Installing new Apache 64-bit..." -ForegroundColor Green
        Move-Item $sourcePath "apache"
        
        Remove-Item $apacheZip -Force
        Remove-Item $extractPath -Recurse -Force
        
        Write-Host "Apache 64-bit installed successfully!" -ForegroundColor Green
        
    } else {
        throw "Apache24 folder not found in downloaded archive"
    }
    
} catch {
    Write-Host "Error downloading Apache: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Manual download: https://www.apachelounge.com/download/" -ForegroundColor Yellow
    
    if (Test-Path $apacheZip) { Remove-Item $apacheZip -Force }
    if (Test-Path $extractPath) { Remove-Item $extractPath -Recurse -Force }
}

Write-Host "Next: Test with npm run tauri dev" -ForegroundColor Cyan
