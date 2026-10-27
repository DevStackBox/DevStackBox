# Runs only against a newly initialized, disposable data profile.
param([string]$SqlZip)
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path $workspaceRoot ('review-artifacts/database-workspace-' + [Guid]::NewGuid().ToString('N'))
$mysqlBin = Join-Path $workspaceRoot 'mysql/bin'
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$testPort = $listener.LocalEndpoint.Port
$listener.Stop()
$testData = Join-Path $testRoot 'mysql-data'
$testConfig = Join-Path $testRoot 'config'
New-Item -ItemType Directory -Path $testData, $testConfig -Force | Out-Null
Set-Content -LiteralPath (Join-Path $testRoot 'database-workspace-test-profile') -Value 'Disposable database test profile'
$basedir = (Join-Path $workspaceRoot 'mysql').Replace('\','/')
$datadir = $testData.Replace('\','/')
$config = "[mysqld]`nport=$testPort`nbasedir=$basedir`ndatadir=$datadir`nbind-address=127.0.0.1`nmysqlx=0`n[client]`nport=$testPort`ndefault-character-set=utf8mb4`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $testConfig 'my.cnf'), $config, $utf8NoBom)
$initLog = Join-Path $testRoot 'initialize.log'
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& (Join-Path $mysqlBin 'mysqld.exe') '--no-defaults' '--initialize-insecure' "--basedir=$basedir" "--datadir=$datadir" '--console' *> $initLog
$initExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($initExit -ne 0) { throw "MySQL initialization failed ($initExit): $testRoot" }
$process = Start-Process -FilePath (Join-Path $mysqlBin 'mysqld.exe') -ArgumentList @("--defaults-file=`"$(Join-Path $testConfig 'my.cnf')`"") -WindowStyle Hidden -PassThru
$priorProfile = $env:DEVSTACKBOX_DATA_DIR
$priorZip = $env:DEVSTACKBOX_TEST_SQL_ZIP
try {
    $env:DEVSTACKBOX_DATA_DIR = $testRoot
    $ready = $false
    for ($attempt=0; $attempt -lt 60; $attempt++) {
        & (Join-Path $mysqlBin 'mysqladmin.exe') '--no-defaults' '-h' '127.0.0.1' '--protocol=TCP' '-P' "$testPort" '-u' 'root' 'ping' 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (!$ready) { throw "Disposable MySQL did not become ready: $testRoot" }
    $testName = 'native_workspace_round_trip'
    if ($SqlZip) {
        $env:DEVSTACKBOX_TEST_SQL_ZIP = (Resolve-Path -LiteralPath $SqlZip).Path
        $testName = 'native_external_zip_import'
    }
    & cargo test --manifest-path (Join-Path $workspaceRoot 'src-tauri/Cargo.toml') --lib $testName -- --ignored --nocapture --test-threads=1
    $testExit = $LASTEXITCODE
    if ($testExit -ne 0) { throw "Native tests failed. Evidence retained at $testRoot" }
    Write-Output "Native database tests passed. Evidence: $testRoot"
} finally {
    & (Join-Path $mysqlBin 'mysqladmin.exe') '--no-defaults' '-h' '127.0.0.1' '--protocol=TCP' '-P' "$testPort" '-u' 'root' 'shutdown' 2>&1 | Out-Null
    if (!$process.WaitForExit(10000)) { Stop-Process -Id $process.Id }
    $env:DEVSTACKBOX_DATA_DIR = $priorProfile
    $env:DEVSTACKBOX_TEST_SQL_ZIP = $priorZip
}
