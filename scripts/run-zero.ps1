param(
  [ValidateSet('dev', 'prod')]
  [string]$Mode = 'dev',

  [string]$DemoBotToken = '',
  [string]$MigrationName = 'platform_bootstrap',

  [switch]$SkipInstall,
  [switch]$SkipSeed,
  [switch]$BuildAfterBootstrap,
  [switch]$NoRun,
  [switch]$CreateArchiveAfter
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
  }
}

function Upsert-EnvValue([string]$EnvPath, [string]$Key, [string]$Value) {
  if (-not (Test-Path $EnvPath)) {
    return
  }

  $content = Get-Content -Raw $EnvPath
  $escapedKey = [Regex]::Escape($Key)
  if ($content -match "(?m)^$escapedKey=") {
    $updated = [Regex]::Replace($content, "(?m)^$escapedKey=.*$", "$Key=$Value")
    Set-Content -Path $EnvPath -Value $updated
  } else {
    $suffix = if ($content.EndsWith("`n")) { "" } else { "`r`n" }
    Set-Content -Path $EnvPath -Value ($content + $suffix + "$Key=$Value`r`n")
  }
}

Step 'Zero bootstrap started'

Ensure-Env '.env' '.env.example'
Ensure-Env 'packages/prisma/.env' '.env.example'

if ($DemoBotToken) {
  Step 'Applying DEMO_BOT_TOKEN to env files'
  Upsert-EnvValue '.env' 'DEMO_BOT_TOKEN' $DemoBotToken
  Upsert-EnvValue 'packages/prisma/.env' 'DEMO_BOT_TOKEN' $DemoBotToken
  Ok 'DEMO_BOT_TOKEN saved to .env and packages/prisma/.env'
}

$bootstrapArgs = @()
$bootstrapArgs += "-Mode $Mode"
$bootstrapArgs += "-MigrationName $MigrationName"
if ($SkipInstall) { $bootstrapArgs += '-SkipInstall' }
if ($SkipSeed) { $bootstrapArgs += '-SkipSeed' }
if ($NoRun) { $bootstrapArgs += '-NoRun' }

Step 'Running bootstrap script'
Run "powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 $($bootstrapArgs -join ' ')"

if ($BuildAfterBootstrap) {
  Step 'Building all apps'
  Run 'pnpm.cmd build'
}

if ($CreateArchiveAfter) {
  Step 'Creating project archive'
  Run 'powershell -ExecutionPolicy Bypass -File scripts/package-project.ps1'
}

Ok 'Zero bootstrap completed successfully'
