# scripts/prepare-binaries.ps1
Write-Host "Preparing DevStackBox binaries for release..." -ForegroundColor Green

$srcTauriPath = "src-tauri"
$componentsFound = 0
$componentsTotal = 6

Write-Host "Copying server components..." -ForegroundColor Blue

# Copy Apache
if (Test-Path "apache") {
    Write-Host "   Copying Apache binaries..." -ForegroundColor Green
    if (Test-Path "$srcTauriPath/apache") {
        Remove-Item "$srcTauriPath/apache" -Recurse -Force
    }
    Copy-Item -Path "apache" -Destination "$srcTauriPath/apache" -Recurse -Force
    $componentsFound++
} else {
    New-Item -ItemType Directory -Force -Path "$srcTauriPath/apache" | Out-Null
    New-Item -ItemType File -Force -Path "$srcTauriPath/apache/README.txt" -Value "Placeholder for Apache component" | Out-Null
    Write-Host "   Created placeholder for Apache" -ForegroundColor Yellow
}

# Copy MySQL (optimize for release)
if (Test-Path "mysql") {
    Write-Host "   Copying MySQL binaries..." -ForegroundColor Green
    if (Test-Path "$srcTauriPath/mysql") {
        Remove-Item "$srcTauriPath/mysql" -Recurse -Force
    }
    Copy-Item -Path "mysql" -Destination "$srcTauriPath/mysql" -Recurse -Force
    
    # Optimize MySQL for release (remove docs but keep structure)
    @("docs", "mysql-test") | ForEach-Object {
        $path = "$srcTauriPath/mysql/$_"
        if (Test-Path $path) {
            Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "     Removed $_ (docs) to reduce size" -ForegroundColor Gray
        }
    }
    
    # Clean data directory but keep structure
    if (Test-Path "$srcTauriPath/mysql/data") {
        Get-ChildItem "$srcTauriPath/mysql/data" | ForEach-Object {
            if ($_.Name -notin @("mysql", "performance_schema", "sys")) {
                Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
    
    $componentsFound++
} else {
    New-Item -ItemType Directory -Force -Path "$srcTauriPath/mysql" | Out-Null
    New-Item -ItemType File -Force -Path "$srcTauriPath/mysql/README.txt" -Value "Placeholder for MySQL component" | Out-Null
    Write-Host "   Created placeholder for MySQL" -ForegroundColor Yellow
}

# Copy PHP
if (Test-Path "php") {
    Write-Host "   Copying PHP binaries..." -ForegroundColor Green
    if (Test-Path "$srcTauriPath/php") {
        Remove-Item "$srcTauriPath/php" -Recurse -Force
    }
    Copy-Item -Path "php" -Destination "$srcTauriPath/php" -Recurse -Force
    
    # Clean PHP temp directories
    @("sessions", "tmp") | ForEach-Object {
        $path = "$srcTauriPath/php/$_"
        if (Test-Path $path) {
            Remove-Item "$path/*" -Force -ErrorAction SilentlyContinue
        }
    }
    
    $componentsFound++
} else {
    New-Item -ItemType Directory -Force -Path "$srcTauriPath/php" | Out-Null
    New-Item -ItemType File -Force -Path "$srcTauriPath/php/README.txt" -Value "Placeholder for PHP component" | Out-Null
    Write-Host "   Created placeholder for PHP" -ForegroundColor Yellow
}

# Copy phpMyAdmin
if (Test-Path "phpmyadmin") {
    Write-Host "   Copying phpMyAdmin..." -ForegroundColor Green
    if (Test-Path "$srcTauriPath/phpmyadmin") {
        Remove-Item "$srcTauriPath/phpmyadmin" -Recurse -Force
    }
    Copy-Item -Path "phpmyadmin" -Destination "$srcTauriPath/phpmyadmin" -Recurse -Force
    
    # Clean phpMyAdmin temp directories
    @("tmp", "upload", "save") | ForEach-Object {
        $tempPath = "$srcTauriPath/phpmyadmin/$_"
        if (Test-Path $tempPath) {
            Remove-Item "$tempPath/*" -Force -ErrorAction SilentlyContinue
        } else {
            New-Item -ItemType Directory -Path $tempPath -Force | Out-Null
        }
    }
    
    $componentsFound++
} else {
    New-Item -ItemType Directory -Force -Path "$srcTauriPath/phpmyadmin" | Out-Null
    New-Item -ItemType File -Force -Path "$srcTauriPath/phpmyadmin/README.txt" -Value "Placeholder for phpMyAdmin component" | Out-Null
    Write-Host "   Created placeholder for phpMyAdmin" -ForegroundColor Yellow
}

# Copy www directory
if (Test-Path "www") {
    Write-Host "   Copying www directory..." -ForegroundColor Green
    if (Test-Path "$srcTauriPath/www") {
        Remove-Item "$srcTauriPath/www" -Recurse -Force
    }
    Copy-Item -Path "www" -Destination "$srcTauriPath/www" -Recurse -Force
    $componentsFound++
} else {
    New-Item -ItemType Directory -Force -Path "$srcTauriPath/www" | Out-Null
    New-Item -ItemType File -Force -Path "$srcTauriPath/www/README.txt" -Value "Placeholder for WWW component" | Out-Null
    $indexContent = '<html><head><title>DevStackBox</title></head><body><h1>DevStackBox</h1><p>Ready!</p></body></html>'
    New-Item -ItemType File -Force -Path "$srcTauriPath/www/index.html" -Value $indexContent | Out-Null
    Write-Host "   Created placeholder for WWW" -ForegroundColor Yellow
}

# Copy config files
if (Test-Path "config") {
    Write-Host "   Copying configuration files..." -ForegroundColor Green
    if (Test-Path "$srcTauriPath/config") {
        Remove-Item "$srcTauriPath/config" -Recurse -Force
    }
    Copy-Item -Path "config" -Destination "$srcTauriPath/config" -Recurse -Force
    $componentsFound++
} else {
    New-Item -ItemType Directory -Force -Path "$srcTauriPath/config" | Out-Null
    New-Item -ItemType File -Force -Path "$srcTauriPath/config/README.txt" -Value "Placeholder for Config component" | Out-Null
    Write-Host "   Created placeholder for Config" -ForegroundColor Yellow
}

# Calculate and display sizes
Write-Host ""
Write-Host "Component Summary:" -ForegroundColor Cyan
Write-Host "   Total components: $componentsTotal" -ForegroundColor White
Write-Host "   Found and copied: $componentsFound" -ForegroundColor Green
Write-Host "   Placeholders created: $($componentsTotal - $componentsFound)" -ForegroundColor Yellow

# Calculate total size
$totalSize = 0
if (Test-Path "$srcTauriPath") {
    $totalSize = (Get-ChildItem -Path "$srcTauriPath" -Recurse -Force | Measure-Object -Property Length -Sum).Sum
    $totalSizeMB = [math]::Round($totalSize / 1MB, 2)
    Write-Host "   Total bundled size: $totalSizeMB MB" -ForegroundColor Cyan
    
    if ($totalSizeMB -gt 100) {
        Write-Host "   WARNING: Large bundle size may cause build issues!" -ForegroundColor Red
    } elseif ($totalSizeMB -lt 10) {
        Write-Host "   WARNING: Bundle seems too small - server components may be missing!" -ForegroundColor Yellow
    }
}

if ($componentsFound -eq 0) {
    Write-Host ""
    Write-Host "Warning: No server components found in repository!" -ForegroundColor Yellow
    Write-Host "Building with placeholder files only." -ForegroundColor Yellow
} elseif ($componentsFound -lt $componentsTotal) {
    Write-Host ""
    Write-Host "Partial component set detected." -ForegroundColor Yellow
    Write-Host "Some features may not be available without missing components." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "All binaries prepared for bundling!" -ForegroundColor Green
Write-Host "Ready to run: npm run tauri build" -ForegroundColor Yellow
