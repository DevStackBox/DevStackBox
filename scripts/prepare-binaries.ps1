# scripts/prepare-binaries.ps1
Write-Host "🔧 Preparing DevStackBox binaries for release..." -ForegroundColor Green

# Ensure src-tauri directory structure for bundling
$srcTauriPath = "src-tauri"

# Copy all server components to src-tauri for bundling
Write-Host "📦 Copying server components..." -ForegroundColor Blue

# Copy Apache
if (Test-Path "apache") {
    Write-Host "   ✅ Copying Apache binaries..."
    if (Test-Path "$srcTauriPath/apache") {
        Remove-Item "$srcTauriPath/apache" -Recurse -Force
    }
    Copy-Item -Path "apache" -Destination "$srcTauriPath/apache" -Recurse -Force
}

# Copy MySQL  
if (Test-Path "mysql") {
    Write-Host "   ✅ Copying MySQL binaries..."
    Copy-Item -Path "mysql" -Destination "$srcTauriPath/mysql" -Recurse -Force
    # Exclude runtime data but keep structure
    if (Test-Path "$srcTauriPath/mysql/data") {
        Remove-Item "$srcTauriPath/mysql/data/*" -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Copy PHP
if (Test-Path "php") {
    Write-Host "   ✅ Copying PHP binaries..."
    Copy-Item -Path "php" -Destination "$srcTauriPath/php" -Recurse -Force
    # Exclude sessions but keep structure
    if (Test-Path "$srcTauriPath/php/sessions") {
        Remove-Item "$srcTauriPath/php/sessions/*" -Force -ErrorAction SilentlyContinue
    }
}

# Copy phpMyAdmin
if (Test-Path "phpmyadmin") {
    Write-Host "   ✅ Copying phpMyAdmin..."
    Copy-Item -Path "phpmyadmin" -Destination "$srcTauriPath/phpmyadmin" -Recurse -Force
    # Exclude temp files but keep structure
    @("tmp", "upload", "save") | ForEach-Object {
        $tempPath = "$srcTauriPath/phpmyadmin/$_"
        if (Test-Path $tempPath) {
            Remove-Item "$tempPath/*" -Force -ErrorAction SilentlyContinue
        } else {
            New-Item -ItemType Directory -Path $tempPath -Force | Out-Null
        }
    }
}

# Copy www directory
if (Test-Path "www") {
    Write-Host "   ✅ Copying www directory..."
    Copy-Item -Path "www" -Destination "$srcTauriPath/www" -Recurse -Force
}

# Copy config files
if (Test-Path "config") {
    Write-Host "   ✅ Copying configuration files..."
    Copy-Item -Path "config" -Destination "$srcTauriPath/config" -Recurse -Force
}

Write-Host "All binaries prepared for bundling!" -ForegroundColor Green
Write-Host "Ready to run: npm run tauri build" -ForegroundColor Yellow