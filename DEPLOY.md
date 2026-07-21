# Deploy AutoPublisher to your server + domain

Hiện tại [https://autopublisher.click](https://autopublisher.click) đang trỏ **GitHub Pages**.
Để chạy app Node (website + studio + OAuth) trên **server của bạn**, làm theo các bước dưới.

## Kiến trúc sau khi deploy

```text
https://autopublisher.click/                 → marketing website
https://autopublisher.click/privacy-policy   → Privacy Policy
https://autopublisher.click/terms-of-service → Terms of Service
https://autopublisher.click/studio           → demo studio (quay video review)
https://autopublisher.click/auth/tiktok      → Login Kit OAuth
https://autopublisher.click/callback/tiktok  → OAuth callback
```

```text
Internet → DNS A record → VPS:443 (nginx + SSL) → Node app :3000 (PM2)
```

## Yêu cầu server

- Ubuntu/Debian VPS (hoặc máy Linux public)
- IP public cố định
- Mở port **80** và **443**
- Node.js 18+
- nginx
- (khuyến nghị) `pm2`, `certbot`

> Mac nhà (`123.24.143.54`) chỉ dùng được nếu router **port forward 80/443** vào máy và IP không đổi. Với TikTok review nên dùng **VPS**.

---

## Bước 1 — Upload code lên server

Ví dụ:

```bash
# trên máy local
rsync -avz --exclude node_modules --exclude .git --exclude storage/videos/posts \
  /Library/WebServer/Documents/TIKTOK/ \
  user@YOUR_SERVER_IP:/var/www/autopublisher/
```

Hoặc clone từ Git nếu repo đã push.

## Bước 2 — Cấu hình `.env` trên server

```bash
cd /var/www/autopublisher
cp .env.example .env
nano .env
```

Đặt:

```env
PORT=3000
BASE_URL=https://autopublisher.click
TIKTOK_REDIRECT_URI=https://autopublisher.click/callback/tiktok

TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
ROUTER9_API_KEY=...
```

## Bước 3 — Cài và chạy app

```bash
cd /var/www/autopublisher
npm i -g pm2
bash deploy/setup-server.sh

# tạo video demo nếu chưa có
npm run generate-video
pm2 restart autopublisher
```

Kiểm tra local trên server:

```bash
curl http://127.0.0.1:3000/health
```

## Bước 4 — nginx reverse proxy

```bash
sudo cp deploy/nginx-autopublisher.conf /etc/nginx/sites-available/autopublisher
sudo ln -sf /etc/nginx/sites-available/autopublisher /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Bước 5 — SSL (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d autopublisher.click -d www.autopublisher.click
```

## Bước 6 — DNS trên Tenten

Trong DNS domain `autopublisher.click`:

1. **Xóa** CNAME đang trỏ `datpham96.github.io` (GitHub Pages)
2. Thêm bản ghi **A**:

| Type | Host | Value |
|------|------|--------|
| A | `@` | `YOUR_SERVER_IP` |
| A | `www` | `YOUR_SERVER_IP` |

(hoặc `www` CNAME → `autopublisher.click`)

Đợi DNS propagate (5–60 phút). Test:

```bash
dig +short autopublisher.click
curl -I https://autopublisher.click/health
```

## Bước 7 — TikTok Developer Portal

Cập nhật:

```text
Website URL:     https://autopublisher.click
Terms URL:       https://autopublisher.click/terms-of-service
Privacy URL:     https://autopublisher.click/privacy-policy
Redirect URI:    https://autopublisher.click/callback/tiktok
```

Bật **Sandbox**, thêm Target users.

## Bước 8 — Quay demo

1. Mở `https://autopublisher.click/` (website)
2. Mở `https://autopublisher.click/studio`
3. Connect → Publish → verify trên TikTok app

---

## Checklist nhanh

- [ ] Code trên server, `pm2` chạy ổn
- [ ] nginx proxy + HTTPS OK
- [ ] DNS A trỏ IP server (không còn GitHub Pages)
- [ ] `/`, `/studio`, `/privacy-policy`, `/terms-of-service` mở được
- [ ] TikTok redirect URI khớp domain
- [ ] `npm run generate-video` đã chạy trên server

## Gặp lỗi thường gặp

| Lỗi | Cách xử lý |
|-----|------------|
| Vẫn thấy site GitHub Pages cũ | DNS chưa đổi / còn CNAME `github.io` |
| 502 Bad Gateway | PM2 chưa chạy hoặc sai port 3000 |
| OAuth redirect mismatch | Redirect URI trong Portal ≠ `.env` |
| SSL fail | DNS chưa trỏ đúng IP trước khi chạy certbot |
