<#
  Starts the whole local development stack in the right order, and only what is not already running:
    1. Docker Desktop (and waits for its engine)
    2. the PostgreSQL container
    3. pending database migrations, then the API            -> http://localhost:<API_PORT>  (read from .env)
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
$envPath = Join-Path $root '.env'
if (-not (Test-Path -LiteralPath $envPath)) {
  throw 'Missing .env in the repository root. Copy .env.example and configure your local environment.'
}
$settings = @{}
foreach ($line in (Get-Content -LiteralPath $envPath)) {
  if ($line -match '^\s*(API_PORT|NEXT_PUBLIC_API_URL|API_INTERNAL_URL)\s*=\s*(.*?)\s*$') {
    $settings[$Matches[1]] = ($Matches[2].Trim() -replace '\s+#.*$', '').Trim('"').Trim("'")
  }
}
function Get-LocalSetting([string]$Name) {
  $v = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if ($v) { return $v }
  return $settings[$Name]
}
$rawPort = Get-LocalSetting 'API_PORT'
if (-not $rawPort) { $rawPort = '4000' }
[int]$apiPort = 0
if (-not [int]::TryParse($rawPort, [ref]$apiPort) -or $apiPort -lt 1 -or $apiPort -gt 65535) {
  throw 'API_PORT must be a valid TCP port.'
}
$publicApiUrl = Get-LocalSetting 'NEXT_PUBLIC_API_URL'
if (-not $publicApiUrl) { throw 'Missing NEXT_PUBLIC_API_URL in .env.' }
try { $publicApiUri = [uri]$publicApiUrl } catch { throw 'NEXT_PUBLIC_API_URL is not a valid URL.' }
$loopbackNames = @('localhost','127.0.0.1','::1','[::1]')
if ($publicApiUri.Host -in $loopbackNames -and $publicApiUri.Port -ne $apiPort) {
  throw "API port mismatch: API_PORT=$apiPort, NEXT_PUBLIC_API_URL=$publicApiUrl. Set both to the same port."
}
$privateApiUrl = Get-LocalSetting 'API_INTERNAL_URL'
if ($privateApiUrl) {
  try { $privateApiUri = [uri]$privateApiUrl } catch { throw 'API_INTERNAL_URL is not a valid URL.' }
  if ($privateApiUri.Host -in $loopbackNames -and $privateApiUri.Port -ne $apiPort) {
    throw "API_INTERNAL_URL uses port $($privateApiUri.Port), but API_PORT is $apiPort."
  }
  Write-Warning 'API_INTERNAL_URL overrides the public URL in Next.js server-side auth. Normally leave it unset in native Windows development.'
}
Write-Host "Local API port: $apiPort; configured browser API: $publicApiUrl"

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
try {
  & npx prisma migrate deploy | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw 'Database migration failed. Cannot start the API against a possibly outdated schema. Check Prisma/PostgreSQL logs.'
  }
} finally { Pop-Location }

# 3. API
function Test-ApiReady {
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$apiPort/ready" -TimeoutSec 3 -ErrorAction Stop
    return ($response.status -eq 'ready')
  } catch { return $false }
}
if ($Rebuild -or -not (Test-Path (Join-Path $root 'apps\api\dist\main.js'))) {
  Write-Host 'Building the API...'
  Push-Location $root
  try {
    & npm run build:api
    if ($LASTEXITCODE -ne 0) {
      throw 'API build failed. Refusing to start a stale dist/main.js. Fix the build errors first.'
    }
  } finally { Pop-Location }
}
if (-not (Test-Port $apiPort)) {
  Write-Host "Starting the API on port $apiPort..."
  Start-InWindow "API :$apiPort" (Join-Path $root 'apps\api') 'node dist\main'
  Wait-Until { Test-Port $apiPort } 90 "API TCP port $apiPort"
}
if (-not (Test-ApiReady)) {
  throw "The API port is listening, but /ready is failing (http://127.0.0.1:$apiPort/ready). Check PostgreSQL/API logs. Run npm run dev:doctor."
}
Write-Host "API and PostgreSQL: ready (http://localhost:$apiPort)"

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
