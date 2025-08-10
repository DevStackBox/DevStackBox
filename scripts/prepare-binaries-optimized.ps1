Write-Host "🔧 Preparing optimized DevStackBox binaries..." -ForegroundColor Green

$srcTauriPath = "src-tauri"

# Clean previous copies
Write-Host "📦 Cleaning previous build artifacts..." -ForegroundColor Blue
Remove-Item "$srcTauriPath/apache", "$srcTauriPath/mysql", "$srcTauriPath/php", "$srcTauriPath/phpmyadmin", "$srcTauriPath/www", "$srcTauriPath/config" -Recurse -Force -ErrorAction SilentlyContinue

# Copy Apache (optimized)
if (Test-Path "apache") {
    Write-Host "   ✅ Copying Apache (essential only)..." -ForegroundColor Yellow
    Copy-Item -Path "apache/bin" -Destination "$srcTauriPath/apache/bin" -Recurse -Force
    Copy-Item -Path "apache/conf" -Destination "$srcTauriPath/apache/conf" -Recurse -Force
    Copy-Item -Path "apache/modules" -Destination "$srcTauriPath/apache/modules" -Recurse -Force
}

# Copy MySQL (optimized)
if (Test-Path "mysql") {
    Write-Host "   ✅ Copying MySQL (essential only)..." -ForegroundColor Yellow
    Copy-Item -Path "mysql/bin" -Destination "$srcTauriPath/mysql/bin" -Recurse -Force
    Copy-Item -Path "mysql/lib" -Destination "$srcTauriPath/mysql/lib" -Recurse -Force
    Copy-Item -Path "mysql/share/charsets" -Destination "$srcTauriPath/mysql/share/charsets" -Recurse -Force
    Copy-Item -Path "mysql/share/english" -Destination "$srcTauriPath/mysql/share/english" -Recurse -Force
}

# Copy PHP (optimized)
if (Test-Path "php") {
    Write-Host "   ✅ Copying PHP 8.2..." -ForegroundColor Yellow
    Copy-Item -Path "php/8.2" -Destination "$srcTauriPath/php/8.2" -Recurse -Force
}

# Copy phpMyAdmin (optimized)  
if (Test-Path "phpmyadmin") {
    Write-Host "   ✅ Copying phpMyAdmin..." -ForegroundColor Yellow
    Copy-Item -Path "phpmyadmin" -Destination "$srcTauriPath/phpmyadmin" -Recurse -Force -Exclude "doc", "examples", "setup", "*.md", "CHANGELOG*"
}

# Copy www and config (small)
if (Test-Path "www") {
    Write-Host "   ✅ Copying www..." -ForegroundColor Yellow
    Copy-Item -Path "www" -Destination "$srcTauriPath/www" -Recurse -Force
}

if (Test-Path "config") {
    Write-Host "   ✅ Copying config..." -ForegroundColor Yellow
    Copy-Item -Path "config" -Destination "$srcTauriPath/config" -Recurse -Force
}

# Calculate total size
$totalSize = (Get-ChildItem "$srcTauriPath/apache", "$srcTauriPath/mysql", "$srcTauriPath/php", "$srcTauriPath/phpmyadmin" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB

Write-Host ""
Write-Host "✅ Optimized DevStackBox bundle ready!" -ForegroundColor Green
Write-Host "📊 Total bundle size: $([math]::Round($totalSize, 1))MB" -ForegroundColor Cyan
Write-Host ""
