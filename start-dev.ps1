<#
  Starts the whole local development stack in the right order, and only what is not already running:
    1. Docker Desktop (and waits for its engine)
    2. the PostgreSQL container
    3. pending database migrations, then the API            -> http://localhost:4100  (built output, port from .env)
    4. the restaurant web -> http://localhost:3000
    5. the platform console -> http://localhost:3001
  Each server opens in its own PowerShell window, so you can see its log and close it when you are done.

  Usage (from the repository root):   npm run dev:all        or       .\start-dev.ps1
  Add -Rebuild to rebuild the API first (needed after changing API code).
#>
param([switch]$Rebuild)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$postgresContainer = 'restaurant-qr-platform-postgres-1'

function Test-Port([int]$Port) {
  [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-Until([scriptblock]$Condition, [int]$Seconds, [string]$What) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (& $Condition) { return }
    Start-Sleep -Seconds 2
  }
  throw "Timed out waiting for $What."
}

function Test-DockerEngine {
  try { $null = & docker info 2>$null; return ($LASTEXITCODE -eq 0) } catch { return $false }
}

function Start-InWindow([string]$Title, [string]$WorkDir, [string]$Command) {
  $script = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location -LiteralPath '$WorkDir'; $Command"
  Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', $script | Out-Null
}

# 1. Docker Desktop
if (-not (Test-DockerEngine)) {
  $docker = @(
    "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $docker) { throw 'Docker Desktop was not found. Start it by hand, then run this again.' }
  Write-Host 'Starting Docker Desktop...'
  Start-Process $docker
  Wait-Until { Test-DockerEngine } 240 'the Docker engine'
}
Write-Host 'Docker: ready'

# 2. PostgreSQL
if (-not (Test-Port 5432)) {
  Write-Host 'Starting the PostgreSQL container...'
  & docker start $postgresContainer | Out-Null
  Wait-Until { Test-Port 5432 } 90 'PostgreSQL on port 5432'
}
# The port opens before the database accepts connections; the API exits if it starts too early.
Wait-Until { & docker exec $postgresContainer pg_isready 2>$null | Out-Null; $LASTEXITCODE -eq 0 } 120 'PostgreSQL to accept connections'
Write-Host 'PostgreSQL: ready (port 5432)'

# Pending database migrations (a no-op when there are none)
Push-Location (Join-Path $root 'apps\api')
try { & npx prisma migrate deploy | Out-Host } finally { Pop-Location }

# 3. API
if ($Rebuild -or -not (Test-Path (Join-Path $root 'apps\api\dist\main.js'))) {
  Write-Host 'Building the API...'
  Push-Location $root
  try { & npm run build:api } finally { Pop-Location }
}
if (-not (Test-Port 4100)) {
  Write-Host 'Starting the API...'
  Start-InWindow 'API :4100' (Join-Path $root 'apps\api') 'node dist\main'
  Wait-Until { Test-Port 4100 } 90 'the API on port 4100'
}
Write-Host 'API: ready (http://localhost:4100)'

# 4. Restaurant web and 5. platform console
if (-not (Test-Port 3000)) {
  Write-Host 'Starting the restaurant web...'
  Start-InWindow 'Web :3000' $root 'npm run dev:web'
}
if (-not (Test-Port 3001)) {
  Write-Host 'Starting the platform console...'
  Start-InWindow 'Platform :3001' $root 'npm run dev:platform'
}
Wait-Until { (Test-Port 3000) -and (Test-Port 3001) } 120 'the web servers'

Write-Host ''
Write-Host 'Everything is running:'
Write-Host '  Restaurant dashboard  http://localhost:3000/login'
Write-Host '  Platform console      http://localhost:3001/login'
