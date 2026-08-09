#!/usr/bin/env bash
# Publish a stored post via the live AutoPublisher API (after OAuth on production).
# Bakes cover + muxes BGM locally so the uploaded file already has music.
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

TMP_DIR="$(mktemp -d)"
UPLOAD_VIDEO="$TMP_DIR/ready.mp4"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "🎬 Preparing video (cover + BGM)..."
cd "$ROOT"
npx ts-node -e "
import fs from 'fs';
import { bakeCoverIntoVideo } from './src/video-cover';
import { ensureDefaultBgm, muxBackgroundMusic, videoHasAudio } from './src/video-music';

async function main() {
  const video = process.argv[1];
  const cover = process.argv[2];
  const out = process.argv[3];
  let current = video;
  let tempCover: string | undefined;

  if (fs.existsSync(cover)) {
    console.log('🖼️  Baking cover...');
    const baked = await bakeCoverIntoVideo(video, cover);
    current = baked.videoPath;
    tempCover = baked.tempPath;
    console.log('   cover timestamp ms:', baked.coverTimestampMs);
  }

  if (await videoHasAudio(current)) {
    console.log('🎵 Video already has audio');
    fs.copyFileSync(current, out);
  } else {
    console.log('🎵 Muxing BGM...');
    const music = await ensureDefaultBgm();
    const muxed = await muxBackgroundMusic(current, music, out);
    console.log('   BGM:', music, '→', muxed);
  }

  if (tempCover) fs.rmSync(tempCover, { recursive: true, force: true });
}
main().catch((e) => { console.error(e); process.exit(1); });
" "$VIDEO" "$COVER" "$UPLOAD_VIDEO"

echo "📤 Uploading post $POST_ID video..."
curl -sS -X POST "$BASE_URL/api/demo/video" \
  -H "Content-Type: video/mp4" \
  --data-binary @"$UPLOAD_VIDEO" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{console.log(d); const j=JSON.parse(d); if(!j.ok) process.exit(1)})"

echo "🚀 Publishing as $PRIVACY..."
PAYLOAD="$(node -e "
const caption = require('fs').readFileSync(process.argv[1],'utf8');
process.stdout.write(JSON.stringify({
  caption,
  privacy: process.argv[2],
  allowComment: true,
  allowDuet: false,
  allowStitch: false,
  isAigc: true
}));
" "$CAPTION_FILE" "$PRIVACY")"

curl -sS -X POST "$BASE_URL/api/demo/publish" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | python3 -m json.tool
