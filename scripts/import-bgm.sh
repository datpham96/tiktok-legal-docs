#!/bin/bash
# Copy MP3 vào kho nhạc custom (ưu tiên khi publish video).
# Usage:
#   ./scripts/import-bgm.sh ~/Downloads/*.mp3
#   ./scripts/import-bgm.sh /path/to/folder
set -euo pipefail

DEST="/Library/WebServer/Documents/TIKTOK/assets/bgm/custom"
mkdir -p "$DEST"

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <file.mp3 ...> | <folder>"
  echo ""
  echo "Gợi ý tải nhạc (free, TikTok/YouTube OK):"
  echo "  https://mixkit.co/free-stock-music/  → lo-fi, hip-hop, cinematic"
  echo "  https://pixabay.com/music/           → search 'lofi' / 'motivational'"
  echo "Kéo file .mp3 tải về vào lệnh này."
  exit 1
fi

count=0
for arg in "$@"; do
  if [ -d "$arg" ]; then
    while IFS= read -r -d '' f; do
      base="$(basename "$f")"
      cp "$f" "$DEST/$base"
      echo "✅ $base"
      count=$((count + 1))
    done < <(find "$arg" -maxdepth 1 -iname '*.mp3' -print0)
  elif [ -f "$arg" ] && [[ "$arg" =~ \.[mM][pP]3$ ]]; then
    base="$(basename "$arg")"
    cp "$arg" "$DEST/$base"
    echo "✅ $base"
    count=$((count + 1))
  else
    echo "⚠️  Skip: $arg"
  fi
done

echo ""
echo "📁 $count track(s) in $DEST"
ls -lh "$DEST"/*.mp3 2>/dev/null | awk '{print "   ", $9, "(" $5 ")"}' || true
echo ""
echo "Test pick: npx ts-node src/prepare-bgm.ts"
