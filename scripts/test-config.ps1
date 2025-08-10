# Test Apache Configuration
# This script tests if the Apache configuration is correctly generated

Write-Host "Testing Apache Configuration Generation..." -ForegroundColor Green

# Remove existing config to test regeneration
$configPath = "config\httpd.conf"
$phpmyadminConfigPath = "config\phpmyadmin.conf"

if (Test-Path $configPath) {
    Write-Host "Removing existing httpd.conf for testing..." -ForegroundColor Yellow
    Remove-Item $configPath -Force
}

if (Test-Path $phpmyadminConfigPath) {
    Write-Host "Removing existing phpmyadmin.conf for testing..." -ForegroundColor Yellow
    Remove-Item $phpmyadminConfigPath -Force
}

Write-Host "Configuration files removed. They will be regenerated when Apache starts." -ForegroundColor Blue
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Run: npm run tauri dev" -ForegroundColor White
Write-Host "2. Start Apache from the UI" -ForegroundColor White
Write-Host "3. Check if config files are generated with correct paths" -ForegroundColor White
Write-Host "4. Test http://localhost/ and http://localhost/phpmyadmin" -ForegroundColor White
