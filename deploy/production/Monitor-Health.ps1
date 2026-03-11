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

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $scriptDir $EnvFile
$stateDir = Join-Path $scriptDir ".monitor"
$stateFile = Join-Path $stateDir "health.state"

if (-not (Test-Path $envPath)) {
  throw "Env file not found: $envPath"
}

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$envMap = Get-EnvMap -Path $envPath

$healthUrl = if ($envMap.ContainsKey("MONITOR_HEALTH_URL") -and $envMap["MONITOR_HEALTH_URL"]) {
  $envMap["MONITOR_HEALTH_URL"]
} else {
  $port = if ($envMap.ContainsKey("NGINX_HTTP_PORT")) { $envMap["NGINX_HTTP_PORT"] } else { "8080" }
  "http://localhost:$port/health"
}

$timeoutSec = if ($envMap.ContainsKey("MONITOR_TIMEOUT_SEC") -and $envMap["MONITOR_TIMEOUT_SEC"]) {
  [int]$envMap["MONITOR_TIMEOUT_SEC"]
} else {
  10
}

$status = "down"
$body = ""

try {
  $response = Invoke-WebRequest -Uri $healthUrl -TimeoutSec $timeoutSec -UseBasicParsing
  $body = $response.Content
  if ($body -match '"status"\s*:\s*"ok"') {
    $status = "up"
  }
} catch {
  $status = "down"
}

$prevStatus = ""
if (Test-Path $stateFile) {
  $prevStatus = Get-Content $stateFile -Raw
}

Set-Content -Path $stateFile -Value $status -Encoding ascii
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

function Send-TelegramAlert {
  param([string]$Message)
  $botToken = $envMap["MONITOR_TELEGRAM_BOT_TOKEN"]
  $chatId = $envMap["MONITOR_TELEGRAM_CHAT_ID"]
  if ([string]::IsNullOrWhiteSpace($botToken) -or [string]::IsNullOrWhiteSpace($chatId)) {
    return
  }
  Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$botToken/sendMessage" -Body @{
    chat_id = $chatId
    text = $Message
  } | Out-Null
}

if ($status -eq "down") {
  Write-Host "[$timestamp] healthcheck failed for $healthUrl"
  if ($prevStatus -ne "down") {
    Send-TelegramAlert "SellGram healthcheck is DOWN: $healthUrl ($timestamp)"
  }
  exit 1
}

Write-Host "[$timestamp] healthcheck ok for $healthUrl"
if ($prevStatus -eq "down") {
  Send-TelegramAlert "SellGram healthcheck recovered: $healthUrl ($timestamp)"
}
