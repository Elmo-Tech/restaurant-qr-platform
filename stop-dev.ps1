<#
  Stops the local development servers (API :4100, web :3000, platform console :3001) and their windows.
  The PostgreSQL container keeps running, so the data and the next start stay fast; add -Database to stop it too.

  Usage (from the repository root):   npm run dev:stop        or       .\stop-dev.ps1 [-Database]
#>
param([switch]$Database)

foreach ($port in 4100, 3000, 3001) {
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
