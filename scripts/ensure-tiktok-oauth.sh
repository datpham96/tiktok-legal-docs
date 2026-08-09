#!/bin/bash
# Refresh + verify TikTok OAuth on production (always runs fresh Node — no stale server cache).
set -euo pipefail

PEM="${DEPLOY_PEM:-/Library/WebServer/Documents/NEXTA/deploy_backend/nexta.pem}"
SSH_HOST="${DEPLOY_HOST:-gitlab@124.158.6.144}"
SSH_PORT="${DEPLOY_PORT:-2345}"
REMOTE_APP="${REMOTE_APP:-/var/www/autopublisher}"
BASE_URL="${BASE_URL:-https://autopublisher.click}"

if [ ! -f "$PEM" ]; then
  echo "❌ Deploy PEM not found: $PEM"
  exit 1
fi

RESULT="$(ssh -i "$PEM" -p "$SSH_PORT" -o BatchMode=yes -o ConnectTimeout=15 "$SSH_HOST" \
  "cd $REMOTE_APP && node -e \"
    const { getValidTokens } = require('./dist/tiktok-auth');
    const log = console.log; console.log = () => {};
    getValidTokens()
      .then((t) => {
        if (!t) { process.stdout.write('FAIL:no_token'); process.exit(1); }
        const exp = Math.floor((t.created_at + t.expires_in * 1000 - Date.now()) / 1000);
        process.stdout.write('OK:' + exp);
      })
      .catch((e) => {
        process.stdout.write('FAIL:' + (e.message || 'refresh_error'));
        process.exit(1);
      });
  \"" 2>&1)" || true

STATUS_LINE="$(printf '%s\n' "$RESULT" | grep -E '^(OK|FAIL):' | tail -1)"

if [[ "$STATUS_LINE" == OK:* ]]; then
  echo "✅ TikTok OAuth OK on production (access token ~${STATUS_LINE#OK:}s remaining)"
  exit 0
fi

echo "❌ TikTok OAuth failed on production: ${STATUS_LINE#FAIL:}${STATUS_LINE:+ —}${STATUS_LINE:- $RESULT}"
echo "   Reconnect: $BASE_URL/auth/tiktok"
exit 1
