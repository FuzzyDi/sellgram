param(
  [string]$EnvFile = ".env.prod",
  [switch]$Build
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeFile = Join-Path $scriptDir "docker-compose.prod.yml"

Push-Location $scriptDir
try {
  if ($Build) {
    & docker compose -f $composeFile --env-file $EnvFile build
    if ($LASTEXITCODE -ne 0) { throw "docker compose build failed" }
  }

  & docker compose -f $composeFile --env-file $EnvFile up -d
  if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }

  & docker compose -f $composeFile --env-file $EnvFile ps
  if ($LASTEXITCODE -ne 0) { throw "docker compose ps failed" }
}
finally {
  Pop-Location
}
