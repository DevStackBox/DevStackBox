# scripts/prepare-binaries.ps1
Write-Host "Preparing DevStackBox binaries for release..." -ForegroundColor Green

$srcTauriPath = "src-tauri"
$componentsFound = 0
$componentsTotal = 6

Write-Host "Copying server components..." -ForegroundColor Blue

# Copy Apache
if (Test-Path "apache") {
    Write-Host "   Copying Apache binaries..."
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

# Copy MySQL  
if (Test-Path "mysql") {
    Write-Host "   Copying MySQL binaries..."
    if (Test-Path "$srcTauriPath/mysql") {
        Remove-Item "$srcTauriPath/mysql" -Recurse -Force
    }
    Copy-Item -Path "mysql" -Destination "$srcTauriPath/mysql" -Recurse -Force
    $componentsFound++
} else {
    New-Item -ItemType Directory -Force -Path "$srcTauriPath/mysql" | Out-Null
    New-Item -ItemType File -Force -Path "$srcTauriPath/mysql/README.txt" -Value "Placeholder for MySQL component" | Out-Null
    Write-Host "   Created placeholder for MySQL" -ForegroundColor Yellow
}

# Copy PHP
if (Test-Path "php") {
    Write-Host "   Copying PHP binaries..."
    if (Test-Path "$srcTauriPath/php") {
        Remove-Item "$srcTauriPath/php" -Recurse -Force
    }
    Copy-Item -Path "php" -Destination "$srcTauriPath/php" -Recurse -Force
    $componentsFound++
} else {
    New-Item -ItemType Directory -Force -Path "$srcTauriPath/php" | Out-Null
    New-Item -ItemType File -Force -Path "$srcTauriPath/php/README.txt" -Value "Placeholder for PHP component" | Out-Null
    Write-Host "   Created placeholder for PHP" -ForegroundColor Yellow
}

# Copy phpMyAdmin
if (Test-Path "phpmyadmin") {
    Write-Host "   Copying phpMyAdmin..."
    if (Test-Path "$srcTauriPath/phpmyadmin") {
        Remove-Item "$srcTauriPath/phpmyadmin" -Recurse -Force
    }
    Copy-Item -Path "phpmyadmin" -Destination "$srcTauriPath/phpmyadmin" -Recurse -Force
    $componentsFound++
} else {
    New-Item -ItemType Directory -Force -Path "$srcTauriPath/phpmyadmin" | Out-Null
    New-Item -ItemType File -Force -Path "$srcTauriPath/phpmyadmin/README.txt" -Value "Placeholder for phpMyAdmin component" | Out-Null
    Write-Host "   Created placeholder for phpMyAdmin" -ForegroundColor Yellow
}

# Copy www directory
if (Test-Path "www") {
    Write-Host "   Copying www directory..."
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
    Write-Host "   Copying configuration files..."
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

Write-Host ""
Write-Host "Component Summary:" -ForegroundColor Cyan
Write-Host "   Total components: $componentsTotal"
Write-Host "   Found and copied: $componentsFound" -ForegroundColor Green
Write-Host "   Placeholders created: $($componentsTotal - $componentsFound)" -ForegroundColor Yellow

if ($componentsFound -eq 0) {
    Write-Host ""
    Write-Host "Warning: No server components found in repository!" -ForegroundColor Yellow
    Write-Host "Building with placeholder files only." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "All binaries prepared for bundling!" -ForegroundColor Green
Write-Host "Ready to run: npm run tauri build" -ForegroundColor Yellow
