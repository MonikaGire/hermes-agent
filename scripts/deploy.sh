#!/usr/bin/env bash
# HERMES VPS Deployment Script
# Target: Ubuntu 24.04 on Hostinger VPS
# Run as: bash scripts/deploy.sh

set -euo pipefail

echo "========================================"
echo "  HERMES AI — VPS Deployment Script"
echo "========================================"

# ── Prerequisite check ─────────────────────
command -v node >/dev/null 2>&1 || { echo "Node.js not found. Install Node 20+."; exit 1; }
command -v npm >/dev/null 2>&1  || { echo "npm not found."; exit 1; }
command -v pm2 >/dev/null 2>&1  || { echo "PM2 not found. Run: npm i -g pm2"; exit 1; }

# ── Load environment ────────────────────────
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example and fill in values."
  exit 1
fi
set -a; source .env; set +a

echo "[1/6] Installing dependencies..."
NODE_ENV=development npm ci --frozen-lockfile --ignore-scripts

echo "[2/6] Generating Prisma client..."
npm run db:generate

echo "[3/6] Building packages..."
npm run build --workspace=packages/shared
npm run build --workspace=packages/database
npm run build --workspace=packages/agents

echo "[4/6] Building backend..."
npm run build:backend

echo "[5/6] Building frontend..."
npm run build:frontend

echo "[6/6] (Re)starting PM2 processes..."
pm2 startOrReload pm2.config.js --env production
pm2 save

echo ""
VPS_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_VPS_IP")
echo "✅ HERMES deployed successfully!"
echo "   Public URL:  http://${VPS_IP}"
echo "   Frontend:    http://localhost:6000  (internal)"
echo "   Backend:     http://localhost:7000  (internal)"
echo ""
echo "Run 'pm2 logs' to watch logs."
echo "Run 'pm2 status' to check process health."
