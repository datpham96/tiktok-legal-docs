#!/bin/bash
# Bật lại auto-post 4 slot/ngày.
set -euo pipefail

ROOT="/Library/WebServer/Documents/TIKTOK"
AGENTS=(
  com.tiktok.autopost.morning
  com.tiktok.autopost.noon
  com.tiktok.autopost.evening
  com.tiktok.autopost.night
)

for label in "${AGENTS[@]}"; do
  src="$ROOT/${label}.plist"
  dst="$HOME/Library/LaunchAgents/${label}.plist"
  if [ -f "$src" ]; then
    cp "$src" "$dst"
    launchctl unload "$dst" 2>/dev/null || true
    launchctl load "$dst"
    echo "▶️  Loaded $label"
  fi
done

echo ""
echo "✅ Auto-post resumed (06:30 / 11:30 / 16:30 / 20:00)."
