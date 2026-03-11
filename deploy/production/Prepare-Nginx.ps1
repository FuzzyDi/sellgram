param(
  [string]$EnvFile = ".env.prod"
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

if (-not (Test-Path $EnvFile)) {
  throw "Env file not found: $EnvFile"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envMap = Get-EnvMap -Path $EnvFile
$sslMode = if ($envMap.ContainsKey("SSL_MODE")) { $envMap["SSL_MODE"] } else { "http" }
$sslCommonName = if ($envMap.ContainsKey("SSL_COMMON_NAME")) { $envMap["SSL_COMMON_NAME"] } else { "sellgram.uz" }
$httpTemplate = Join-Path $scriptDir "nginx.http.conf"
$httpsTemplate = Join-Path $scriptDir "nginx.https.conf"
$target = Join-Path $scriptDir "nginx.prod.conf"
$sslDir = Join-Path $scriptDir "ssl"
$fullchain = Join-Path $sslDir "fullchain.pem"
$privkey = Join-Path $sslDir "privkey.pem"

New-Item -ItemType Directory -Force -Path $sslDir | Out-Null

switch ($sslMode) {
  "http" {
    Copy-Item $httpTemplate $target -Force
  }
  "self-signed" {
    if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
      throw "OpenSSL is required for SSL_MODE=self-signed on Windows Server."
    }
    if (-not (Test-Path $fullchain) -or -not (Test-Path $privkey)) {
      & openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout $privkey -out $fullchain -subj "/CN=$sslCommonName" | Out-Null
    }
    Copy-Item $httpsTemplate $target -Force
  }
  "letsencrypt" {
    if (-not (Test-Path $fullchain) -or -not (Test-Path $privkey)) {
      throw "Missing SSL files: $fullchain and $privkey"
    }
    Copy-Item $httpsTemplate $target -Force
  }
  "https" {
    if (-not (Test-Path $fullchain) -or -not (Test-Path $privkey)) {
      throw "Missing SSL files: $fullchain and $privkey"
    }
    Copy-Item $httpsTemplate $target -Force
  }
  default {
    throw "Unsupported SSL_MODE: $sslMode"
  }
}

Write-Host "Prepared nginx config: $target ($sslMode)"
