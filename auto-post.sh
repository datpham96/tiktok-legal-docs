#!/bin/bash
set -euo pipefail

cd /Library/WebServer/Documents/TIKTOK

# launchd không load .zshrc — cần tự tìm node/npm từ nvm
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_NODE_BIN="$(ls -d "$HOME/.nvm/versions/node/"*/bin 2>/dev/null | sort -V | tail -1)"
  if [ -n "${NVM_NODE_BIN:-}" ]; then
    export PATH="$NVM_NODE_BIN:/usr/bin:/opt/homebrew/bin:/usr/local/bin:/bin:/usr/sbin:/sbin:$PATH"
  fi
fi
export PATH="/usr/bin:/opt/homebrew/bin:/usr/local/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export PYTHON_BIN="/usr/bin/python3"
export NPX_BIN="${NPX_BIN:-$(command -v npx)}"

export TIKTOK_PRIVACY="${TIKTOK_PRIVACY:-PUBLIC_TO_EVERYONE}"
BASE_URL="${BASE_URL:-https://autopublisher.click}"
BACKLOG_MIN_ID="${BACKLOG_MIN_ID:-73}"
PEM="${DEPLOY_PEM:-/Library/WebServer/Documents/NEXTA/deploy_backend/nexta.pem}"
SSH_HOST="${DEPLOY_HOST:-gitlab@124.158.6.144}"
SSH_PORT="${DEPLOY_PORT:-2345}"
REMOTE_APP="${REMOTE_APP:-/var/www/autopublisher}"
RSYNC_SSH="ssh -i $PEM -p $SSH_PORT -o BatchMode=yes"
# Scheduled slots: also gen 1 new post into warehouse (3/day). Set SKIP_STOCK_GEN=1 to disable.
SKIP_STOCK_GEN="${SKIP_STOCK_GEN:-0}"

mkdir -p logs storage/videos/posts

echo "==================================="
echo "🤖 Daily TikTok PHOTO - $(date)"
echo "🔓 Privacy: $TIKTOK_PRIVACY"
echo "🎵 TikTok auto_add_music (photo carousel)"
echo "📦 Publish backlog + stock 1 new post/slot"
echo "==================================="

# OAuth first — SSH runs fresh Node with getValidTokens() (no stale HTTP /api/demo/status).
if [ ! -f "$PEM" ]; then
  echo "❌ Deploy PEM not found: $PEM"
  exit 1
fi
echo ""
echo "🔐 Ensuring TikTok OAuth on production..."
if ! bash scripts/ensure-tiktok-oauth.sh; then
  exit 1
fi

SOURCE="backlog"
POST_ID=""
DO_STOCK_GEN=0

# Manual: numeric id OR dated folder name (2026-07-21-054030-noon)
if [ -n "${1:-}" ] && [[ "${1}" =~ ^[0-9]+$|^[0-9]{4}-[0-9]{2}-[0-9]{2}- ]]; then
  POST_ID="$1"
  SOURCE="manual"
  echo "📌 Manual post id: $POST_ID"
elif [ -n "${1:-}" ]; then
  echo "📝 Manual topic (skip backlog): $*"
  "$NPX_BIN" ts-node src/daily-batch.ts "$@"
  POST_ID="$(tr -d '[:space:]' < storage/videos/latest-post.txt)"
  SOURCE="generated"
else
  DO_STOCK_GEN=1
  BREAKDOWN="$("$NPX_BIN" ts-node src/backlog.ts breakdown)"
  echo "📊 Backlog: $BREAKDOWN"
  POST_ID="$("$NPX_BIN" ts-node src/backlog.ts next || true)"
  if [ -n "$POST_ID" ]; then
    SOURCE="backlog"
    echo "📦 Using backlog post: $POST_ID"
  else
    echo "✨ Backlog empty — generating a post to publish now..."
    "$NPX_BIN" ts-node src/daily-batch.ts
    POST_ID="$(tr -d '[:space:]' < storage/videos/latest-post.txt)"
    SOURCE="generated"
    # Already just generated the publish post — skip extra stock gen this slot
    DO_STOCK_GEN=0
  fi
fi

if [ -z "$POST_ID" ]; then
  echo "❌ No post id to publish"
  exit 1
fi

POST_DIR="storage/videos/posts/$POST_ID"
PHOTOS_DIR="$POST_DIR/photos"
CAPTION="$POST_DIR/caption.txt"

if [ ! -f "$CAPTION" ]; then
  echo "❌ Missing caption: $CAPTION"
  exit 1
fi

echo ""
echo "🖼️  Ensuring photos/ for post $POST_ID..."
"$NPX_BIN" ts-node -e "
import { ensurePostPhotos } from './src/backlog';
ensurePostPhotos(process.argv[1]).then((p) => console.log('Photos:', p.length)).catch((e) => { console.error(e); process.exit(1); });
" "$POST_ID"

PHOTO_COUNT="$(find "$PHOTOS_DIR" -maxdepth 1 -iname '*.jpg' 2>/dev/null | wc -l | tr -d ' ')"
if [ "${PHOTO_COUNT:-0}" -lt 4 ]; then
  echo "❌ Need at least 4 photos in $PHOTOS_DIR (got ${PHOTO_COUNT:-0})"
  exit 1
fi

