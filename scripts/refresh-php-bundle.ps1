param([ValidateSet('8.2','8.3','8.4','8.5')][string]$Branch = '8.3')
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$phpRoot = Join-Path $root 'php'
$target = [IO.Path]::GetFullPath((Join-Path $phpRoot $Branch))
$minimum = @{ '8.2'='8.2.35'; '8.3'='8.3.36'; '8.4'='8.4.27'; '8.5'='8.5.12' }

function Get-ReleaseBase([string]$release) {
    if ($release -match '^(\d+\.\d+\.\d+)(?:-(\d+))?$') { return $Matches[1] }
    return $null
}

function Test-RuntimeMatchesRelease([string]$runtime, [string]$release) {
    $runtimeBase = Get-ReleaseBase $runtime
    $releaseBase = Get-ReleaseBase $release
    if (-not $runtimeBase -or -not $releaseBase -or $runtimeBase -ne $releaseBase) { return $false }
    if ($runtime -match '-(\d+)$') { return $runtime -eq $release }
    return $true
}

function Test-MeetsMinimum([string]$branch, [string]$release) {
    $base = Get-ReleaseBase $release
    if (-not $base) { return $false }
    return [version]$base -ge [version]$minimum[$branch]
}

$releases = Invoke-RestMethod 'https://windows.php.net/downloads/releases/releases.json'
$release = $releases.$Branch
$version = [string]$release.version
$branchPattern = '^' + [regex]::Escape($Branch) + '\.\d+(?:-\d+)?$'
if ($version -notmatch $branchPattern -or -not (Test-MeetsMinimum $Branch $version)) {
    throw 'The release feed does not contain a patched version.'
}
$build = $release.'ts-vs17-x64'
if (-not $build) { $build = $release.'ts-vs16-x64' }
$zip = $build.zip
if ($zip.path -notmatch '^php-[\w.\-]+\.zip$' -or $zip.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid release metadata.' }
$stage = Join-Path $phpRoot ('.refresh-' + [guid]::NewGuid())
$backup = Join-Path $phpRoot ('.previous-' + $Branch + '-' + [guid]::NewGuid())
$archive = Join-Path $env:TEMP ('devstackbox-php-' + [guid]::NewGuid() + '.zip')
function Assert-OwnedPath([string]$candidate) {
    if (-not [IO.Path]::GetFullPath($candidate).StartsWith($phpRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe PHP path: $candidate" }
    if ((Test-Path -LiteralPath $candidate) -and (Get-Item -LiteralPath $candidate).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw "Refusing a reparse point: $candidate" }
}
function Assert-Idle {
    $running = Get-CimInstance Win32_Process | Where-Object {
        $_.ExecutablePath -and ($_.ExecutablePath.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase) -or $_.ExecutablePath -eq (Join-Path $root 'apache\bin\httpd.exe'))
    }
    if ($running) { throw 'Stop DevStackBox Apache and PHP processes before refreshing the runtime.' }
}
Assert-OwnedPath $target
Assert-OwnedPath $stage
Assert-OwnedPath $backup
Assert-Idle
try {
    Invoke-WebRequest ('https://windows.php.net/downloads/releases/' + $zip.path) -OutFile $archive -UseBasicParsing
    $archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
    if ($archiveHash -ne $zip.sha256) { throw 'PHP archive checksum mismatch.' }
    Expand-Archive -LiteralPath $archive -DestinationPath $stage
    $phpExe = Join-Path $stage 'php.exe'
    $actual = & $phpExe -n -r 'echo PHP_VERSION;'
    if ($LASTEXITCODE -ne 0 -or -not (Test-RuntimeMatchesRelease $actual $version) -or -not (Test-Path (Join-Path $stage 'php-cgi.exe'))) {
        throw 'PHP runtime validation failed.'
    }
    $exeHash = (Get-FileHash -LiteralPath $phpExe -Algorithm SHA256).Hash.ToLowerInvariant()
    $receipt = @{
        release = $version
        archiveSha256 = $zip.sha256.ToLowerInvariant()
        exeSha256 = $exeHash
    } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText((Join-Path $stage '.devstackbox-release.json'), $receipt)
    $oldIni = Join-Path $target 'php.ini'
    if (Test-Path -LiteralPath $oldIni) { Copy-Item -LiteralPath $oldIni -Destination (Join-Path $stage 'php.ini') }
    else { Copy-Item -LiteralPath (Join-Path $stage 'php.ini-production') -Destination (Join-Path $stage 'php.ini') }
    Assert-Idle
    if (Test-Path -LiteralPath $target) { Move-Item -LiteralPath $target -Destination $backup }
    try { Move-Item -LiteralPath $stage -Destination $target }
    catch {
        if (Test-Path -LiteralPath $backup) { Move-Item -LiteralPath $backup -Destination $target }
        throw
    }
    if (Test-Path -LiteralPath $backup) { Assert-OwnedPath $backup; Remove-Item -LiteralPath $backup -Recurse -Force }
    Write-Host "Verified and installed PHP $version in php/$Branch (PHP_VERSION $actual, archive SHA-256 $($zip.sha256))."
} finally {
    if (Test-Path -LiteralPath $stage) { Assert-OwnedPath $stage; Remove-Item -LiteralPath $stage -Recurse -Force }
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}
