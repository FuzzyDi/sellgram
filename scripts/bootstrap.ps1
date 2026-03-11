param(
  [ValidateSet('dev', 'prod')]
  [string]$Mode = 'dev',

  [switch]$SkipInstall,
  [switch]$SkipSeed,
  [switch]$NoRun,

  [string]$MigrationName = 'platform_bootstrap'
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

function Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Ok([string]$Message) {
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Warn([string]$Message) {
  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Run([string]$Command) {
  Write-Host "   $Command" -ForegroundColor DarkGray
  Invoke-Expression $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

function Ensure-Env([string]$TargetEnv, [string]$SourceEnv) {
  if (-not (Test-Path $TargetEnv)) {
    if (-not (Test-Path $SourceEnv)) {
      throw "Missing $TargetEnv and template $SourceEnv"
    }
    Copy-Item $SourceEnv $TargetEnv
    Ok "Created $TargetEnv from $SourceEnv"
  } else {
    Ok "$TargetEnv exists"
  }
}

function Wait-Service([string]$ServiceName, [int]$TimeoutSec = 90, [string]$ComposeFile = '', [string]$EnvFile = '') {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if ($ComposeFile) {
      if ($EnvFile) {
        $containerId = docker compose -f $ComposeFile --env-file $EnvFile ps -q $ServiceName 2>$null
      } else {
        $containerId = docker compose -f $ComposeFile ps -q $ServiceName 2>$null
      }
    } else {
      $containerId = docker compose ps -q $ServiceName 2>$null
    }

    if (-not $containerId) {
      Start-Sleep -Seconds 2
      continue
    }

    $running = docker inspect -f "{{.State.Running}}" $containerId 2>$null
    if ($running -eq 'true') {
      Ok "Service is running: $ServiceName"
      return
    }
    Start-Sleep -Seconds 2
  }
  throw "Service did not start in time: $ServiceName"
}

Assert-Command docker
Assert-Command pnpm.cmd

if ($Mode -eq 'dev') {
  Step 'Development bootstrap started'

  Ensure-Env '.env' '.env.example'

  Step 'Starting local infrastructure (docker compose up -d)'
  Run 'docker compose up -d'

  # Best-effort waits for expected local containers
  Wait-Service 'postgres'
  Wait-Service 'redis'
  Wait-Service 'minio'

  if (-not $SkipInstall) {
    Step 'Installing dependencies (pnpm install)'
    Run 'pnpm.cmd install'
  } else {
    Warn 'Skipping dependency install (--SkipInstall)'
  }

  Step 'Generating Prisma client'
  Run 'pnpm.cmd db:generate'

  Step "Applying DB migrations (pnpm db:migrate --name $MigrationName)"
  Run "pnpm.cmd db:migrate --name $MigrationName"

  if (-not $SkipSeed) {
    Step 'Seeding database (demo + system admin)'
    Run 'pnpm.cmd db:seed'
  } else {
    Warn 'Skipping seed (--SkipSeed)'
  }

  if (-not $NoRun) {
    Step 'Starting all apps in development mode (pnpm dev)'
    Run 'pnpm.cmd dev'
  } else {
    Ok 'Bootstrap finished (apps not started due to --NoRun)'
  }

  return
}

if ($Mode -eq 'prod') {
  Step 'Production bootstrap started'

  $prodDir = Join-Path $root 'deploy/production'
  if (-not (Test-Path $prodDir)) {
    throw "Missing production directory: $prodDir"
  }

  Set-Location $prodDir

  if (-not (Test-Path '.env')) {
    Warn 'Missing deploy/production/.env. You can generate it by running deploy.sh on the server.'
    throw 'Create deploy/production/.env first, then rerun with -Mode prod.'
  }

  Step 'Building and starting production stack'
  Run 'docker compose -f docker-compose.prod.yml --env-file .env up -d --build'

  Wait-Service 'postgres' -ComposeFile 'docker-compose.prod.yml' -EnvFile '.env'
  Wait-Service 'redis' -ComposeFile 'docker-compose.prod.yml' -EnvFile '.env'
  Wait-Service 'minio' -ComposeFile 'docker-compose.prod.yml' -EnvFile '.env'
  Wait-Service 'api' -ComposeFile 'docker-compose.prod.yml' -EnvFile '.env'
  Wait-Service 'admin' -ComposeFile 'docker-compose.prod.yml' -EnvFile '.env'
  Wait-Service 'miniapp' -ComposeFile 'docker-compose.prod.yml' -EnvFile '.env'
  Wait-Service 'nginx' -ComposeFile 'docker-compose.prod.yml' -EnvFile '.env'

  Step 'Running Prisma migrate deploy inside API container'
  Run 'docker compose -f docker-compose.prod.yml --env-file .env exec -T api npx prisma migrate deploy'

  if (-not $SkipSeed) {
    Step 'Running seed inside API container'
    Run 'docker compose -f docker-compose.prod.yml --env-file .env exec -T api sh -c "cd /app/packages/prisma && npx tsx seed.ts"'
  } else {
    Warn 'Skipping seed (--SkipSeed)'
  }

  if ($NoRun) {
    Ok 'Production bootstrap finished. Services are up in background.'
  } else {
    Ok 'Production bootstrap finished. Streaming API logs (Ctrl+C to stop).'
    Run 'docker compose -f docker-compose.prod.yml --env-file .env logs -f api'
  }
}