echo ""
echo "📤 Sync photos → production ($POST_ID)..."
ssh -i "$PEM" -p "$SSH_PORT" -o BatchMode=yes "$SSH_HOST" \
  "mkdir -p $REMOTE_APP/public/media/posts/$POST_ID $REMOTE_APP/storage/videos/posts/$POST_ID/photos"

rsync -avz -e "$RSYNC_SSH" "$PHOTOS_DIR/" \
  "$SSH_HOST:$REMOTE_APP/public/media/posts/$POST_ID/"
rsync -avz -e "$RSYNC_SSH" "$PHOTOS_DIR/" \
  "$SSH_HOST:$REMOTE_APP/storage/videos/posts/$POST_ID/photos/"
rsync -avz -e "$RSYNC_SSH" "$CAPTION" \
  "$SSH_HOST:$REMOTE_APP/storage/videos/posts/$POST_ID/caption.txt"
if [ -f "$POST_DIR/meta.json" ]; then
  rsync -avz -e "$RSYNC_SSH" "$POST_DIR/meta.json" \
    "$SSH_HOST:$REMOTE_APP/storage/videos/posts/$POST_ID/meta.json"
fi

echo ""
echo "🚀 Publishing PHOTO carousel as $TIKTOK_PRIVACY (source=$SOURCE)..."
PUBLISH_OUT=""
for PUBLISH_ATTEMPT in 1 2; do
  PUBLISH_OUT="$(ssh -i "$PEM" -p "$SSH_PORT" -o BatchMode=yes "$SSH_HOST" \
    "cd $REMOTE_APP && TIKTOK_PRIVACY=$TIKTOK_PRIVACY node dist/publish-photo-post.js '$POST_ID' '$TIKTOK_PRIVACY'" 2>&1)" || true
  echo "$PUBLISH_OUT"
  if echo "$PUBLISH_OUT" | grep -q 'PUBLISH_COMPLETE'; then
    break
  fi
  if [ "$PUBLISH_ATTEMPT" -eq 1 ] && echo "$PUBLISH_OUT" | grep -qiE 'token|oauth|401|access_token|No valid access'; then
    echo "⚠️  Publish failed (token) — refreshing OAuth and retrying once..."
    bash scripts/ensure-tiktok-oauth.sh || exit 1
  else
    break
  fi
done

PUBLISH_OK="$(node -e "
const out = process.argv[1];
const ok = /PUBLISH_COMPLETE/.test(out);
process.stdout.write(String(ok));
" "$PUBLISH_OUT")"
PUBLISH_ID="$(node -e "
const out = process.argv[1];
const m = out.match(/publish_id:\\s*(\\S+)/i) || out.match(/\"publishId\":\\s*\"([^\"]+)\"/);
process.stdout.write(m ? m[1] : '');
" "$PUBLISH_OUT")"
TIKTOK_POST_IDS="$(node -e "
const out = process.argv[1];
const m = out.match(/tiktok_post_id:\\s*(.+)/i) || out.match(/Public post ID\\(s\\):\\s*(.+)/i);
if (!m) process.exit(0);
process.stdout.write(m[1].trim().split(/[,\\s]+/).filter(Boolean).join(','));
" "$PUBLISH_OUT")"

if [ "$PUBLISH_OK" != "true" ]; then
  echo "❌ Photo publish failed — post $POST_ID NOT marked published (will retry next slot)"
  exit 1
fi

"$NPX_BIN" ts-node -e "
import { markPostPublished } from './src/backlog';
const ids = process.argv[4] ? process.argv[4].split(',').filter(Boolean) : [];
markPostPublished(process.argv[1], {
  publishId: process.argv[2] || undefined,
  tiktokPostIds: ids.length ? ids : undefined,
  privacy: process.argv[3],
  format: 'photo'
});
console.log('Marked published:', process.argv[1]);
" "$POST_ID" "$PUBLISH_ID" "$TIKTOK_PRIVACY" "$TIKTOK_POST_IDS"

LEFT="$("$NPX_BIN" ts-node src/backlog.ts count)"
echo ""
echo "✅ Published PHOTO post $POST_ID ($TIKTOK_PRIVACY), source=$SOURCE"
echo "📁 $POST_DIR"
echo "📊 Backlog remaining: $LEFT"

# --- Stock warehouse: gen 1 new post (not published this slot) ---
# 3 schedule slots/day → ~3 new posts/day so kho không cạn.
if [ "$DO_STOCK_GEN" = "1" ] && [ "$SKIP_STOCK_GEN" != "1" ]; then
  echo ""
  echo "==================================="
  echo "🏭 Stock gen — add 1 post to warehouse"
  echo "==================================="
  if "$NPX_BIN" ts-node src/daily-batch.ts; then
    STOCK_ID="$(tr -d '[:space:]' < storage/videos/latest-post.txt)"
    echo "✅ Stocked new post: $STOCK_ID (not published yet — waits in backlog)"
    LEFT2="$("$NPX_BIN" ts-node src/backlog.ts count)"
    echo "📊 Backlog after stock: $LEFT2"
  else
    echo "⚠️ Stock gen failed (image API / credits?) — publish already succeeded; will retry next slot"
  fi
elif [ "$SKIP_STOCK_GEN" = "1" ]; then
  echo "📌 SKIP_STOCK_GEN=1 — skipped warehouse gen"
fi
