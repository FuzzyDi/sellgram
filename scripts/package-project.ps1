param(
  [string]$OutputDir = 'artifacts',
  [string]$ArchiveName = ''
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

function Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

if (-not $ArchiveName) {
  $ArchiveName = "sellgram-full-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip'
}

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$archivePath = Join-Path $OutputDir $ArchiveName
if (Test-Path $archivePath) {
  Remove-Item $archivePath -Force
}

$excludeTopLevel = @(
  '.git',
  '.turbo',
  '.next',
  'dist',
  'build',
  'coverage',
  'artifacts',
  'tmp',
  'temp',
  'node_modules'
)

Step 'Collecting files for archive'
$rootPath = (Resolve-Path .).Path
$files = Get-ChildItem -Recurse -File | Where-Object {
  $rel = $_.FullName.Substring($rootPath.Length + 1)
  $firstPart = ($rel -split '[\\/]', 2)[0]
  if ($excludeTopLevel -contains $firstPart) { return $false }
  if ($rel -match '(^|[\\/])node_modules([\\/]|$)') { return $false }
  if ($rel -match '(^|[\\/])dist([\\/]|$)') { return $false }
  if ($rel -match '(^|[\\/])build([\\/]|$)') { return $false }
  if ($rel -match '\.zip$') { return $false }
  return $true
}

$relativePaths = $files | ForEach-Object {
  $_.FullName.Substring($rootPath.Length + 1)
}

Step "Compressing $($relativePaths.Count) files"
Compress-Archive -Path $relativePaths -DestinationPath $archivePath -CompressionLevel Optimal

Write-Host ''
Write-Host "[OK] Archive created: $archivePath" -ForegroundColor Green
