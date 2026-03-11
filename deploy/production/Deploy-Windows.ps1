param(
  [string]$EnvFile = ".env.prod",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Get-EnvMap {
  param([string]$Path)
  $map = @{}
  foreach ($line in Get-Content $Path) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $idx = $line.IndexOf('=')
    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    $map[$key] = $value
  }
  return $map
}

function Set-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )
  $content = Get-Content $Path -Raw
  $pattern = "(?m)^$Key=.*$"
  if ([regex]::IsMatch($content, $pattern)) {
    $content = [regex]::Replace($content, $pattern, "$Key=$Value")
  } else {
    $content = $content.TrimEnd() + "`r`n$Key=$Value`r`n"
  }
  Set-Content -Path $Path -Value $content -Encoding UTF8
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $scriptDir $EnvFile
$prepareScript = Join-Path $scriptDir "Prepare-Nginx.ps1"
$secretScript = Join-Path $scriptDir "Generate-Secrets.ps1"
$startScript = Join-Path $scriptDir "Start-Production.ps1"

if (-not (Test-Path $envPath)) {
  throw "Env file not found: $envPath"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker CLI not found. Install Docker Desktop / Docker Engine with compose support first."
}

$serverIp = try {
  (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 10).ToString()
} catch {
  ""
}

if ($serverIp) {
  Set-EnvValue -Path $envPath -Key "SERVER_IP" -Value $serverIp
}

& $secretScript -EnvFile $envPath
& $prepareScript -EnvFile $envPath

if ($SkipBuild) {
  & $startScript -EnvFile $envPath
} else {
  & $startScript -EnvFile $envPath -Build
}

$envMap = Get-EnvMap -Path $envPath
$httpPort = if ($envMap.ContainsKey("NGINX_HTTP_PORT")) { $envMap["NGINX_HTTP_PORT"] } else { "8080" }
$healthUrl = "http://localhost:$httpPort/health"

Write-Host ""
Write-Host "Health: $healthUrl"
Write-Host "Runbook: deploy/production/PRELAUNCH_RUNBOOK.md"
