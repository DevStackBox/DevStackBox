$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../src-tauri/nsis/manage-php-path.ps1') -Action Test
$original = '%SystemRoot%\system32;C:\xampp\php;D:\Other Tools'
$updated = Add-ManagedPath $original 'C:\devstackbox\bin'
if ($updated -cne ($original + ';C:\devstackbox\bin')) { throw 'Existing PATH entries changed.' }
if ((Add-ManagedPath $updated 'c:/devstackbox/bin/') -cne $updated) { throw 'Duplicate PATH entry.' }
if ((Remove-ManagedPath $updated 'C:\DEVSTACKBOX\bin') -cne $original) { throw 'Uninstall changed another tool PATH.' }
if ((Add-ManagedPath '"C:\devstackbox\bin";D:\Other Tools' 'C:\devstackbox\bin') -cne '"C:\devstackbox\bin";D:\Other Tools') { throw 'Quoted PATH entry duplicated.' }
if ((Add-ManagedPath '' 'C:\devstackbox\bin') -cne 'C:\devstackbox\bin') { throw 'Empty PATH not supported.' }
Write-Output 'PASS: append, deduplication, quoted entries, raw environment variables and targeted removal. No registry changes.'
