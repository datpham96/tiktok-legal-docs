#!/bin/bash
# Tạm dừng auto-post (4 slot/ngày). Giữ token-refresh chạy.
# Di chuyển plist ra khỏi LaunchAgents để reboot không tự bật lại.
set -euo pipefail

PAUSE_DIR="$HOME/Library/LaunchAgents/.tiktok-paused"
mkdir -p "$PAUSE_DIR"

AGENTS=(
  com.tiktok.autopost.morning
  com.tiktok.autopost.noon
  com.tiktok.autopost.evening
  com.tiktok.autopost.night
)

for label in "${AGENTS[@]}"; do
  plist="$HOME/Library/LaunchAgents/${label}.plist"
  if [ -f "$plist" ]; then
    launchctl unload "$plist" 2>/dev/null || true
    mv "$plist" "$PAUSE_DIR/"
    echo "⏸️  Paused $label (plist moved to .tiktok-paused/)"
  elif [ -f "$PAUSE_DIR/${label}.plist" ]; then
    echo "⏸️  Already paused: $label"
  fi
done

echo ""
echo "✅ Auto-post paused — reboot cũng không tự bật lại."
echo "   Bật lại: ./scripts/resume-autopost.sh"
