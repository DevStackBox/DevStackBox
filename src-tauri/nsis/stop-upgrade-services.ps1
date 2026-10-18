param([Parameter(Mandatory = $true)][string]$InstallDir)
$ErrorActionPreference = 'Stop'

try {
    $installRoot = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
    if ($installRoot -eq [IO.Path]::GetPathRoot($installRoot).TrimEnd('\')) { throw 'Refusing a drive root as the installation directory.' }
    $prefix = $installRoot + '\'
    function Get-OwnedProcesses {
        $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
        foreach ($item in $processes) {
            if (!$item.ExecutablePath) {
                if ($item.Name -in @('devstackbox.exe', 'httpd.exe', 'mysqld.exe', 'php.exe', 'php-cgi.exe')) {
                    # A process can exit while CIM enumerates it. Only a live,
                    # still-uninspectable process is an ownership error.
                    $live = Get-CimInstance Win32_Process -Filter "ProcessId=$($item.ProcessId)" -ErrorAction Stop
                    if (!$live) { continue }
                    if (!$live.ExecutablePath) { throw "Cannot verify the executable path of $($item.Name) (PID $($item.ProcessId)). Run setup as administrator." }
                    $item = $live
                } else {
                    continue
                }
            }
            if ($item.ExecutablePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -and
                $item.Name -in @('devstackbox.exe', 'httpd.exe', 'mysqld.exe', 'php.exe', 'php-cgi.exe')) { $item }
        }
    }

    $owned = @(Get-OwnedProcesses)
    if ($owned.Count) {
        Write-Output 'Stopping DevStackBox services before replacing files...'
        $appPath = Join-Path $installRoot 'devstackbox.exe'
        if (Test-Path -LiteralPath $appPath) {
            # The installed executable resolves its own installation and user configuration.
            $stopper = Start-Process -FilePath $appPath -ArgumentList '--stop-services' -WindowStyle Hidden -PassThru
            if (!$stopper.WaitForExit(30000)) { $stopper.Kill(); $stopper.WaitForExit() }
        }
        $owned = @(Get-OwnedProcesses)
        $ownedIds = @($owned | ForEach-Object { [uint32]$_.ProcessId })
        foreach ($service in @(Get-CimInstance Win32_Service -ErrorAction Stop)) {
            if ($service.ProcessId -ne 0 -and $service.ProcessId -in $ownedIds) {
                Stop-Service -Name $service.Name -Force -ErrorAction Stop
                (Get-Service -Name $service.Name).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(20))
            }
        }
        # Verify ownership again before each stop, including processes spawned during shutdown.
        for ($attempt = 0; $attempt -lt 10; $attempt++) {
            $owned = @(Get-OwnedProcesses)
            if (!$owned.Count) { break }
            foreach ($item in $owned) {
                $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($item.ProcessId)" -ErrorAction Stop
                if ($current -and $current.ExecutablePath -eq $item.ExecutablePath -and $current.CreationDate -eq $item.CreationDate) {
                    Write-Output "Stopping $($item.Name) (PID $($item.ProcessId))"
                    Stop-Process -Id $item.ProcessId -Force -ErrorAction Stop
                }
            }
            Start-Sleep -Milliseconds 500
        }
    }
    if (@(Get-OwnedProcesses).Count) { throw 'DevStackBox processes are still running. No application files have been replaced.' }

    # A process outside this installation can still hold one of its DLLs open.
    # Check only shipped program locations, never project/database contents.
    $files = @()
    if (Test-Path -LiteralPath $installRoot) {
        $files += @(Get-ChildItem -LiteralPath $installRoot -File | Where-Object { $_.Extension -in @('.exe', '.dll') -and $_.Name -notlike '*setup*' })
        foreach ($folder in @('apache', 'mysql', 'php', 'phpmyadmin', 'tools')) {
            $path = Join-Path $installRoot $folder
            if (Test-Path -LiteralPath $path) { $files += @(Get-ChildItem -LiteralPath $path -Recurse -File | Where-Object { $_.Extension -in @('.exe', '.dll') }) }
        }
    }
    foreach ($file in $files) {
        try {
            $stream = [IO.File]::Open($file.FullName, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
            $stream.Dispose()
        } catch { throw "Cannot replace $($file.FullName). Close the program using it and retry. $($_.Exception.Message)" }
    }
    Write-Output 'Verified: DevStackBox services stopped and program files are replaceable.'
    exit 0
} catch {
    Write-Output "Upgrade stopped before file replacement: $($_.Exception.Message)"
    exit 1
}
