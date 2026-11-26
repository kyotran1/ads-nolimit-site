# Thông báo ngân sách thấp qua Messenger + Zalo — kế hoạch giai đoạn 1 (26/11/2026)

Thiết kế (đọc trước, BẮT BUỘC): docs/superpowers/specs/2026-11-26-thong-bao-zalo-facebook-design.md. Chủ tịch duyệt 10:05 "DUYỆT THIẾT KẾ THÔNG BÁO".
Ràng buộc chung: như mục "Ràng buộc chung" trong docs/superpowers/plans/2026-11-26-nut-tai-app.md:
- không tên ad/ads/banner;
- sáng + tối đều đọc rõ;
- nút ≥ 44px;
- không chạy astro check;
- không tạo tài khoản thật, không đọc .env, không đẩy web, không cài gói.

## Tên dùng chung (ghi nguyên văn, không đổi)
- Mục tài khoản mới: `SectionId` = `'notify'`, neo vi `thong-bao`, en `notifications`, icon có sẵn phù hợp (vd `bell` nếu có, không thì thêm vào icon-paths), nhóm menu "Tài khoản" sau `ads`.
- Firestore:
  - `users/{uid}.notify = { email: bool, messenger: bool, zalo: bool, zaloPhone: string }`. zaloPhone rỗng hoặc khớp `^0[35789][0-9]{8}$`. Khách tự ghi, chỉ được đổi trường `notify` (cùng luật cập nhật hồ sơ hiện có).
  - `notifyCodes/{code}`: `{ uid, createdAt }`.
    - Khách tạo được khi uid == auth.uid, code khớp `^[A-Z0-9]{10}$`, createdAt == request.time.
    - Khách không đọc được, không ai sửa.
    - Khách xóa được mã của mình.
  - `notifyLinks/{uid}`: `{ messenger: { linked: bool, linkedAt: timestamp, name: string? } }`.
    - Khách chỉ đọc doc của mình.
    - Khách được ghi duy nhất `{ messenger: { linked: false } }` (bỏ nối) lên doc của mình.
    - Trình duyệt không được ghi gì khác.
  - `notifyPrivate/{uid}`: chặn hoàn toàn trình duyệt (`allow read, write: if false`).
  - `zaloQueue/{id}`: `{ uid, actId, name, phone, text, createdAt, status: 'cho'|'da-gui'|'bo-qua', doneAt? }`. Quản trị đọc, và chỉ cập nhật `status` + `doneAt`. Không ai khác đọc/ghi.
- Mã nối Messenger: link `https://m.me/adsnolimit.agency2610?ref=NOI-<code>` và tin mẫu khách gửi "Nối thông báo NOI-<code>". Webhook dùng cả `ref` lẫn chữ trong tin để tìm code.
- Trạm Worker: thư mục `workers/meta-webhook/` (Cloudflare Worker, JS module). Biến môi trường (Chủ tịch dán, KHÔNG có trong mã): `META_APP_SECRET`, `META_VERIFY_TOKEN`, `GAS_URL`, `GAS_KEY`. Đường dẫn `/meta`.

## Việc của nhân viên

1. **Luật Firestore** (`firestore.rules`): thêm đúng như trên, không đụng luật khác. Thêm test luật mới `firebase/test/notify.test.mjs` (≥ 25 ca: được/không được cho khách, khách khác, quản trị, chưa đăng nhập).
2. **Khách — mục "Thông báo"**: `src/components/account/Notify.astro` + `src/lib/account/notify.ts` (vi + en):
   - Công tắc Email (mặc định bật nếu chưa có notify).
   - Khối Messenger:
     - Chưa nối: nút "Nối Messenger". Bấm thì tạo notifyCodes rồi mở link m.me; hiện hướng dẫn "Gửi tin có sẵn trong Messenger, rồi quay lại đây".
     - Đang chờ: nghe `onSnapshot(notifyLinks/{uid})`; nút "Tôi đã gửi" kiểm lại.
     - Đã nối: "Đã nối ✓" + công tắc nhận + nút "Bỏ nối".
   - Khối Zalo:
     - Ô số Zalo (gợi ý sẵn số điện thoại trong hồ sơ nếu có) + công tắc.
     - Ghi chú: "Tin Zalo do nhân viên ADS-Nolimit gửi từ số 0888 88 2823, chỉ để báo ngân sách thấp."
   - Câu đồng ý nhận thông báo tài khoản (không quảng cáo).
   - Lỗi mạng hoặc luật: thông báo nhẹ, không vỡ trang.
   - Chèn vào AccountPage.astro / routes.ts / main.ts **tối thiểu** (vài dòng). Không sửa logic khác trong các tệp đó vì nhánh đăng nhập Facebook cũng đang sửa chúng.
