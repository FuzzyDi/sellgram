param(
  [string]$EnvFile = ".env.prod",
  [string]$BackupDir = ".\\backups"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeFile = Join-Path $scriptDir "docker-compose.prod.yml"
$envPath = Join-Path $scriptDir $EnvFile
$backupPath = if ([System.IO.Path]::IsPathRooted($BackupDir)) { $BackupDir } else { Join-Path $scriptDir $BackupDir }
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outputFile = Join-Path $backupPath "postgres_$timestamp.sql.gz"

if (-not (Test-Path $envPath)) {
  throw "Env file not found: $envPath"
}

New-Item -ItemType Directory -Force -Path $backupPath | Out-Null

$cmd = @(
  "compose", "-f", $composeFile, "--env-file", $envPath,
  "exec", "-T", "postgres", "sh", "-lc", 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"'
)

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "docker"
$psi.Arguments = ($cmd -join " ")
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $psi
$process.Start() | Out-Null

$fileStream = [System.IO.File]::Create($outputFile)
$gzipStream = New-Object System.IO.Compression.GzipStream($fileStream, [System.IO.Compression.CompressionLevel]::Optimal)
$process.StandardOutput.BaseStream.CopyTo($gzipStream)
$gzipStream.Dispose()
$fileStream.Dispose()
$stderr = $process.StandardError.ReadToEnd()
$process.WaitForExit()

if ($process.ExitCode -ne 0) {
  if (Test-Path $outputFile) { Remove-Item $outputFile -Force }
  throw "Backup failed: $stderr"
}

Write-Host "Backup created: $outputFile"
