param(
    [string]$InstallRoot = 'C:\devstackbox',
    [ValidateSet('Stopped', 'Running')][string]$State = 'Running',
    [int]$HttpPort = 80,
    [int]$MysqlPort = 3306,
    [string]$ReportPath
)
$ErrorActionPreference = 'Stop'
$checks = [Collections.Generic.List[object]]::new()
function Check([string]$Name, [scriptblock]$Test) {
    try { $detail = & $Test; $checks.Add([pscustomobject]@{ name = $Name; passed = $true; detail = "$detail" }) }
    catch { $checks.Add([pscustomobject]@{ name = $Name; passed = $false; detail = $_.Exception.Message }) }
}
function Require([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
$profileRoot = Join-Path $env:LOCALAPPDATA 'devstackbox'
$php = Join-Path $InstallRoot 'php\8.3\php.exe'
$apache = Join-Path $InstallRoot 'apache\bin\httpd.exe'
$mysql = Join-Path $InstallRoot 'mysql\bin\mysql.exe'
Check 'Complete installed payload' {
    foreach ($relative in @('devstackbox.exe', 'uninstall.exe', 'apache\bin\httpd.exe', 'mysql\bin\mysqld.exe', 'mysql\bin\mysql.exe', 'php\8.3\php.exe', 'phpmyadmin\index.php')) {
        Require (Test-Path -LiteralPath (Join-Path $InstallRoot $relative)) "Missing $relative"
    }
    (Get-FileHash -LiteralPath (Join-Path $InstallRoot 'devstackbox.exe') -Algorithm SHA256).Hash
}
Check 'Bundled PHP CLI and managed configuration' {
    $previousPhpRc = $env:PHPRC
    try {
        $env:PHPRC = Join-Path $profileRoot 'config'
        $result = & $php -r 'echo PHP_VERSION, "|", PHP_BINARY, "|", php_ini_loaded_file();' 2>&1
        Require ($LASTEXITCODE -eq 0) "PHP failed: $result"
        Require ("$result".Contains($InstallRoot)) "PHP resolved outside the installation: $result"
        Require ("$result".Contains($profileRoot)) "PHP did not load managed configuration: $result"
        $result
    } finally { $env:PHPRC = $previousPhpRc }
}
Check 'Apache configuration syntax' {
    $result = & $apache -f (Join-Path $profileRoot 'config\httpd.conf') -t 2>&1
    Require ($LASTEXITCODE -eq 0) "Apache config failed: $result"
    "$result"
}
foreach ($imageName in @('httpd.exe', 'mysqld.exe')) {
    Check "$imageName ownership and $State state" {
        $owned = @(Get-CimInstance Win32_Process -Filter "Name='$imageName'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($InstallRoot + '\', [StringComparison]::OrdinalIgnoreCase) })
        Require (($State -eq 'Running' -and $owned.Count -gt 0) -or ($State -eq 'Stopped' -and $owned.Count -eq 0)) "Unexpected process count: $($owned.Count)"
        ($owned | ForEach-Object { "$($_.ProcessId):$($_.ExecutablePath)" }) -join ', '
    }
}
if ($State -eq 'Running') {
    Check 'HTTP serves the bundled welcome page' {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$HttpPort/" -TimeoutSec 15
        Require ($response.StatusCode -eq 200) "HTTP status $($response.StatusCode)"
        Require ($response.Content -match 'DevStackBox') 'Unexpected welcome page'
        "HTTP $($response.StatusCode)"
    }
    Check 'Apache executes PHP for phpMyAdmin' {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$HttpPort/phpmyadmin/" -TimeoutSec 20
        Require ($response.StatusCode -eq 200) "HTTP status $($response.StatusCode)"
        Require ($response.Content -match '<title>[^<]*phpMyAdmin') 'phpMyAdmin was not rendered'
        Require ($response.Content -notmatch '<\?php') 'Raw PHP source returned'
        "HTTP $($response.StatusCode), rendered phpMyAdmin"
    }
    Check 'Fresh MySQL uses this installation and managed data directory' {
        # Fresh-profile fixture only. No credential is read or exposed by this check.
        $result = & $mysql --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$MysqlPort" --user=root --batch --skip-column-names -e 'SELECT VERSION(), @@basedir, @@datadir;' 2>&1
        Require ($LASTEXITCODE -eq 0) "MySQL query failed: $result"
        # MySQL may render Windows path separators escaped in batch output.
        # Canonicalize both slash styles before checking installation ownership.
        $normalized = ("$result".Replace('/', '\') -replace '\\{2,}', '\')
        Require ($normalized.Contains($InstallRoot)) 'MySQL basedir belongs to another installation'
        Require ($normalized.Contains($profileRoot)) 'MySQL datadir belongs to another installation'
        $result
    }
}
$report = [pscustomobject]@{ timestamp = (Get-Date).ToString('o'); installRoot = $InstallRoot; expectedState = $State; checks = $checks; passed = @($checks | Where-Object { -not $_.passed }).Count -eq 0 }
$json = $report | ConvertTo-Json -Depth 5
if ($ReportPath) { $json | Set-Content -LiteralPath $ReportPath -Encoding utf8 }
$json
if (-not $report.passed) { exit 1 }
