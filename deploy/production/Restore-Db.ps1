param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$EnvFile = ".env.prod"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeFile = Join-Path $scriptDir "docker-compose.prod.yml"
$envPath = Join-Path $scriptDir $EnvFile
$backupPath = if ([System.IO.Path]::IsPathRooted($BackupFile)) { $BackupFile } else { Join-Path $scriptDir $BackupFile }

if (-not (Test-Path $envPath)) {
  throw "Env file not found: $envPath"
}

if (-not (Test-Path $backupPath)) {
  throw "Backup file not found: $backupPath"
}

$cmd = @(
  "compose", "-f", $composeFile, "--env-file", $envPath,
  "exec", "-T", "postgres", "sh", "-lc", 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
)

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "docker"
$psi.Arguments = ($cmd -join " ")
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardError = $true

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $psi
$process.Start() | Out-Null

$fileStream = [System.IO.File]::OpenRead($backupPath)
$gzipStream = New-Object System.IO.Compression.GzipStream($fileStream, [System.IO.Compression.CompressionMode]::Decompress)
$gzipStream.CopyTo($process.StandardInput.BaseStream)
$process.StandardInput.Close()
$gzipStream.Dispose()
$fileStream.Dispose()

$stderr = $process.StandardError.ReadToEnd()
$process.WaitForExit()

if ($process.ExitCode -ne 0) {
  throw "Restore failed: $stderr"
}

Write-Host "Restore completed from: $backupPath"
