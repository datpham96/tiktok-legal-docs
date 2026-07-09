# TikTok Auto-Post Scheduler

## ✅ Đã setup

Hệ thống tự động **research + tạo video** vào 3 khung giờ mỗi ngày:
- **07:30** - Buổi sáng
- **12:30** - Buổi trưa
- **17:30** - Buổi chiều

> Trong lúc chờ TikTok Developer duyệt, script **chỉ tạo video + caption + cover** để bạn đăng thủ công. Không auto-publish.

## 📂 Files chính

- `auto-post.sh` - Script chạy daily batch
- `src/daily-batch.ts` - Research trend + gen video + lưu theo ngày
- `content-series.json` - Chuỗi chủ đề nối tiếp trong niche
- `storage/videos/posts/` - Mỗi lần chạy lưu 1 folder riêng
- `com.tiktok.autopost.*.plist` - Launch agents

## 🎯 Topics tự động random

Script sẽ tự chọn 1 trong 10 topics trending:
- AI trends that will change everything
- Tech tips you need to know today
- Future of automation and AI
- Content creation in the AI era
- Productivity hacks for creators
- Latest tech innovations explained
- AI tools everyone should try
- Digital marketing in 2026
- Creator economy insights
- Tech news breakdown

## ✅ Quản lý scheduler

### Kiểm tra trạng thái
```bash
launchctl list | grep com.tiktok.autopost
```

### Xem logs
```bash
# Log buổi sáng
tail -f logs/autopost-morning.log

# Log buổi trưa
tail -f logs/autopost-noon.log

# Log buổi chiều
tail -f logs/autopost-evening.log
```

### Test ngay (không đợi đến giờ)
```bash
./auto-post.sh "Test topic của tôi"
```

### Tắt scheduler (tạm ngừng)
```bash
launchctl unload ~/Library/LaunchAgents/com.tiktok.autopost.morning.plist
launchctl unload ~/Library/LaunchAgents/com.tiktok.autopost.noon.plist
launchctl unload ~/Library/LaunchAgents/com.tiktok.autopost.evening.plist
```

### Bật lại scheduler
```bash
launchctl load ~/Library/LaunchAgents/com.tiktok.autopost.morning.plist
launchctl load ~/Library/LaunchAgents/com.tiktok.autopost.noon.plist
launchctl load ~/Library/LaunchAgents/com.tiktok.autopost.evening.plist
```

### Xóa hoàn toàn scheduler
```bash
launchctl unload ~/Library/LaunchAgents/com.tiktok.autopost.*.plist
rm ~/Library/LaunchAgents/com.tiktok.autopost.*.plist
```

## ⚠️ Điều kiện để scheduler chạy

1. **Mac phải bật** vào khung giờ đó
2. **Localtunnel hoặc Cloudflare Tunnel phải chạy** (cho OAuth callback)
3. **Access token phải valid** (refresh nếu hết hạn)
4. **Production credentials** (nếu muốn video lên TikTok thật, không phải sandbox)

## 🔧 Customization

### Thêm/sửa topics
Sửa file `auto-post.sh`, mảng `topics`:
```bash
nano auto-post.sh
```

### Đổi giờ đăng
Sửa file plist tương ứng, ví dụ đổi 7:30 → 8:00:
```bash
nano ~/Library/LaunchAgents/com.tiktok.autopost.morning.plist
# Sửa <integer>7</integer> thành <integer>8</integer>
# Sửa <integer>30</integer> thành <integer>0</integer>

# Reload lại
launchctl unload ~/Library/LaunchAgents/com.tiktok.autopost.morning.plist
launchctl load ~/Library/LaunchAgents/com.tiktok.autopost.morning.plist
```

### Thêm khung giờ mới
Copy 1 file plist, đổi label và giờ, rồi load:
```bash
cp ~/Library/LaunchAgents/com.tiktok.autopost.evening.plist \
   ~/Library/LaunchAgents/com.tiktok.autopost.night.plist

# Sửa label và giờ trong file
nano ~/Library/LaunchAgents/com.tiktok.autopost.night.plist

# Load
launchctl load ~/Library/LaunchAgents/com.tiktok.autopost.night.plist
```

## 🐛 Troubleshooting

### Scheduler không chạy
1. Kiểm tra Mac có bật vào giờ đó không
2. Xem log có lỗi gì: `tail logs/autopost-*-error.log`
3. Test thủ công: `./auto-post.sh`

### Token hết hạn
Access token TikTok thường có TTL 24h. Nếu hết hạn:
```bash
# Xóa token cũ
rm tokens.json

# Authenticate lại
# Mở: https://<localtunnel-url>/auth/tiktok
```

### Video không lên TikTok
- Kiểm tra đang dùng **sandbox** hay **production** credentials
- Sandbox chỉ test, không lên TikTok thật
- Cần production credentials từ TikTok Developer Portal

## 📊 Monitoring

Tạo script check hàng ngày:
```bash
# Xem tổng số video đã post hôm nay
grep "Successfully posted" logs/*.log | grep "$(date +%Y-%m-%d)" | wc -l
```

## 🚀 Next Steps

1. Chuyển sang **production credentials**
2. Setup **Cloudflare Tunnel** thay localtunnel (URL cố định)
3. Thêm monitoring/alerting khi post fail
4. A/B test các topic/caption khác nhau
5. Tích hợp analytics để track video performance
