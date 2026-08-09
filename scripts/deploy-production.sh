#!/bin/bash
# Deploy dist/ to VPS and restart app so OAuth auto-refresh code is loaded.
set -euo pipefail

ROOT="/Library/WebServer/Documents/TIKTOK"
PEM="${DEPLOY_PEM:-/Library/WebServer/Documents/NEXTA/deploy_backend/nexta.pem}"
SSH_HOST="${DEPLOY_HOST:-gitlab@124.158.6.144}"
SSH_PORT="${DEPLOY_PORT:-2345}"
REMOTE_APP="${REMOTE_APP:-/var/www/autopublisher}"

cd "$ROOT"
npm run build

RSYNC_SSH="ssh -i $PEM -p $SSH_PORT -o BatchMode=yes"
rsync -avz -e "$RSYNC_SSH" dist/*.js "$SSH_HOST:$REMOTE_APP/dist/"

ssh -i "$PEM" -p "$SSH_PORT" -o BatchMode=yes "$SSH_HOST" \
  "sudo systemctl restart autopublisher && sleep 2 && systemctl is-active autopublisher"

bash "$ROOT/scripts/ensure-tiktok-oauth.sh"
echo "✅ Deploy + restart + OAuth verify done"
