param(
    [ValidateSet('Install','Uninstall','Test')][string]$Action = 'Test',
    [string]$InstallRoot
)
$ErrorActionPreference = 'Stop'
function Normalize-PathEntry([string]$Entry) { $Entry.Trim().Trim('"').TrimEnd('\','/').Replace('/','\') }
function Add-ManagedPath([string]$Value, [string]$Entry) {
    if (@($Value.Split(';') | Where-Object { (Normalize-PathEntry $_) -ieq (Normalize-PathEntry $Entry) }).Count) { return $Value }
    if ([string]::IsNullOrEmpty($Value)) { return $Entry }
    return $Value.TrimEnd(';') + ';' + $Entry
}
function Remove-ManagedPath([string]$Value, [string]$Entry) {
    return (@($Value.Split(';') | Where-Object { (Normalize-PathEntry $_) -ine (Normalize-PathEntry $Entry) }) -join ';')
}
if ($Action -eq 'Test') { return }
if (-not [IO.Path]::IsPathRooted($InstallRoot)) { throw 'An absolute installation directory is required.' }
$entry = [IO.Path]::GetFullPath((Join-Path $InstallRoot 'bin')).TrimEnd('\')
$environmentKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager\Environment', $true)
$ownerKey = [Microsoft.Win32.Registry]::LocalMachine.CreateSubKey('SOFTWARE\DevStackBox\CommandLine')
try {
    $raw = [string]$environmentKey.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $kind = $environmentKey.GetValueKind('Path')
    $updated = $raw
    if ($Action -eq 'Install') {
        if (-not (Test-Path -LiteralPath (Join-Path $entry 'php.exe') -PathType Leaf)) { throw 'PHP launcher is missing.' }
        $updated = Add-ManagedPath $raw $entry
        if ($updated -cne $raw) { $ownerKey.SetValue('AddedPath', $entry) }
    } elseif ([string]$ownerKey.GetValue('AddedPath', '') -ieq $entry) {
        $updated = Remove-ManagedPath $raw $entry
    }
    if ($updated -cne $raw) { $environmentKey.SetValue('Path', $updated, $kind) }
    if ($Action -eq 'Uninstall') { $ownerKey.DeleteValue('AddedPath', $false) }
} finally { $environmentKey.Dispose(); $ownerKey.Dispose() }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DsbEnvironmentBroadcast {
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result);
}
'@
$broadcastResult = [UIntPtr]::Zero
[void][DsbEnvironmentBroadcast]::SendMessageTimeout([IntPtr]0xffff, 0x001a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$broadcastResult)
Write-Output 'DevStackBox PHP PATH registration updated. Open a new terminal; existing terminals and IDEs may need to restart.'
