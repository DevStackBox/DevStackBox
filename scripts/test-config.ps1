# Uses disposable files and a loopback-only server; never deletes user configs.
$ErrorActionPreference = 'Stop'
node (Join-Path $PSScriptRoot 'test-apache-overrides.mjs') --legacy
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node (Join-Path $PSScriptRoot 'test-apache-overrides.mjs')
exit $LASTEXITCODE
