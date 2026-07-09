#!/bin/bash
set -euo pipefail

cd /Library/WebServer/Documents/TIKTOK

LOG="logs/batch-phase3-5-$(date +%Y%m%d-%H%M).log"
mkdir -p logs

# Phase 3–5: topics index 15..44 (0-based)
TOPICS=(
  "Cách dùng AI phân tích 5 video competitor để tìm góc content mới"
  "A/B test hook: dùng AI viết 3 mở đầu và chọn retention cao nhất"
  "Công thức video series: giữ người xem theo dõi từ tập 1 đến tập 5"
  "Cách viết CTA cuối video khiến người xem follow mà không giống quảng cáo"
  "Hashtag strategy: nhờ AI chọn hashtag nhỏ + lớn cho video mới"
  "Thời điểm đăng tối ưu: đọc Analytics và lên lịch bằng AI"
  "Cách làm video trả lời comment để tăng tương tác nhanh"
  "Storytelling ngắn: biến kinh nghiệm cá nhân thành script bằng AI"
  "Khi nào nên đổi format video: slide, talking head hay mix"
  "Bảng theo dõi KPI tuần: view, retention, follow — AI gợi ý hành động"
  "3 cách creator kiếm tiền từ TikTok khi chưa nhiều follower"
  "Cách dùng AI viết media kit 1 trang để nhận brand deal"
  "Script video review sản phẩm: tự nhiên, không giống quảng cáo"
  "Affiliate content: chọn sản phẩm phù hợp niche bằng AI"
  "Cách định giá bài đăng sponsored cho creator mới"
  "Email/DM pitch brand: AI viết tin nhắn chuyên nghiệp trong 5 phút"
  "Tạo lead magnet miễn phí từ content TikTok: checklist, template"
  "Bán template/prompt pack: biến kiến thức đã dạy thành sản phẩm số"
  "Khi nào nên mở kênh thứ 2: YouTube Shorts, Instagram Reels"
  "Thu nhập đa kênh: repurpose + AI để không làm lại từ đầu"
  "SOP tạo 1 video: từ brief → script → hình → đăng (template AI)"
  "Cách brief editor/VA bằng AI để output đúng ý lần đầu"
  "Content calendar 30 ngày: batch 1 buổi, đăng cả tháng"
  "AI agent workflow: research → plan → gen → review (semi-auto)"
  "Quality control: checklist 10 điểm trước khi publish"
  "Xây thư viện prompt riêng cho niche của bạn"
  "Onboard người mới vào team content bằng tài liệu AI-generated"
  "Đo ROI thời gian: AI vs thuê người vs tự làm"
  "Khi nào invest tool trả phí: ChatGPT Plus, Midjourney, v.v."
  "Tổng kết 90 ngày: từ 0 → creator có hệ thống AI hoàn chỉnh"
)

TOTAL=${#TOPICS[@]}
OK=0
FAIL=0

echo "======================================" | tee -a "$LOG"
echo "Batch gen Phase 3–5: $TOTAL videos" | tee -a "$LOG"
echo "Started: $(date)" | tee -a "$LOG"
echo "======================================" | tee -a "$LOG"

for i in "${!TOPICS[@]}"; do
  TOPIC="${TOPICS[$i]}"
  NUM=$((i + 1))
  PHASE=3
  if [ "$NUM" -gt 10 ]; then PHASE=4; fi
  if [ "$NUM" -gt 20 ]; then PHASE=5; fi

  echo "" | tee -a "$LOG"
  echo "[$NUM/$TOTAL] Phase $PHASE: $TOPIC" | tee -a "$LOG"

  if ./auto-post.sh "$TOPIC" >> "$LOG" 2>&1; then
    OK=$((OK + 1))
    echo "✅ OK ($OK success, $FAIL failed)" | tee -a "$LOG"
  else
    FAIL=$((FAIL + 1))
    echo "❌ FAILED ($OK success, $FAIL failed)" | tee -a "$LOG"
  fi
done

# Update last_index to end of series
python3 -c "
import json
p='content-series.json'
d=json.load(open(p))
d['last_index']=len(d['topics'])-1
json.dump(d, open(p,'w'), ensure_ascii=False, indent=2)
print()
" >> "$LOG" 2>&1 || true

echo "" | tee -a "$LOG"
echo "======================================" | tee -a "$LOG"
echo "Done: $(date)" | tee -a "$LOG"
echo "Success: $OK / $TOTAL | Failed: $FAIL" | tee -a "$LOG"
echo "Log: $LOG" | tee -a "$LOG"
echo "======================================" | tee -a "$LOG"
