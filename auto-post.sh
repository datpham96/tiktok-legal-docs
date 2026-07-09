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

mkdir -p logs storage/videos/posts

echo "==================================="
echo "🤖 Daily TikTok Content - $(date)"
echo "==================================="

if [ -n "${1:-}" ]; then
  echo "📝 Manual topic: $1"
  "$NPX_BIN" ts-node src/daily-batch.ts "$@"
else
  echo "🔍 Auto mode: series topic + trend research"
  "$NPX_BIN" ts-node src/daily-batch.ts
fi

echo ""
echo "✅ Video ready for manual posting"
echo "📁 Check: storage/videos/posts/"
