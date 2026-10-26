param(
  [string]$Version = "5.2.2",
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$Sha256,
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference = "Stop"
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Use an exact stable release version." }
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$pmaDir = Join-Path $RepoRoot 'phpmyadmin'
if ((Get-Item -LiteralPath $pmaDir -ErrorAction SilentlyContinue).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing linked phpMyAdmin source directory.' }
$zipName = "phpMyAdmin-$Version-all-languages.zip"
$temp = Join-Path ([IO.Path]::GetTempPath()) ("devstackbox-pma-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
$zipPath = Join-Path $temp $zipName
$extractedName = "phpMyAdmin-$Version-all-languages"
$extracted = Join-Path $temp $extractedName
$backupDir = Join-Path $RepoRoot ("phpmyadmin-backup-" + [guid]::NewGuid().ToString('N'))
try {
  Invoke-WebRequest -Uri "https://files.phpmyadmin.net/phpMyAdmin/$Version/$zipName" -OutFile $zipPath -UseBasicParsing
  if ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash -ne $Sha256) { throw 'Archive checksum does not match the supplied trusted SHA-256.' }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    foreach ($entry in $archive.Entries) {
      $name = $entry.FullName.Replace('\', '/')
      if (-not $name.StartsWith("$extractedName/", [StringComparison]::Ordinal) -or $name -match '(^|/)\.\.(/|$)|:|^/' -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw "Unsafe archive entry: $name" }
    }
  } finally { $archive.Dispose() }
  Expand-Archive -LiteralPath $zipPath -DestinationPath $temp
  foreach ($relative in @('index.php','vendor/autoload.php','themes/pmahomme/theme.json','LICENSE',"RELEASE-DATE-$Version")) {
    if (-not (Test-Path -LiteralPath (Join-Path $extracted $relative) -PathType Leaf)) { throw "Missing release file: $relative" }
  }
  Copy-Item -LiteralPath (Join-Path $RepoRoot 'config/phpmyadmin.config.inc.php') -Destination (Join-Path $extracted 'config.inc.php')
  if (Test-Path -LiteralPath $pmaDir) { Move-Item -LiteralPath $pmaDir -Destination $backupDir }
  try {
    Move-Item -LiteralPath $extracted -Destination $pmaDir
    & node (Join-Path $PSScriptRoot 'stage-phpmyadmin.mjs') --repo-root $RepoRoot
    if ($LASTEXITCODE -ne 0) { throw 'Staged payload validation failed.' }
  } catch {
    # Retain failed inputs for diagnosis instead of deleting either tree.
    if (Test-Path -LiteralPath $pmaDir) { Move-Item -LiteralPath $pmaDir -Destination (Join-Path $temp 'rejected-source') }
    if (Test-Path -LiteralPath $backupDir) { Move-Item -LiteralPath $backupDir -Destination $pmaDir }
    throw
  }
  Write-Host "phpMyAdmin source refreshed and staged. Previous source retained at $backupDir"
} finally {
  Write-Host "Refresh evidence retained at $temp"
}
