# Hermes Scraper Service — one-time setup
Set-Location $PSScriptRoot

Write-Host "Step 1: Installing Python packages..." -ForegroundColor Cyan
pip install flask playwright httpx

Write-Host ""
Write-Host "Step 2: Installing Playwright Chromium browser..." -ForegroundColor Cyan
playwright install chromium

Write-Host ""
Write-Host "Step 3: (Optional) Installing Crawl4AI for better JS extraction..." -ForegroundColor Cyan
pip install crawl4ai 2>$null
python -c "import crawl4ai; print('Crawl4AI OK')" 2>$null

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "Start the service: python main.py" -ForegroundColor Yellow
