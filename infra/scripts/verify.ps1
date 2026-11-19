$ErrorActionPreference = 'Stop'
function Compose {
  & docker compose @args
  if ($LASTEXITCODE -ne 0) { throw "docker compose failed: $args" }
}
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  # Compose's resolved configuration includes values from .env as well.
  $config = (Compose config --format json | Out-String | ConvertFrom-Json)
  $frontendPort = $config.services.frontend.ports[0].published
  $backendPort = $config.services.backend.ports[0].published
  if ((Invoke-WebRequest "http://localhost:$frontendPort" -UseBasicParsing).StatusCode -ne 200) { throw 'Frontend failed' }
  foreach ($uri in @("http://localhost:$backendPort/api/health", "http://localhost:$frontendPort/api/health")) {
    $result = Invoke-RestMethod $uri
    if ($result.status -ne 'ok' -or $result.database -ne 'up') { throw "Health check failed: $uri" }
  }
  Compose exec -T mongodb mongosh --quiet --eval 'if (rs.status().set !== process.env.MONGO_REPLICA_SET || !db.hello().isWritablePrimary) quit(1)'
  if (-not $config.volumes.mongo_data.external -or $config.volumes.mongo_data.name -ne 'phd-quest_mongo_data') { throw 'Expected the existing external MongoDB volume' }
  & docker volume inspect phd-quest_mongo_data --format '{{.Name}}'
  if ($LASTEXITCODE -ne 0) { throw 'Persistent MongoDB volume is unavailable' }
  $mongoPort = [int]$config.services.mongodb.ports[0].published
  $client = New-Object System.Net.Sockets.TcpClient
  try { $client.Connect('127.0.0.1', $mongoPort) } finally { $client.Dispose() }
  foreach ($uri in @("http://localhost:$backendPort/api/health", "http://localhost:$frontendPort/api/health")) {
    $result = Invoke-RestMethod $uri
    if ($result.status -ne 'ok' -or $result.database -ne 'up') { throw "Health check failed: $uri" }
  }
  Write-Host 'PASS (read-only): frontend, API, proxy, MongoDB, replica set, localhost TCP and external volume configuration. No records or services were changed.'
} finally { Pop-Location }
