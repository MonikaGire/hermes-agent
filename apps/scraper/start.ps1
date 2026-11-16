# Start Hermes Scraper Service on port 5001
Set-Location $PSScriptRoot
uvicorn main:app --host 0.0.0.0 --port 5001 --reload
