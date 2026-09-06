#!/usr/bin/env bash
# Generate numbered posts (123, 124, …) from explicit topics.
# Usage: bash scripts/gen-numbered-posts.sh [start_id]
set -euo pipefail

cd /Library/WebServer/Documents/TIKTOK

if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_NODE_BIN="$(ls -d "$HOME/.nvm/versions/node/"*/bin 2>/dev/null | sort -V | tail -1)"
  export PATH="$NVM_NODE_BIN:/usr/bin:/opt/homebrew/bin:/usr/local/bin:/bin:/usr/sbin:/sbin:$PATH"
fi
export PYTHON_BIN="${PYTHON_BIN:-/usr/bin/python3}"
export NPX_BIN="${NPX_BIN:-$(command -v npx)}"
export SERIES_ONLY=1
# Codex image quota exhausted — reuse images/scene_*.png until reset (~51h)
export REUSE_IMAGES="${REUSE_IMAGES:-1}"

START_ID="${1:-143}"
BASE_ID=143
mkdir -p logs storage/videos/posts

# Phase 7 — topics mới (143+)
TOPICS=(
  "TikTok Shop: dùng AI viết script bán hàng không bị đánh giá spam"
  "UGC creator: workflow nhận job brand và giao video bằng AI"
  "AI voiceover tiếng Việt: khi nào dùng, khi nào nên tự thu âm"
  "Cover/thumbnail carousel: AI gợi ý headline giữ người vuốt tiếp"
  "Trả lời comment hàng loạt: template AI + cá nhân hóa từng câu"
  "Xử lý comment tiêu cực trên TikTok mà không làm leo thang"
  "Lên kế hoạch content theo mùa: Tết, sale, back-to-school bằng AI"
  "Script collab với creator khác: AI draft, hai bên chỉnh giọng"
  "Chuẩn bị live TikTok: outline + Q&A dự phòng nhờ AI"
  "Chiến lược Duet/Stitch: tìm video gốc và viết phản hồi bằng AI"
  "Nhạc và bản quyền TikTok: checklist creator dùng AI không vi phạm"
  "Song ngữ Việt-Anh trên TikTok: AI giúp localize caption và script"
  "Lộ trình micro-influencer 1k–10k follower với AI workflow"
  "Dashboard KPI tháng: Notion/Sheet + AI tóm tắt và gợi ý hành động"
  "A/B caption: 3 phiên bản hashtag và hook — chọn bản thắng"
  "Biến DM hỏi đáp thành video FAQ series bằng AI"
  "Script unboxing tự nhiên: công thức 60 giây không giống quảng cáo"
  "Case study: 1 tuần chỉ đăng repurpose — kết quả và bài học"
  "Khi video flop: AI phân tích retention và đề xuất fix cụ thể"
  "Batch 10 ý tưởng từ 1 trend: AI brainstorm không copy y chang"
  "Personal IP: xây series nhận diện (màu, hook, catchphrase) với AI"
  "Thuê freelancer vs AI: ma trận quyết định cho creator ở giai đoạn nào"
  "Backup workflow: khi API AI down vẫn ra bài trong 24h"
  "Tối ưu bio link: AI viết landing copy cho Linktree/Beacons"
  "Newsletter từ TikTok: biến top video thành email tuần bằng AI"
  "Pitch podcast/khách mời: AI viết intro và 5 câu hỏi phỏng vấn"
  "Chuẩn bị portfolio PDF cho brand: AI layout + case study ngắn"
  "Xây thư viện prompt riêng cho niche của bạn"
  "Onboard người mới vào team content bằng tài liệu AI-generated"
  "Đo ROI thời gian: AI vs thuê người vs tự làm"
  "Khi nào invest tool trả phí: ChatGPT Plus, Midjourney, v.v."
  "Tổng kết 90 ngày: từ 0 → creator có hệ thống AI hoàn chỉnh"
  "90 ngày tiếp theo: roadmap scale từ 142 video lên hệ thống team nhỏ"
)

SKIP=$((START_ID - BASE_ID))
if [ "$SKIP" -lt 0 ]; then
  SKIP=0
fi
if [ "$SKIP" -ge "${#TOPICS[@]}" ]; then
  echo "Nothing to generate: start id $START_ID is past all ${#TOPICS[@]} topics (base $BASE_ID)." >&2
  exit 0
fi
TOPICS=("${TOPICS[@]:$SKIP}")

STAMP="$(date +%Y%m%d-%H%M)"
LOG="logs/gen-numbered-${START_ID}-${STAMP}.log"
OK=0
FAIL=0
ID="$START_ID"

echo "======================================" | tee -a "$LOG"
echo "Gen numbered posts from ID $START_ID" | tee -a "$LOG"
echo "Total topics: ${#TOPICS[@]}" | tee -a "$LOG"
echo "Started: $(date)" | tee -a "$LOG"
echo "======================================" | tee -a "$LOG"

for TOPIC in "${TOPICS[@]}"; do
  DEST="storage/videos/posts/$ID"
  if [ -d "$DEST" ] && [ -f "$DEST/caption.txt" ]; then
    echo "⏭️  Skip $ID — already exists" | tee -a "$LOG"
    ID=$((ID + 1))
    continue
  fi

  echo "" | tee -a "$LOG"
  echo "[$ID] $TOPIC" | tee -a "$LOG"

  if "$NPX_BIN" ts-node src/daily-batch.ts "$TOPIC" >> "$LOG" 2>&1; then
    FOLDER="$(tr -d '[:space:]' < storage/videos/latest-post.txt)"
    SRC="storage/videos/posts/$FOLDER"
    if [ ! -d "$SRC" ]; then
      echo "❌ Missing output folder $SRC" | tee -a "$LOG"
      FAIL=$((FAIL + 1))
      ID=$((ID + 1))
      continue
    fi
    if [ "$FOLDER" != "$ID" ]; then
      rm -rf "$DEST"
      mv "$SRC" "$DEST"
      echo "$ID" > storage/videos/latest-post.txt
    fi
    OK=$((OK + 1))
    echo "✅ Saved post $ID ($OK ok, $FAIL fail)" | tee -a "$LOG"
  else
    FAIL=$((FAIL + 1))
    echo "❌ Failed post $ID ($OK ok, $FAIL fail)" | tee -a "$LOG"
  fi

  ID=$((ID + 1))
  sleep 3
done

echo "" | tee -a "$LOG"
echo "======================================" | tee -a "$LOG"
echo "Done: $(date)" | tee -a "$LOG"
echo "Success: $OK | Failed: $FAIL | Next id: $ID" | tee -a "$LOG"
echo "Log: $LOG" | tee -a "$LOG"
echo "======================================" | tee -a "$LOG"
