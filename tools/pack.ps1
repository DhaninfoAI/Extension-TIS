# Build the Chrome Web Store upload: SmartFill-<version>.zip with manifest.json at the root.
#   powershell -ExecutionPolicy Bypass -File tools\pack.ps1                  (zip goes to the Desktop)
#   powershell -ExecutionPolicy Bypass -File tools\pack.ps1 -OutDir C:\out
# Leaves out what users don't need (docs, notes, this tools folder) and the localhost:4010 permission, which is only
# for testing against a backend on this PC. The source folder itself is not changed.
param([string]$OutDir = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$src = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $src 'manifest.json') | ConvertFrom-Json
$version = $manifest.version
$manifest.host_permissions = @($manifest.host_permissions | Where-Object { $_ -notmatch '^http://localhost' })
$manifestJson = $manifest | ConvertTo-Json -Depth 20

$include = @('background', 'common', 'content', 'fonts', 'icons', 'sidepanel', 'viewer')
$zipPath = Join-Path $OutDir "SmartFill-$version.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  # manifest.json at the root, without the localhost permission
  $entry = $zip.CreateEntry('manifest.json', [System.IO.Compression.CompressionLevel]::Optimal)
  $w = New-Object System.IO.StreamWriter($entry.Open(), (New-Object System.Text.UTF8Encoding($false)))
  $w.Write($manifestJson); $w.Close()
  $count = 1
  foreach ($dir in $include) {
    Get-ChildItem -Path (Join-Path $src $dir) -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($src.Length + 1) -replace '\\', '/'   # forward slashes: the Web Store needs them
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
      $count++
    }
  }
} finally { $zip.Dispose() }

$kb = [math]::Round((Get-Item $zipPath).Length / 1KB)
Write-Output "Built $zipPath (version $version, $count files, $kb KB)"
