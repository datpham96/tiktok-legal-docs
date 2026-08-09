# Kịch bản quay video demo — TikTok App Review

Mục tiêu: chứng minh app tuân thủ **Required UX Implementation** trong
https://developers.tiktok.com/doc/content-sharing-guidelines

- Thời lượng: **3–4 phút**
- Ngôn ngữ thuyết minh: **tiếng Anh** (reviewer TikTok đọc tiếng Anh)
- Không cần lồng tiếng — có thể dùng phụ đề/caption cho từng cảnh

---

## A. Chuẩn bị trước khi bấm ghi

**Tài khoản TikTok**
- [ ] Giữ **Private account** đang bật (bắt buộc, vì app chưa audit)
- [ ] Đăng nhập sẵn TikTok trên trình duyệt để bước OAuth nhanh
- [ ] Chuẩn bị điện thoại có app TikTok để quay cảnh xác minh cuối

**Trình duyệt**
- [ ] Dùng cửa sổ **ẩn danh** (sạch, không lộ tab/bookmark cá nhân)
- [ ] Zoom 100%, cửa sổ tối đa, độ phân giải ghi **1920×1080**
- [ ] **Tuyệt đối không mở DevTools / Console / Network** trong lúc quay
- [ ] Tắt thông báo hệ thống (macOS: bật Do Not Disturb)

**Reset app về trạng thái chưa kết nối** — mở https://autopublisher.click/studio
rồi bấm **Disconnect** ở góc phải trên. Phải thấy màn hình
"Connect your account to continue" thì mới bắt đầu quay.

---

## B. Kịch bản từng cảnh

### Cảnh 1 — Giới thiệu sản phẩm (0:00 – 0:20)

**Thao tác:** mở https://autopublisher.click/ , cuộn chậm qua Features → How it works.

**Caption/lời thoại:**
> "AutoPublisher is a creator tool that helps users generate short-form videos
> and publish them to their own TikTok account using the official Content Posting API."

**Lưu ý:** cuộn chậm, dừng 2 giây ở khối "You approve every post / You choose the audience / Disconnect anytime".

---

### Cảnh 2 — Trang pháp lý (0:20 – 0:35)

**Thao tác:** click **Privacy** trên menu → cuộn tới mục 2 (danh sách scope) và mục 6
(Data Retention and Deletion) → quay lại → click **Terms**.

**Caption:**
> "Our Privacy Policy lists exactly which TikTok scopes we request and how users delete their data.
> Terms of Service links to TikTok's Music Usage Confirmation and Branded Content Policy."

---

### Cảnh 3 — Đăng nhập bằng Login Kit (0:35 – 1:00)

**Thao tác:** vào **Open Studio** → thấy màn hình gate → bấm **Connect with Login Kit**
→ màn hình xác thực TikTok → chấp thuận → quay về studio.

**Caption:**
> "Users connect their own TikTok account through Login Kit. We request only
> user.info.basic, video.upload and video.publish."

**Quan trọng:** dừng 2 giây ở màn hình cấp quyền của TikTok để reviewer thấy rõ danh sách scope.

---

### Cảnh 4 — Creator info (1:00 – 1:15) ⭐ bắt buộc

**Thao tác:** trỏ chuột vào thẻ creator ở đầu trang, dừng 3 giây.

**Caption:**
> "After connecting, the app shows the creator's avatar, display name and username,
> so the user always knows which account will receive the post.
> This information is retrieved from the creator info endpoint every time this page loads."

**Phải thấy trên hình:** avatar + "AI Creator Lab" + "@autotok_ai" + nhãn **Connected**
+ dòng "This video will be posted to the TikTok account above."

---

### Cảnh 5 — Xem trước video (1:15 – 1:35) ⭐ bắt buộc

**Thao tác:** bấm play video preview vài giây → trỏ vào dòng File / Duration / Size
→ trỏ vào nút **Replace video** (không cần bấm).

**Caption:**
> "The user previews the exact video that will be posted, with its file name, duration
> and size, and can replace it before publishing. We never add watermarks or logos."

---

### Cảnh 6 — Caption (1:35 – 1:50) ⭐ bắt buộc

**Thao tác:** click vào ô caption, **xoá bớt vài chữ rồi gõ lại** để thấy bộ đếm thay đổi.

**Caption:**
> "The caption is fully editable and shows TikTok's 2200-character limit."

---

### Cảnh 7 — Privacy (1:50 – 2:15) ⭐⭐ quan trọng nhất

**Thao tác:**
1. Trỏ vào ô privacy — cho thấy nó đang là **"Select who can view this video"**, chưa chọn gì
2. Trỏ vào nút Publish đang **bị mờ**, và dòng hint bên dưới
3. Mở dropdown ra — dừng 2 giây cho thấy danh sách
4. Chọn **Only me**
5. Cho thấy nút Publish **sáng lên**

**Caption:**
> "There is no default privacy value — the user must select it manually.
> The options come from the creator info endpoint, so they match what this account allows.
> Until the app passes TikTok review, only 'Only me' is accepted, and that is stated in the UI.
> The publish button stays disabled until a privacy level is chosen."

**Đây là cảnh reviewer soi kỹ nhất — quay chậm, đừng vội.**

---

### Cảnh 8 — Interaction settings (2:15 – 2:35) ⭐ bắt buộc

**Thao tác:** trỏ vào 3 switch Comment / Duet / Stitch → dừng ở **Duet và Stitch đang xám**
→ trỏ vào dòng ghi chú bên dưới → bật **Comment** lên.

