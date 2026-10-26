param(
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][string]$Manifest
)
$ErrorActionPreference = 'Stop'
try {
  $root = [IO.Path]::GetFullPath((Join-Path $InstallRoot 'phpmyadmin')).TrimEnd('\', '/')
  if (-not (Test-Path -LiteralPath $root -PathType Container)) { exit 0 }
  $report = Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
  if ($report.schemaVersion -ne 1) { throw 'Unsupported phpMyAdmin cleanup manifest.' }
  foreach ($entry in $report.excluded) {
    # Never touch runtime directories, configs, custom files, or unknown versions.
    $relative = [string]$entry.path
    if ($relative -notmatch '^(themes/(bootstrap|metro|original)/|setup/|examples/|\.rtlcssrc\.json$|babel\.config\.json$|yarn\.lock$|package\.json$|CONTRIBUTING\.md$)') { continue }
    if ($relative -match '(^|/)\.\.(/|$)|:|\\' -or $entry.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid cleanup entry.' }
    $target = [IO.Path]::GetFullPath((Join-Path $root $relative))
    if (-not $target.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup path escaped phpMyAdmin.' }
    # Reject junctions/symlinks at every ancestor, including the installation root.
    $cursor = $target
    $linked = $false
    while ($cursor) {
      if (Test-Path -LiteralPath $cursor) {
        if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { $linked = $true; break }
      }
      $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    if ($linked -or -not (Test-Path -LiteralPath $target -PathType Leaf)) { continue }
    $stream = [IO.File]::OpenRead($target)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { $digest = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $algorithm.Dispose() }
    if ($digest -ne $entry.sha256) { continue }
    Remove-Item -LiteralPath $target -Force
    $parent = [IO.Path]::GetDirectoryName($target)
    while ($parent.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      if (@(Get-ChildItem -LiteralPath $parent -Force).Count -ne 0) { break }
      Remove-Item -LiteralPath $parent
      $parent = [IO.Path]::GetDirectoryName($parent)
    }
  }
  exit 0
} catch {
  Write-Error $_ -ErrorAction Continue
  exit 1
}
