# One-command, read-only metal ERP prospect pilot.
# Never sends email, changes the CRM, or requires MongoDB, Redis or Gmail.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host ''
Write-Host 'HERMES - METAL ERP RESEARCH (NO EMAIL SENDING)' -ForegroundColor Cyan
Write-Host ''
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js 22+ is required.' -ForegroundColor Red
  exit 1
}
$version = (& node --version).Trim()
if ($version -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) {
  Write-Host "Node.js 22+ is required (found $version)" -ForegroundColor Red
  exit 1
}

function LoadPilotSetting([string]$name) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if ($value -and $value -notmatch '^(your-|placeholder|replace)') { return $value.Trim() }
  $dotEnv = Join-Path $PSScriptRoot '.env'
  if (Test-Path $dotEnv) {
    foreach ($line in [System.IO.File]::ReadAllLines($dotEnv)) {
      if ($line -match ('^\s*' + [Regex]::Escape($name) + '\s*=\s*(.+?)\s*$')) {
        $candidate = $Matches[1].Trim().Trim('"').Trim("'")
        if ($candidate -and $candidate -notmatch '^(your-|placeholder|replace)') { return $candidate }
      }
    }
  }
  return ''
}

$brave = LoadPilotSetting 'BRAVE_API_KEY'
$searxng = LoadPilotSetting 'SEARXNG_URL'
$serp = LoadPilotSetting 'SERPAPI_KEY'
if (-not $brave -and -not $searxng) {
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    try {
      & (Join-Path $PSScriptRoot 'scripts\start-pilot-search.ps1')
      if ($LASTEXITCODE -eq 0) { $searxng = 'http://127.0.0.1:8888' }
    } catch {
      Write-Host ('Local SearXNG unavailable: ' + $_.Exception.Message) -ForegroundColor Yellow
    }
  }
}

if (-not $brave -and -not $searxng) {
  Write-Host 'No working search provider found yet.' -ForegroundColor Yellow
  Write-Host 'Use Docker Desktop for keyless local SearXNG, or provide a Brave Search API key.'
  Write-Host 'Brave Search API signup: https://api-dashboard.search.brave.com/'
  Write-Host 'Existing SerpAPI key can also be used if the account is authorised.'
  $secret = Read-Host -Prompt 'Optional BRAVE API key (hidden; press Enter to skip)' -AsSecureString
  if ($secret.Length -gt 0) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { $brave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  }
}
if (-not $brave -and -not $searxng -and -not $serp) {
  Write-Host 'No provider configured. No search or mail was sent.' -ForegroundColor Red
  exit 2
}
if ($brave) { $env:BRAVE_API_KEY = $brave }
if ($searxng) { $env:SEARXNG_URL = $searxng }
if ($serp) { $env:SERPAPI_KEY = $serp }
try {
  & node (Join-Path $PSScriptRoot 'scripts\metal-pilot.mjs')
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    Write-Host 'Pilot did not return valid results. No emails were sent.' -ForegroundColor Red
    exit $exitCode
  }
  $files = Get-ChildItem (Join-Path $PSScriptRoot 'pilot-results') -Filter '*-SUMMARY.txt' | Sort-Object LastWriteTime -Descending
  if ($files -and $files.Count -gt 0) {
    Write-Host 'Pilot finished. Opening research summary.' -ForegroundColor Green
    Start-Process -FilePath $files[0].FullName
  }
} finally {
  Remove-Item Env:\BRAVE_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:\SEARXNG_URL -ErrorAction SilentlyContinue
  Remove-Item Env:\SERPAPI_KEY -ErrorAction SilentlyContinue
}
