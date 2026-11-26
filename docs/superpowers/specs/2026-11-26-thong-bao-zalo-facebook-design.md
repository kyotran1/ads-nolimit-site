# Thiết kế: Thông báo ngân sách thấp qua Facebook (Messenger) và Zalo — 26/11/2026

Chủ tịch chốt 26/11 10:00: "FB TIN TIỆN ÍCH, ZALO CẢ HAI".

## Mục đích
Khi TKQC của khách sắp hết ngân sách (cùng điều kiện cảnh báo hiện có: số dư < ngưỡng VNĐ hoặc < N ngày × chi TB 7 ngày), ngoài email và banner trên app, khách còn nhận:
1. **Tin nhắn Messenger từ page ADS-Nolimit** gửi tới nick Facebook của khách (tự động).
2. **Tin Zalo**:
   - Cách A (làm ngay): bán tự động bằng nick Zalo của Chủ tịch. Hệ thống soạn sẵn, Chủ tịch bấm gửi.
   - Cách B (làm khi có Zalo OA): Zalo OA gửi tự động (ZNS).

Không gửi quảng cáo/khuyến mãi qua các kênh này, chỉ thông báo tài khoản.

## Sự thật đã kiểm (26/11)
- Meta đã bỏ thẻ ACCOUNT_UPDATE (2026). Cách đúng là **Utility Messages**: mẫu tin loại UTILITY do page tạo (`POST /{page-id}/message_templates`), Meta duyệt (thường vài giây). Gửi bằng `POST /{page-id}/messages` với `messaging_type: UTILITY`, `recipient.id` = PSID. Có ở Việt Nam. Cần quyền `page_utility_messaging` và một webhook đăng ký `message_template_status_update`.
- Webhook của Meta không chạy được trên Apps Script, vì Apps Script trả chuyển hướng 302 và không đọc được header chữ ký. → Cần một trạm nhỏ trung gian.
- Zalo không có cách chính thức cho nick cá nhân gửi tin tự động. Tự động hóa nick cá nhân = vi phạm điều khoản, dễ bị khóa nick 0888 88 2823 → cách A không tự gửi.

## Kiến trúc
```
Khách (web) ──bấm "Nhận qua Messenger"──> m.me/adsnolimit.agency2610?ref=<mã nối>
                                             │ (khách gửi 1 tin có sẵn)
Meta webhook ──> Trạm Cloudflare Worker "adsnl-meta" (miễn phí)
                   - GET: trả hub.challenge (verify token)
                   - POST: kiểm X-Hub-Signature-256 bằng App Secret (Chủ tịch tự dán vào Worker)
                   - chuyển tiếp nội dung đã kiểm sang Apps Script bot 3 doPost?meta=1 kèm khóa chung
Apps Script bot 3 ──> Firestore: notifyLinks/{uid}.messenger = {psid, linkedAt}
dongBoWebChinh (đang chạy mỗi giờ) khi TKQC chuyển sang "thấp" (1 lần/ngày/TKQC như email):
   - email (đang có)
   - Messenger: gửi mẫu tin tiện ích cho mọi thành viên (chủ + người xem thêm) đã nối Messenger và bật nhận
   - Zalo A: ghi zaloQueue/{id} (khách, số Zalo, nội dung soạn sẵn); thêm 1 email tổng hợp cho Chủ tịch
```

## Dữ liệu (Firestore)
- `users/{uid}.notify` (khách tự ghi): `{ email: bool, messenger: bool, zalo: bool, zaloPhone: string (định dạng VN 10 số) }`. Mặc định email bật, còn lại tắt cho đến khi khách bật.
- `notifyCodes/{code}` (khách tạo, chỉ Apps Script đọc/xóa): `{uid, createdAt}`. Mã 10 ký tự ngẫu nhiên, hết hạn 7 ngày.
- `notifyLinks/{uid}` (chỉ Apps Script ghi, khách chỉ đọc của mình): `{messenger: {linked: true, linkedAt, name?}}`. **Không** lộ PSID cho trình duyệt, nên PSID nằm ở trường riêng chỉ server đọc (`notifyPrivate/{uid}`, luật cấm mọi trình duyệt).
- `zaloQueue/{id}` (Apps Script ghi, quản trị đọc/ghi trạng thái): `{uid, actId, name, phone, text, createdAt, status: 'cho'|'da-gui'|'bo-qua', doneAt}`.

## Giao diện
- **Khách — Tài khoản → mục mới "Thông báo"** (vi + en):
  - Công tắc Email.
  - Messenger: nút "Nối Messenger" (mở m.me kèm mã) → trạng thái "Đã nối ✓ · Bỏ nối".
  - Zalo: ô số Zalo + công tắc. Ghi chú: "Tin Zalo do nhân viên ADS-Nolimit gửi từ số 0888 88 2823".
  - Một câu đồng ý nhận thông báo tài khoản.
- **Quản trị → "Nhắc qua Zalo"**: danh sách chờ, mỗi dòng có nút **"Chép tin & mở Zalo"** (chép nội dung vào bộ nhớ tạm rồi mở `https://zalo.me/<số>`) và nút "Đã gửi" / "Bỏ qua". Tối ưu cho điện thoại.
- **Email tổng hợp cho Chủ tịch**: "Có N khách cần nhắc nạp qua Zalo", kèm link tới mục trên.

## Mẫu tin (UTILITY, tiếng Việt; Meta duyệt)
"Thông báo tài khoản quảng cáo {{1}}: số dư còn khoảng {{2}}, đủ chạy khoảng {{3}} ngày. Bạn xem báo cáo và nạp thêm ngân sách để quảng cáo không bị gián đoạn." + nút URL "Xem báo cáo" → https://www.ads-nolimit.agency/tai-khoan/#bao-cao-ads.
Zalo A dùng cùng nội dung, kèm link.

## Việc Chủ tịch cần tự làm (không giao được)
1. Tạo tài khoản Cloudflare miễn phí (email + xác minh), hoặc cho phép em tạo bằng email công ty. Anh tự dán App Secret vào Worker.
2. Tạo mã truy cập trang (Page access token, không hết hạn) cho page ADS-Nolimit trong Meta, rồi tự dán vào Thuộc tính tập lệnh của bot 3.
3. Nếu Meta yêu cầu xét duyệt quyền `page_utility_messaging`: em chuẩn bị hồ sơ + video quay màn hình, anh bấm gửi.
4. Cách B: lập Zalo OA, xác thực doanh nghiệp, đăng ký ZNS (có phí mỗi tin).

## Phạm vi giai đoạn 1 (làm ngay)
- Web: mục Thông báo (khách) + Nhắc qua Zalo (quản trị) + luật Firestore + test.
- Apps Script bot 3: nhận chuyển tiếp từ Worker, nối mã, gửi Messenger, ghi zaloQueue, email tổng hợp. Sao lưu bản cũ trước.
- Worker: mã nguồn trong kho web `workers/meta-webhook/` (không chứa bí mật).
- Bật Messenger cho khách chỉ sau khi Chủ tịch thử được với nick của chính mình.

## Ngoài phạm vi
Zalo OA/ZNS (giai đoạn 2), thông báo khác ngoài ngân sách thấp, gửi qua SMS.

## Rủi ro
- Meta có thể tính phí tin tiện ích. Kiểm trong Business Manager trước khi bật cho khách.
- Meta có thể yêu cầu xét duyệt ứng dụng, mất vài ngày.
- Khách phải chủ động nối Messenger một lần; khách không nối thì vẫn có email + Zalo.
