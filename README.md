# TikTok Auto Publish MVP

MVP Node.js + TypeScript để test tự động publish một video private lên TikTok bằng TikTok Content Posting API.

## Features

- Express OAuth server cho TikTok Login Kit.
- Lưu `access_token` và `refresh_token` local vào `tokens.json`.
- 9router sinh caption qua OpenAI-compatible endpoint `/v1/chat/completions`.
- FFmpeg tạo video vertical `storage/videos/test.mp4` dài 8 giây.
- Publish video với privacy mặc định `SELF_ONLY`.

## Prerequisites

- Node.js 18+
- npm
- FFmpeg
- TikTok Developer App có quyền Content Posting API
- 9router API key
- **ngrok hoặc localtunnel** (TikTok không hỗ trợ localhost redirect)

Cài FFmpeg trên macOS:

```bash
brew install ffmpeg
```

Cài ngrok:

```bash
brew install ngrok
# hoặc tải từ https://ngrok.com/download
```

Hoặc dùng localtunnel (không cần cài):

```bash
npx localtunnel --port 3000
```

## Tạo TikTok Developer App

⚠️ **QUAN TRỌNG: TikTok OAuth KHÔNG hỗ trợ `localhost` hoặc `http://`.**

Bạn phải dùng **public HTTPS redirect URI** qua tunnel (ngrok/localtunnel).

1. Truy cập [TikTok for Developers](https://developers.tiktok.com/).
2. Tạo app mới hoặc chọn app đã có.
3. Bật **Login Kit** trong phần Products/Add-ons.
4. Vào **Login Kit settings** hoặc **Web platform config**.
5. Thêm **Redirect URI** (phải là HTTPS public URL):

```text
https://your-ngrok-url.ngrok-free.app/callback/tiktok
```

6. Request/enable các scope:
   - `user.info.basic` (mặc định, không cần review)
   - `video.publish` (cần app review)
   - `video.upload` (cần app review)

7. Lưu lại **Client Key** và **Client Secret**.

**Lưu ý:**
- Redirect URI phải khớp 100% với giá trị trong `.env`
- TikTok yêu cầu HTTPS, không chấp nhận HTTP hay localhost
- Scope `video.publish` và `video.upload` thường cần app review/approval trước khi production

## Setup

### 1. Cài dependencies

```bash
npm install
cp .env.example .env
```

### 2. Chạy HTTPS tunnel

**Option A: Dùng ngrok**

```bash
ngrok http 3000
```

Bạn sẽ thấy output kiểu:

```text
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

Copy URL `https://abc123.ngrok-free.app`.

**Option B: Dùng localtunnel**

```bash
npx localtunnel --port 3000
```

Output:

```text
your url is: https://your-tunnel-id.loca.lt
```

Copy URL đó.

### 3. Điền `.env`

```env
PORT=3000
BASE_URL=https://abc123.ngrok-free.app
TIKTOK_CLIENT_KEY=awetjwf1heg156ci
TIKTOK_CLIENT_SECRET=zj3i0JJa98H2t0W1HXp1Qbwd1Nftjxwc
TIKTOK_REDIRECT_URI=https://abc123.ngrok-free.app/callback/tiktok
ROUTER9_BASE_URL=https://api.9router.com
ROUTER9_API_KEY=your_9router_api_key
ROUTER9_MODEL=gpt-4o-mini
ROUTER9_PROVIDER=openai
```

⚠️ **`BASE_URL` và `TIKTOK_REDIRECT_URI` phải dùng ngrok/localtunnel URL, KHÔNG phải localhost.**

### 4. Cập nhật TikTok Developer Portal

Vào app TikTok của bạn → Login Kit settings → thêm redirect URI:

```text
https://abc123.ngrok-free.app/callback/tiktok
```

Phải khớp 100% với `.env`.

## Chạy OAuth server

Terminal 1 - chạy ngrok:

```bash
ngrok http 3000
```

Terminal 2 - chạy app:

```bash
npm run dev
```

Mở trình duyệt với **ngrok URL** (không phải localhost):

```text
https://abc123.ngrok-free.app/auth/tiktok
```

Sau khi TikTok callback thành công, token sẽ được lưu vào `tokens.json`.

## Tạo video test

```bash
npm run generate-video
```

Output:

```text
storage/videos/test.mp4
```

## Publish video private lên TikTok

```bash
npm run publish
```

Hoặc truyền topic để 9router sinh caption:

```bash
npm run publish -- "AI Content Agent demo"
```

## Test end-to-end flow

```bash
npm run test-flow
```

Lệnh này sẽ generate video rồi publish.

## Lưu ý quan trọng

- ⚠️ **TikTok OAuth yêu cầu HTTPS public URL, KHÔNG chấp nhận localhost.**
- Phải dùng ngrok/localtunnel hoặc deploy lên server public.
- Redirect URI trong TikTok Developer Portal phải khớp 100% với `.env`.
- MVP này không dùng Selenium, Playwright hoặc browser automation.
- Không hardcode secret. Secrets nằm trong `.env` và token nằm trong `tokens.json`.
- Nên test `SELF_ONLY` / private trước.
- Nếu TikTok API trả lỗi permission/app review, hãy kiểm tra:
  - App đã được approve Content Posting API chưa.
  - Scope `video.publish` và `video.upload` đã được bật chưa.
  - User đã grant đúng scope chưa.
  - Redirect URI trong Developer Portal có khớp 100% với `.env` chưa.
  - App đang sandbox/test mode hay production mode.

## Troubleshooting

### Lỗi `client_key`
- Client key sai hoặc app chưa active Login Kit.
- Redirect URI chưa được thêm vào TikTok app settings.
- **Đang dùng localhost thay vì HTTPS public URL.**

### Lỗi `code_challenge`
- Đã fix bằng PKCE trong code này. Nếu vẫn lỗi, restart server.

### OAuth success nhưng publish lỗi permission
- Scope `video.publish` / `video.upload` cần app review từ TikTok.
- Test với scope `user.info.basic` trước để verify OAuth hoạt động.

## TikTok API note

TikTok Content Posting API có thể thay đổi endpoint/flow theo thời gian. Code đã tách abstraction trong `src/tiktok-publish.ts` và có TODO để verify endpoint với docs hiện hành trước khi production.
