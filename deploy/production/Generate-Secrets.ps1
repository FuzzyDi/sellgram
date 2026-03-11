param(
  [string]$EnvFile = ".env.prod"
)

$ErrorActionPreference = "Stop"

function New-HexSecret {
  param([int]$Bytes)
  $buffer = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  return ($buffer | ForEach-Object { $_.ToString("x2") }) -join ""
}

if (-not (Test-Path $EnvFile)) {
  throw "Env file not found: $EnvFile"
}

$content = Get-Content $EnvFile -Raw

$replacements = @{
  "DB_PASSWORD" = (New-HexSecret -Bytes 16)
  "REDIS_PASSWORD" = (New-HexSecret -Bytes 16)
  "JWT_SECRET" = (New-HexSecret -Bytes 32)
  "JWT_REFRESH_SECRET" = (New-HexSecret -Bytes 32)
  "SYSTEM_JWT_SECRET" = (New-HexSecret -Bytes 32)
  "SYSTEM_ADMIN_PASSWORD" = (New-HexSecret -Bytes 16)
  "S3_SECRET_KEY" = (New-HexSecret -Bytes 16)
  "ENCRYPTION_KEY" = (New-HexSecret -Bytes 32)
}

foreach ($pair in $replacements.GetEnumerator()) {
  $key = $pair.Key
  $value = $pair.Value
  $pattern = "(?m)^$key=(.*)$"
  $match = [regex]::Match($content, $pattern)
  if ($match.Success) {
    $current = $match.Groups[1].Value
    if ([string]::IsNullOrWhiteSpace($current) -or $current.StartsWith("CHANGE_ME") -or $current.StartsWith("YOUR_")) {
      $content = [regex]::Replace($content, $pattern, "$key=$value")
    }
  }
}

Set-Content -Path $EnvFile -Value $content -Encoding UTF8
Write-Host "Updated secrets in $EnvFile"
