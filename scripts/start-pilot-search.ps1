# Local, no-API-key search for Hermes lead pilot.
# Requires Docker Desktop installed and running. Only binds to 127.0.0.1.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker Desktop is not installed. Install it from https://www.docker.com/products/docker-desktop/ or choose Brave Search API."
}
& docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop is not running. Open Docker Desktop and try again."
}
$localDir = Join-Path $root '.pilot-searxng'
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
$settingsPath = Join-Path $localDir 'settings.yml'
if (-not (Test-Path $settingsPath)) {
  $buf = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
  $secret = [BitConverter]::ToString($buf).Replace('-','').ToLowerInvariant()
  $settings = @"
use_default_settings: true
server:
  secret_key: "$secret"
  limiter: false
search:
  formats:
    - html
    - json
"@
  [System.IO.File]::WriteAllText($settingsPath, $settings, (New-Object System.Text.UTF8Encoding($false)))
}
$composePath = Join-Path $root 'pilot-searxng\compose.yml'
Write-Host 'Starting local SearXNG search engine (no SerpAPI account required)...' -ForegroundColor Cyan
& docker compose -f $composePath up -d
if ($LASTEXITCODE -ne 0) { throw 'Could not start SearXNG Docker container.' }
$url = 'http://127.0.0.1:8888/search?q=metal+fabrication&format=json'
for ($attempt=0; $attempt -lt 30; $attempt++) {
  try {
    $response = Invoke-RestMethod -Uri $url -TimeoutSec 10 -Method Get
    if ($null -ne $response.results) {
      Write-Host 'Local SearXNG JSON search is ready.' -ForegroundColor Green
      return
    }
  } catch { }
  Start-Sleep -Seconds 2
}
throw "Local SearXNG did not return JSON results. Check docker logs hermes-pilot-searxng. Some upstream engines may block requests."
