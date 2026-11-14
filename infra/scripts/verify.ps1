$ErrorActionPreference = 'Stop'
function Compose {
  & docker compose @args
  if ($LASTEXITCODE -ne 0) { throw "docker compose failed: $args" }
}
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  Compose up -d --build --wait --wait-timeout 300
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
  $marker = [guid]::NewGuid().ToString()
  Compose exec -T mongodb mongosh --quiet --eval "db.getSiblingDB('_foundation_validation').markers.insertOne({_id:'$marker'})"
  Compose restart
  Compose up -d --wait --wait-timeout 300
  Compose exec -T mongodb mongosh --quiet --eval "if (!db.getSiblingDB('_foundation_validation').markers.findOne({_id:'$marker'})) quit(1)"
  Compose exec -T mongodb mongosh --quiet --eval "db.getSiblingDB('_foundation_validation').markers.deleteOne({_id:'$marker'})"
  $mongoPort = [int]$config.services.mongodb.ports[0].published
  $client = New-Object System.Net.Sockets.TcpClient
  try { $client.Connect('127.0.0.1', $mongoPort) } finally { $client.Dispose() }
  foreach ($uri in @("http://localhost:$backendPort/api/health", "http://localhost:$frontendPort/api/health")) {
    $result = Invoke-RestMethod $uri
    if ($result.status -ne 'ok' -or $result.database -ne 'up') { throw "Health check failed after restart: $uri" }
  }
  Write-Host 'PASS: frontend, API, proxy, MongoDB, replica set, localhost TCP and persistence across ordinary restart.'
} finally { Pop-Location }
