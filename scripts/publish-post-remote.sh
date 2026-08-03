#!/usr/bin/env bash
# Publish a stored post via the live AutoPublisher API (after OAuth on production).
set -euo pipefail

POST_ID="${1:-70}"
PRIVACY="${2:-SELF_ONLY}"
BASE_URL="${BASE_URL:-https://autopublisher.click}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
POST_DIR="$ROOT/storage/videos/posts/$POST_ID"
VIDEO="$POST_DIR/video.mp4"
COVER="$POST_DIR/cover.png"
CAPTION_FILE="$POST_DIR/caption.txt"

if [[ ! -f "$VIDEO" ]]; then
  echo "❌ Missing video: $VIDEO"
  exit 1
fi

STATUS="$(curl -s "$BASE_URL/api/demo/status")"
CONNECTED="$(node -e "const s=JSON.parse(process.argv[1]); process.stdout.write(String(!!s.connected))" "$STATUS")"
if [[ "$CONNECTED" != "true" ]]; then
  echo "❌ TikTok chưa kết nối trên $BASE_URL"
  echo "👉 Mở: $BASE_URL/auth/tiktok"
  echo "   Sau khi connect xong, chạy lại: $0 $POST_ID $PRIVACY"
  exit 1
fi

UPLOAD_VIDEO="$VIDEO"
TMP_DIR=""
if [[ -f "$COVER" ]]; then
  echo "🖼️  Baking cover into first frame before upload..."
  TMP_DIR="$(mktemp -d)"
  UPLOAD_VIDEO="$TMP_DIR/with-cover.mp4"
  cd "$ROOT"
  npx ts-node -e "
import { bakeCoverIntoVideo } from './src/video-cover';
import fs from 'fs';
async function main() {
  const baked = await bakeCoverIntoVideo(process.argv[1], process.argv[2]);
  fs.copyFileSync(baked.videoPath, process.argv[3]);
  if (baked.tempPath) fs.rmSync(baked.tempPath, { recursive: true, force: true });
  console.log('Cover baked, timestamp ms:', baked.coverTimestampMs);
}
main().catch((e) => { console.error(e); process.exit(1); });
" "$VIDEO" "$COVER" "$UPLOAD_VIDEO"
fi

echo "📤 Uploading post $POST_ID video..."
curl -sS -X POST "$BASE_URL/api/demo/video" \
  -H "Content-Type: video/mp4" \
  --data-binary @"$UPLOAD_VIDEO" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(d); const j=JSON.parse(d); if(!j.ok) process.exit(1)})"

echo "🚀 Publishing as $PRIVACY (auto music on)..."
PAYLOAD="$(node -e "
const caption = require('fs').readFileSync(process.argv[1],'utf8');
process.stdout.write(JSON.stringify({
  caption,
  privacy: process.argv[2],
  allowComment: true,
  allowDuet: false,
  allowStitch: false,
  isAigc: true,
  autoAddMusic: true
}));
" "$CAPTION_FILE" "$PRIVACY")"

curl -sS -X POST "$BASE_URL/api/demo/publish" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | python3 -m json.tool

if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
  rm -rf "$TMP_DIR"
fi
