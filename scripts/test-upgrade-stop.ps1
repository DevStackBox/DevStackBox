$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$testRoot = Join-Path $repo ('review-artifacts/upgrade-stop-' + [guid]::NewGuid().ToString('N'))
$installRoot = Join-Path $testRoot 'app with spaces'
$otherRoot = $installRoot + '-other'
$helper = Join-Path $repo 'src-tauri/nsis/stop-upgrade-services.ps1'
$shell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
New-Item -ItemType Directory -Path $installRoot,$otherRoot | Out-Null
foreach ($folder in @($installRoot, $otherRoot)) { Copy-Item -LiteralPath (Join-Path $env:SystemRoot 'System32/ping.exe') -Destination (Join-Path $folder 'httpd.exe') }
$owned = Start-Process -FilePath (Join-Path $installRoot 'httpd.exe') -ArgumentList '-t','127.0.0.1' -WindowStyle Hidden -PassThru
$unrelated = Start-Process -FilePath (Join-Path $otherRoot 'httpd.exe') -ArgumentList '-t','127.0.0.1' -WindowStyle Hidden -PassThru
$locked = $null
try {
    Start-Sleep -Milliseconds 500
    & $shell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -InstallDir $installRoot
    if ($LASTEXITCODE -ne 0) { throw 'Owned process shutdown failed' }
    $owned.Refresh(); $unrelated.Refresh()
    if (!$owned.HasExited -or $unrelated.HasExited) { throw 'Process ownership isolation failed' }
    Write-Output 'PASS: stopped owned running process; sibling-prefix installation remained running.'
    $lockedFile = Join-Path $installRoot 'locked.dll'
    [IO.File]::WriteAllText($lockedFile, 'preserve me')
    $locked = [IO.File]::Open($lockedFile, 'Open', 'ReadWrite', 'None')
    & $shell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -InstallDir $installRoot
    if ($LASTEXITCODE -eq 0) { throw 'Locked file was accepted' }
    $locked.Dispose(); $locked = $null
    if ([IO.File]::ReadAllText($lockedFile) -ne 'preserve me') { throw 'Locked file was modified' }
    Write-Output 'PASS: locked DLL blocks upgrade without modifying it.'
    & $shell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -InstallDir $installRoot
    if ($LASTEXITCODE -ne 0) { throw 'Retry after releasing lock failed' }
    & $shell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -InstallDir (Join-Path $testRoot 'fresh install')
    if ($LASTEXITCODE -ne 0) { throw 'Fresh installation was blocked' }
    Write-Output 'PASS: retry and fresh installation succeed.'
} finally {
    if ($locked) { $locked.Dispose() }
    foreach ($process in @($owned, $unrelated)) { $process.Refresh(); if (!$process.HasExited) { $process.Kill(); $process.WaitForExit() }; $process.Dispose() }
}
