$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$releases = Invoke-RestMethod -Uri "https://windows.php.net/downloads/releases/releases.json" -UseBasicParsing
$branch = $releases."8.3"
$ver = $branch.version
$path = $branch."ts-vs16-x64".zip.path
$url = "https://windows.php.net/downloads/releases/$path"
Write-Host "Version: $ver"
Write-Host "URL: $url"

$tmp = Join-Path $env:TEMP "php-8.3.zip"
Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing

$dest = Join-Path $root "php\8.3"
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
New-Item -ItemType Directory -Path $dest | Out-Null
Expand-Archive -Path $tmp -DestinationPath $dest -Force

$ini = Join-Path $dest "php.ini"
$iniDev = Join-Path $dest "php.ini-development"
if (-not (Test-Path $ini)) { Copy-Item $iniDev $ini }

$content = Get-Content -Raw $ini
if ($content -notmatch "(?m)^; configVersion=1") {
    $content = "; configVersion=1`r`n" + $content
}

function SetOrAdd([string]$body, [string]$key, [string]$val) {
    $pattern = "(?m)^\s*;?\s*$([regex]::Escape($key))\s*=.*$"
    if ($body -match $pattern) {
        return [regex]::Replace($body, $pattern, "$key=$val")
    }
    return $body + "`r`n$key=$val`r`n"
}

$content = SetOrAdd $content "memory_limit" "256M"
$content = SetOrAdd $content "upload_max_filesize" "64M"
$content = SetOrAdd $content "post_max_size" "64M"
Set-Content -Path $ini -Value $content -Encoding ASCII

$files = Get-ChildItem $dest -File
Write-Host "Files in php/8.3 (count=$($files.Count))"
Write-Host "PHP 8.3 READY"
