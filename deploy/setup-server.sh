#!/usr/bin/env bash
# Deploy AutoPublisher on a Linux VPS (Ubuntu/Debian)
# Usage on server:
#   cd /var/www/autopublisher
#   bash deploy/setup-server.sh

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "==> Installing Node deps"
npm install --omit=dev

echo "==> Building TypeScript"
npm run build

echo "==> Ensuring demo video exists"
if [ ! -f storage/videos/test.mp4 ]; then
  echo "WARNING: storage/videos/test.mp4 missing. Run: npm run generate-video"
fi

if command -v pm2 >/dev/null 2>&1; then
  echo "==> Starting with PM2"
  pm2 start deploy/ecosystem.config.js
  pm2 save
else
  echo "PM2 not found. Install with: npm i -g pm2"
  echo "Then run: pm2 start deploy/ecosystem.config.js && pm2 save"
fi

echo "Done. Configure nginx + SSL next (see DEPLOY.md)."
