#!/usr/bin/env bash
# HERMES VPS Initial Setup Script
# Target: Ubuntu 24.04 (Hostinger VPS)
# Run as root: bash scripts/setup-vps.sh

set -euo pipefail

echo "========================================"
echo "  HERMES AI — VPS Initial Setup"
echo "========================================"

# System update
apt-get update -y && apt-get upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install build essentials
apt-get install -y build-essential git curl wget unzip

# Install PM2 globally
npm install -g pm2

# Install Nginx
apt-get install -y nginx
systemctl enable nginx

# Install PostgreSQL 16
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql

# Install Redis 7
apt-get install -y redis-server
systemctl enable redis-server

# Configure Redis max memory
sed -i 's/^# maxmemory <bytes>/maxmemory 256mb/' /etc/redis/redis.conf
sed -i 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
systemctl restart redis-server

# Create PostgreSQL database and user
sudo -u postgres psql <<EOF
CREATE USER hermes WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE hermes_db OWNER hermes;
GRANT ALL PRIVILEGES ON DATABASE hermes_db TO hermes;
EOF

# Install certbot for SSL
apt-get install -y certbot python3-certbot-nginx

# Setup UFW firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# PM2 startup on boot
pm2 startup systemd -u root --hp /root
systemctl enable pm2-root

echo ""
echo "✅ VPS setup complete!"
echo ""
echo "Next steps:"
echo "1. Clone HERMES repo to /var/www/hermes"
echo "2. Copy .env.example to .env and fill values"
echo "3. Update DATABASE_URL with: postgresql://hermes:CHANGE_ME_STRONG_PASSWORD@localhost:5432/hermes_db"
echo "4. Update nginx.conf with your domain name"
echo "5. Run: certbot --nginx -d yourdomain.com"
echo "6. Run: bash scripts/deploy.sh"
