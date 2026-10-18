$ErrorActionPreference = 'Stop'
$repoDir = Split-Path $PSScriptRoot -Parent
$appExe = Join-Path $repoDir 'src-tauri/target/release/devstackbox.exe'
$testProfile = Join-Path $repoDir ('review-artifacts/upgrade-guard-' + [guid]::NewGuid().ToString('N'))
$testConfig = Join-Path $testProfile 'config'
New-Item -ItemType Directory -Path $testConfig -Force | Out-Null
$siteFile = Join-Path $testConfig 'vhosts.json'
$sslFile = Join-Path $testConfig 'ssl.conf'
Set-Content -LiteralPath $siteFile -Value '[]' -Encoding ascii
Set-Content -LiteralPath $sslFile -Value "ServerName localhost`nServerName orphan.test`nDocumentRoot C:/example" -Encoding ascii
$beforeSites = (Get-FileHash -LiteralPath $siteFile).Hash
$beforeSsl = (Get-FileHash -LiteralPath $sslFile).Hash

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $appExe
$startInfo.ArgumentList.Add('--setup-local-https')
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.Environment['DEVSTACKBOX_DATA_DIR'] = $testProfile
$testProcess = [System.Diagnostics.Process]::Start($startInfo)
if (!$testProcess.WaitForExit(15000)) {
    $testProcess.Kill()
    throw 'Guard verification timed out'
}
if ($testProcess.ExitCode -ne 1) { throw "Expected refused setup, got exit code $($testProcess.ExitCode)" }
$message = Get-Content -LiteralPath (Join-Path $testConfig 'https-setup-error.txt') -Raw
if ($message -notlike '*orphan.test*no active saved project record*') { throw "Unexpected guard result: $message" }
if ((Get-FileHash -LiteralPath $siteFile).Hash -ne $beforeSites -or (Get-FileHash -LiteralPath $sslFile).Hash -ne $beforeSsl) { throw 'Guard changed existing site configuration' }
if ((Test-Path -LiteralPath (Join-Path $testConfig 'https-enabled')) -or (Test-Path -LiteralPath (Join-Path $testConfig 'https/ca'))) { throw 'Guard proceeded with certificate setup' }
Write-Output 'PASS: compiled app refused orphan-site overwrite; saved/generated configuration unchanged; no CA created.'
