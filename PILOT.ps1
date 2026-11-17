# Windows one-command, read-only metal ERP prospect pilot.
# Runs independently of MongoDB, Redis, Gmail, SMTP and the full Hermes app.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host ''
Write-Host 'HERMES - METAL ERP LEAD RESEARCH PILOT' -ForegroundColor Cyan
Write-Host 'Read-only: this script never sends emails, imports contacts, or changes the database.'
Write-Host ''

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js is not installed. Install Node.js 22 LTS, then retry.' -ForegroundColor Red
  exit 1
}

$nodeVersion = (& node --version).Trim()
if ($nodeVersion -notmatch '^v(\d+)\.') {
  Write-Host 'Could not detect Node.js version.' -ForegroundColor Red
  exit 1
}
if ([int]$Matches[1] -lt 22) {
  Write-Host "Node.js 22 or newer is needed (found $nodeVersion)." -ForegroundColor Red
  exit 1
}

$serpKey = $env:SERPAPI_KEY
$localEnvPath = Join-Path $PSScriptRoot '.env'
if ([string]::IsNullOrWhiteSpace($serpKey) -and (Test-Path $localEnvPath)) {
  foreach ($line in [System.IO.File]::ReadAllLines($localEnvPath)) {
    if ($line -match '^\s*SERPAPI_KEY\s*=\s*(.+?)\s*$') {
      $serpKey = $Matches[1].Trim().Trim('"').Trim("'")
      break
    }
  }
}

if ([string]::IsNullOrWhiteSpace($serpKey) -or $serpKey -match '^(your-|placeholder|replace|sk-\.\.\.)') {
  Write-Host 'A SerpAPI key is needed for live Google search. Paste it below (characters are hidden).' -ForegroundColor Yellow
  $secureKey = Read-Host -Prompt 'SerpAPI API key' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  try {
    $serpKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

if ([string]::IsNullOrWhiteSpace($serpKey)) {
  Write-Host 'No key entered; no searches were performed.' -ForegroundColor Yellow
  exit 2
}
$env:SERPAPI_KEY = $serpKey
try {
  & node (Join-Path $PSScriptRoot 'scripts\metal-pilot.mjs')
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Research search failed; check the error above. No mail was sent.' -ForegroundColor Red
    exit $LASTEXITCODE
  }
  $resultDir = Join-Path $PSScriptRoot 'pilot-results'
  $latest = Get-ChildItem -Path $resultDir -Filter '*-SUMMARY.txt' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($latest) {
    Write-Host ''
    Write-Host 'Pilot finished. Opening your research report.' -ForegroundColor Green
    Start-Process -FilePath $latest.FullName
  }
} finally {
  Remove-Item Env:\SERPAPI_KEY -ErrorAction SilentlyContinue
}
