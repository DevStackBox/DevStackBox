$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$compiler = Join-Path $env:LOCALAPPDATA 'tauri/NSIS/makensis.exe'
$root = Join-Path $repo ('review-artifacts/nsis-stop-' + [guid]::NewGuid().ToString('N'))
$fixture = Join-Path $root 'installed app'
New-Item -ItemType Directory -Path $fixture | Out-Null
$hooks = Get-Content (Join-Path $repo 'src-tauri/nsis/hooks.nsh') -Raw
$function = [regex]::Match($hooks, '(?s)Function DsbStopServicesBeforeUpgrade\r?\n.*?FunctionEnd').Value
if (!$function) { throw 'Cannot locate actual installer stop function' }
$template = @'
!include "LogicLib.nsh"
!define DSB_UPGRADE_STOP_SCRIPT "@HELPER@"
Name "Upgrade guard test"
OutFile "@OUTPUT@"
RequestExecutionLevel user
SilentInstall silent
InstallDir "@FIXTURE@"
@FUNCTION@
Section
  Call DsbStopServicesBeforeUpgrade
  FileOpen $0 "$INSTDIR\payload-copied.txt" w
  FileWrite $0 "Guard passed"
  FileClose $0
SectionEnd
'@
$template = $template.Replace('@HELPER@', (Join-Path $repo 'src-tauri/nsis/stop-upgrade-services.ps1')).Replace('@OUTPUT@', (Join-Path $root 'guard.exe')).Replace('@FIXTURE@', $fixture).Replace('@FUNCTION@', $function)
$source = Join-Path $root 'guard.nsi'
Set-Content -LiteralPath $source -Value $template -Encoding utf8
& $compiler /V2 $source
if ($LASTEXITCODE -ne 0) { throw 'NSIS harness compilation failed' }
$lockedPath = Join-Path $fixture 'locked.dll'
[IO.File]::WriteAllText($lockedPath, 'original')
$lock = [IO.File]::Open($lockedPath, 'Open', 'ReadWrite', 'None')
try {
    $process = Start-Process -FilePath (Join-Path $root 'guard.exe') -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -eq 0 -or (Test-Path (Join-Path $fixture 'payload-copied.txt'))) { throw 'NSIS did not abort before copying payload' }
} finally { $lock.Dispose() }
$process = Start-Process -FilePath (Join-Path $root 'guard.exe') -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0 -or !(Test-Path (Join-Path $fixture 'payload-copied.txt'))) { throw 'NSIS retry failed after releasing file lock' }
Write-Output 'PASS: actual compiled NSIS stop function aborts before payload writes on a locked DLL; retry succeeds after unlock.'

$preserveMacro = [regex]::Match($hooks, '(?s)!macro ProtectWwwBeforeInstall\r?\n.*?!macroend').Value
$preserveExe = Join-Path $root 'preserve.exe'
$preserveTemplate = $template.Replace((Join-Path $root 'guard.exe'), $preserveExe).Replace('Call DsbStopServicesBeforeUpgrade', '!insertmacro ProtectWwwBeforeInstall')
$preserveTemplate = $preserveTemplate.Insert($preserveTemplate.IndexOf("Section`n"), $preserveMacro + "`n")
$preserveSource = Join-Path $root 'preserve.nsi'
Set-Content -LiteralPath $preserveSource -Value $preserveTemplate -Encoding utf8
& $compiler /V2 $preserveSource
if ($LASTEXITCODE -ne 0) { throw 'Website preservation harness compilation failed' }
$marker = Join-Path $fixture 'payload-copied.txt'
Remove-Item -LiteralPath $marker
$website = Join-Path $fixture 'www'
$backup = Join-Path $fixture '_www_preserve'
New-Item -ItemType Directory -Path $website,$backup | Out-Null
$websiteFile = Join-Path $website 'index.php'
$backupFile = Join-Path $backup 'previous.php'
Set-Content -LiteralPath $websiteFile -Value 'website'
Set-Content -LiteralPath $backupFile -Value 'previous backup'
$process = Start-Process -FilePath $preserveExe -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -eq 0 -or (Test-Path $marker) -or !(Test-Path $websiteFile) -or !(Test-Path $backupFile)) { throw 'Existing backup was not protected' }
Remove-Item -LiteralPath $backupFile
Remove-Item -LiteralPath $backup
$lock = [IO.File]::Open($websiteFile, 'Open', 'ReadWrite', 'None')
try {
    $process = Start-Process -FilePath $preserveExe -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -eq 0 -or (Test-Path $marker) -or !(Test-Path $websiteFile)) { throw 'Failed website rename did not abort before payload' }
} finally { $lock.Dispose() }
$process = Start-Process -FilePath $preserveExe -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0 -or !(Test-Path (Join-Path $backup 'index.php'))) { throw 'Website backup retry failed' }
Write-Output 'PASS: existing website backups survive retry; locked website folder blocks payload; unlocked backup succeeds.'