3. **Quản trị — mục "Nhắc qua Zalo"**: `src/lib/admin/zalo-queue.ts` + khối HTML trong AdminPage (vi đủ, en tối thiểu).
   - Danh sách `zaloQueue` status 'cho' mới nhất trước: tên khách, TKQC, số Zalo, nội dung.
   - Nút **"Chép tin & mở Zalo"** (≥ 48px): `navigator.clipboard.writeText(text)`, có cách dự phòng như `copyHref` trong src/lib/pwa/install-sheet.ts. Mở `https://zalo.me/<phone>` trong thẻ mới; báo "Đã chép tin — dán vào Zalo rồi Gửi".
   - Nút "Đã gửi" / "Bỏ qua" cập nhật status + doneAt.
   - Có thể lọc "Đã xử lý" ở tab phụ. Tối ưu điện thoại 390px.
4. **Worker** `workers/meta-webhook/index.js` (không thư viện ngoài, dùng Web Crypto) + `workers/meta-webhook/README.md` (cách triển khai bằng giao diện Cloudflare, không cần wrangler).
   - GET `/meta`: hub.mode=subscribe và hub.verify_token == META_VERIFY_TOKEN thì trả hub.challenge (text/plain, 200); sai thì 403.
   - POST `/meta`:
     - Đọc raw body, kiểm `X-Hub-Signature-256` = `sha256=` + HMAC-SHA256(raw, META_APP_SECRET), so sánh thời gian hằng. Sai thì 401.
     - Đúng: `fetch(GAS_URL + '?meta=1', {method:'POST', body: JSON.stringify({key: GAS_KEY, body: <json gốc>}), redirect:'follow'})`. Dùng `ctx.waitUntil` rồi trả 200 "EVENT_RECEIVED" ngay (Meta cần trả nhanh).
   - Đường khác: 404.
   - Test bằng node (không cài gói): `workers/meta-webhook/test.mjs` chạy handler với Request/Response của Node 18+ — đúng/sai chữ ký, verify, forward bị gọi (giả fetch).
