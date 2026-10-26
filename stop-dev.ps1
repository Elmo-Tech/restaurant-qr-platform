<#
  Stops the local development servers (API port from .env, web :3000, platform console :3001) and their windows.
  The PostgreSQL container keeps running, so the data and the next start stay fast; add -Database to stop it too.

  Usage (from the repository root):   npm run dev:stop        or       .\stop-dev.ps1 [-Database]
#>
param([switch]$Database)

$root = $PSScriptRoot
$envPath = Join-Path $root '.env'
$portText = [Environment]::GetEnvironmentVariable('API_PORT', 'Process')
if (-not $portText -and (Test-Path -LiteralPath $envPath)) {
  foreach ($line in (Get-Content -LiteralPath $envPath)) {
    if ($line -match '^\s*API_PORT\s*=\s*(\d+)\s*(?:#.*)?$') {
      $portText = $Matches[1]
      break
    }
  }
}
if (-not $portText) { $portText = '4000' }
[int]$apiPort = 0
if (-not [int]::TryParse($portText, [ref]$apiPort) -or $apiPort -lt 1 -or $apiPort -gt 65535) {
  throw 'Invalid API_PORT in .env.'
}
foreach ($port in (@($apiPort, 3000, 3001) | Select-Object -Unique)) {
  $owners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $owners) {
    # taskkill /T also ends the child node processes that npm and Next start
    & taskkill /PID $processId /T /F 2>$null | Out-Null
    Write-Host "Stopped port ${port} (process $processId)"
  }
  if (-not $owners) { Write-Host "Port ${port}: not running" }
}

if ($Database) {
  & docker stop restaurant-qr-platform-postgres-1 | Out-Null
  Write-Host 'PostgreSQL: stopped'
}