**Caption:**
> "Comment, Duet and Stitch are all off by default and the user turns them on manually.
> Duet and Stitch are greyed out here because this creator has disabled them in their
> TikTok settings — the app reads that from the creator info endpoint and respects it."

**Cảnh này rất mạnh** vì chứng minh app thực sự đọc và tôn trọng `creator_info`.

---

### Cảnh 9 — Commercial content (2:35 – 3:05) ⭐ bắt buộc

**Thao tác:**
1. Bật **Disclose video content** → hiện 2 lựa chọn
2. **Không chọn gì** — dừng 2 giây ở cảnh báo màu vàng + nút Publish bị mờ lại
3. Tick **Your brand** → dừng ở dòng "Your video will be labeled as 'Promotional content'"
4. Bỏ tick, tick **Branded content** → dòng đổi thành "'Paid partnership'"
   và **dòng cam kết bên dưới xuất hiện thêm link Branded Content Policy**
5. Bỏ tick cả hai, **tắt** Disclose video content

**Caption:**
> "If the user discloses commercial content, they must indicate whether it promotes
> their own brand, a third party, or both — otherwise publishing is blocked.
> The label prompt and the declaration text change accordingly."

**Lưu ý:** vì đang chọn "Only me", nếu tick Branded content bạn sẽ thấy nó bị khoá
(branded content không được để riêng tư) — **hãy quay cả cảnh này**, nó chứng minh
đúng ràng buộc TikTok yêu cầu. Có thể thêm caption:
> "Branded content cannot be private, so the option is locked while 'Only me' is selected."

---

### Cảnh 10 — AIGC + cam kết nhạc (3:05 – 3:20)

**Thao tác:** bật **AI-generated content** → trỏ vào dòng cam kết ngay trên nút Publish
→ trỏ (không click) vào link **Music Usage Confirmation**.

**Caption:**
> "Because our videos are AI-assisted, the user can label the post as AI-generated content.
> Before publishing, we show TikTok's Music Usage Confirmation with a link to the policy."

---

### Cảnh 11 — Publish (3:20 – 3:45) ⭐ bắt buộc

**Thao tác:** bấm **Publish to TikTok** → quay liên tục không cắt:
Uploading… → Publishing… → Processing… → Done, rồi tới màn hình kết quả.

**Caption:**
> "Nothing is sent to TikTok until the user explicitly presses publish.
> The button is disabled while uploading and the real status is polled from TikTok."

**Phải thấy:** ✔ Published + Publish ID + Publish time + Privacy + Caption
+ dòng "It may take a few moments before the video appears on your TikTok profile."

---

### Cảnh 12 — Xác minh trên TikTok (3:45 – 4:05)

**Thao tác:** quay màn hình điện thoại — mở app TikTok → profile → tab video riêng tư
→ mở video vừa đăng, cho thấy caption khớp.

**Caption:**
> "The video appears on the creator's profile with the caption and privacy setting they chose."

---

### Cảnh 13 — Ngắt kết nối (4:05 – 4:20)

**Thao tác:** quay lại studio → bấm **Disconnect** → cho thấy app trở về màn hình gate.

**Caption:**
> "Users can disconnect at any time, which immediately deletes the stored access tokens."

---

## C. Đối chiếu cảnh ↔ yêu cầu của TikTok

| Yêu cầu trong guideline | Cảnh |
|---|---|
| Creator info hiển thị, lấy mới mỗi lần render | 4 |
| Xem trước nội dung sắp đăng | 5 |
| Cho sửa caption/title | 6 |
| Privacy không có giá trị mặc định, user tự chọn | 7 |
| Options khớp `privacy_level_options` | 7 |
| Interaction mặc định tắt, user tự bật | 8 |
| Grey-out khi creator đã tắt tính năng | 8 |
| Commercial toggle mặc định tắt | 9 |
| Bắt buộc chọn ≥1 khi bật, nếu không thì chặn publish | 9 |
| Nhãn "Promotional content" / "Paid partnership" | 9 |
| Branded content không được để riêng tư | 9 |
| Cam kết Music Usage Confirmation (+ Branded Content Policy) | 9, 10 |
| Chỉ gửi nội dung sau khi user đồng ý rõ ràng | 11 |
| Hiển thị tiến trình, poll trạng thái | 11 |
| Báo nội dung cần vài phút mới hiện trên profile | 11 |
| Không gắn watermark | 5 |

---

## D. Tuyệt đối tránh

- ❌ Mở DevTools, Console, Network tab
- ❌ Hiện access token, client secret, file .env, terminal
- ❌ Hiện JSON hay URL endpoint của API
- ❌ Tua nhanh qua màn hình privacy hoặc commercial content
- ❌ Cắt ghép giữa lúc publish — để nguyên một mạch cho thấy tiến trình thật
- ❌ Quay khi tài khoản TikTok đang public (sẽ lỗi 403 vì app chưa audit)

---

## E. Checklist trước khi nộp

- [ ] Video 1080p, có tiếng hoặc phụ đề tiếng Anh
- [ ] Thấy rõ tên miền `autopublisher.click` trên thanh địa chỉ
- [ ] Có cảnh màn hình cấp quyền của TikTok với danh sách scope
- [ ] Có cảnh video xuất hiện thật trên app TikTok
- [ ] Không có khung hình nào lộ thông tin kỹ thuật
- [ ] Upload lên Google Drive/YouTube unlisted và dán link vào form submit