5. **Apps Script — phần thêm cho bot 3** (KHÔNG có mã nguồn bot 3 trong kho; chỉ viết các hàm mới vào `apps-script/bot3-thong-bao/thong-bao.gs` + `README.md` mô tả chỗ gọi). Phải dùng lại tên hàm có sẵn của bot 3: `fsCall`, `fsList`, `fsSet`, `fsPatch`, `traLoi`, `emailNhan`, `thanhVien`. Hàm mới:
   - `xuLyMeta_(payload)`:
     - Gọi từ doPost khi `e.parameter.meta === '1'` và `payload.key === Thuộc tính GAS_KEY`.
     - Duyệt entry[].messaging[]: lấy code từ `referral.ref` / `postback.referral.ref` / `message.text` (regex `NOI-([A-Z0-9]{10})`).
     - Tìm notifyCodes/{code} còn hạn 7 ngày → ghi `notifyPrivate/{uid}` = {psid, linkedAt}, `notifyLinks/{uid}.messenger` = {linked:true, linkedAt, name?}, xóa code.
     - Gửi tin chào: "Đã nối thông báo tài khoản ADS-Nolimit ✓" (tin trả lời trong 24h, messaging_type RESPONSE).
   - `guiMessengerThap_(tk, l, uids)`:
     - Với mỗi uid có `users/{uid}.notify.messenger !== false` và có notifyPrivate.psid: POST Graph `/{PAGE_ID}/messages`, `messaging_type: 'UTILITY'`, template `THONG_BAO_TEMPLATE` (tên trong Thuộc tính), ngôn ngữ trong Thuộc tính `THONG_BAO_LANG` (mặc định 'vi').
     - Tham số: tên TKQC, số dư VNĐ (định dạng như guiEmail), số ngày còn (làm tròn xuống, tối thiểu 0).
     - Lỗi thì ghi log, không làm hỏng đồng bộ.
   - `ghiZaloQueue_(tk, l, uids)`: mỗi uid có notify.zalo === true và zaloPhone hợp lệ → tạo zaloQueue (id = actId_uid_ngày, ghi đè trong ngày). Nội dung: "ADS-Nolimit thông báo: TKQC {tên} còn khoảng {số dư}, đủ chạy khoảng {n} ngày. Bạn xem báo cáo và nạp thêm tại www.ads-nolimit.agency/tai-khoan/#bao-cao-ads".
   - `emailTongHopZalo_()`: nếu hôm nay có zaloQueue mới → 1 email tới chủ (Session.getEffectiveUser().getEmail()), link https://www.ads-nolimit.agency/quan-tri/#nhac-zalo.
   - README: đoạn chèn vào chỗ gửi email cảnh báo trong `dongBoWebChinh` (cùng điều kiện `lastAlertDay !== homNay`), danh sách Thuộc tính tập lệnh cần (`PAGE_ID`, `PAGE_TOKEN` (Chủ tịch dán), `GAS_KEY`, `THONG_BAO_TEMPLATE`, `THONG_BAO_LANG`). Thêm hàm `taoMauTinTienIch_()` chạy tay 1 lần để tạo mẫu UTILITY qua Graph API: body như thiết kế, nút URL "Xem báo cáo".
   - Test logic thuần (tách hàm trích code, định dạng tin) trong `firebase/test/unit-thong-bao.test.mjs` bằng cách nạp tệp .gs vào vm.
6. **Kiểm thử e2e** `e2e/thong-bao/`, giả lập như e2e cũ (harness FakeAuth, emulator):
   - Mục Thông báo hiện ở 390/1440 sáng + tối.
   - Bật/tắt lưu đúng; số Zalo sai thì báo lỗi.
   - Bấm "Nối Messenger" tạo code + mở link đúng định dạng (chặn window.open).
   - Giả Apps Script ghi notifyLinks → giao diện chuyển "Đã nối"; bỏ nối chạy.
   - Quản trị thấy zaloQueue, "Chép tin & mở Zalo" chép đúng chữ và mở zalo.me/<số>, "Đã gửi" cập nhật.
   - Khách thường không đọc được zaloQueue.

## Cổng và nhánh
- Nhánh `thong-bao` từ `v41-ads-report` (2f70603 + spec/plan), worktree `/home/claude/wt-thong-bao`.
- Cổng web 4400–4409, emulator Firestore 8101 (cấu hình riêng `e2e/thong-bao/firebase.8101.json`). Luật test cũ gắn cứng 8080 thì chạy bằng bản sao tạm đổi cổng, xóa sau.

## Tệp cấm đụng
`src/lib/auth/**`, `src/lib/account/security.ts`, `src/lib/account/email-gap.ts`, `src/lib/tro-ly/**`, `apps-script/tro-ly-ai/**`, `public/sw.js`, `package*.json`, luật Firestore ngoài phần thêm mới.

## Kiểm tra trên bản gộp (Tổng giám đốc)
Toàn bộ `firebase npm test`, e2e/thong-bao, e2e/nut-dang-nhap, e2e/tai-app, e2e/dang-nhap-fb, tương phản, chặn quảng cáo.

## Review Focus
1. Khách A nối mã của khách B (đoán mã) → mã 10 ký tự ngẫu nhiên, hết hạn 7 ngày, chỉ Apps Script đọc.
2. PSID không bao giờ tới trình duyệt.
3. Một khách bị nhắc nhiều lần trong ngày → giữ đúng 1 lần/ngày/TKQC như email.
4. Webhook giả (không chữ ký) → Worker 401, Apps Script bỏ qua khi sai GAS_KEY.
5. Số Zalo nhập có khoảng trắng hoặc +84 → chuẩn hóa về 0xxxxxxxxx trước khi lưu.
