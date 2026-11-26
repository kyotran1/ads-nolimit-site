# Bot 3 — phần thêm "Thông báo ngân sách thấp" (Messenger + Zalo)

Tệp mới `thong-bao.gs` dán **thêm** vào dự án Apps Script của bot 3 (trang tính "BC ADS - META API (BOT 3)").
Mã nguồn bot 3 hiện hành KHÔNG nằm trong kho này; ở đây chỉ có phần mới và 3 chỗ gọi cần chèn. Hàm dùng lại của bot 3:
`fsCall`, `fsList`, `fsGet`, `fsSet`, `fsPatch`, `traLoi`, `emailNhan`, `thanhVien`, `dongBoWebChinh` (đã đối chiếu với bản lưu v9 `apps-script-bot3-v9-nhieu-nguoi-xem-20261124-2303.gs`).
Mọi tên mới có hậu tố `_` hoặc tiền tố `TB_` nên không đụng tên cũ (bot 3 đã có `vnd()`, `WEB`, `FS`, `TZ`…).

## Trước khi làm: sao lưu (bắt buộc)

1. Mở dự án Apps Script bot 3 → chép toàn bộ mã hiện tại ra một tệp `.gs` lưu cạnh bản cũ trong thư mục sao lưu (đặt tên có ngày giờ, vd `apps-script-bot3-v10-truoc-thong-bao-<ngày>.gs`).
2. Trong Apps Script: **Triển khai → Quản lý các bản triển khai** → ghi lại số phiên bản đang chạy (để quay lại nếu cần).

## Bước 1 — thêm tệp

Apps Script → dấu **+** cạnh "Tệp" → **Tập lệnh** → đặt tên `thong-bao` → dán toàn bộ `thong-bao.gs`.

## Bước 2 — chèn 3 chỗ vào mã cũ (4 dòng)

**(a) `doPost`** — dòng đầu tiên của hàm, TRƯỚC khối `sepay`:

```js
function doPost(e) {
  if (e && e.parameter && e.parameter.meta === '1') return doPostMeta_(e); // <— THÊM: webhook Messenger do Worker chuyển sang
  if (e && e.parameter && e.parameter.sepay === '1') {
    ...
```

`doPostMeta_` tự kiểm khóa chung `GAS_KEY` (sai khóa → bỏ qua, không làm gì). Nhánh `meta=1` không đụng gì tới luồng `khoa`/số liệu cũ.

**(b) `dongBoWebChinh`** — hai chỗ.

Ngay trước dòng `tks.forEach(function (tk) {`:

```js
  let zaloMoi = 0; // <— THÊM: số tin Zalo mới trong lượt đồng bộ này
  tks.forEach(function (tk) {
```

Trong khối `if (low) {`, SAU khối gửi email (ngay trước dòng đóng `}` của `if (low)`, tức là trước `fsPatch('adAccounts/' + tk.id, patch);`):

```js
    if (low) {
      canhBao.push(...);
      const nhan = emailNhan(tk.data);
      if (tk.data.emailAlerts && nhan.length && tk.data.lastAlertDay !== homNay) {
        ...email như cũ...
      }
      zaloMoi += thongBaoThap_(tk, latest, homNay, patch, loiKhac); // <— THÊM: Messenger + hàng đợi Zalo, 1 lần/ngày/TKQC
    }
    fsPatch('adAccounts/' + tk.id, patch);
```

`thongBaoThap_` nằm NGOÀI điều kiện `emailAlerts`: khách tắt email vẫn nhận Messenger/Zalo nếu họ đã bật. Nó dùng cờ riêng `lastNotifyDay` (được ghi vào `patch` rồi `fsPatch` ghi cùng `latest`), nên đúng **1 lần/ngày/TKQC** như email dù đồng bộ chạy mỗi giờ.

Ngay trước dòng `return { ok: true, soTk: soTk, ...` (cuối `dongBoWebChinh`):

```js
  try { emailTongHopZalo_(zaloMoi); } catch (err) { loiKhac.push('Khong gui duoc email tong hop Zalo: ' + err); } // <— THÊM
  return { ok: true, soTk: soTk, canhBao: canhBao, ... };
```

Email tổng hợp ("Có N khách cần nhắc nạp qua Zalo") gửi tới chủ script (`Session.getEffectiveUser()`), kèm link `https://www.ads-nolimit.agency/quan-tri/#nhac-zalo`; N = 0 thì không gửi.

Quyền mới: `thong-bao.gs` chỉ dùng các dịch vụ bot 3 đã có (UrlFetchApp, MailApp, CacheService, PropertiesService, Session). Nếu `appsscript.json` có `oauthScopes` cố định thì kiểm đã có `script.external_request`, `script.send_mail`, `userinfo.email` (cho `Session.getEffectiveUser`); lần chạy đầu Google có thể hỏi cấp quyền lại.

## Bước 3 — Thuộc tính tập lệnh (Project Settings → Script properties)

Chủ tịch tự dán, KHÔNG gửi qua chat, KHÔNG ghi vào mã.

| Tên | Giá trị | Ghi chú |
|---|---|---|
| `PAGE_ID` | ID page ADS-Nolimit | |
| `PAGE_TOKEN` | Page access token không hết hạn | **bí mật**; cần quyền gửi tin của page và `page_utility_messaging` |
| `GAS_KEY` | chuỗi ngẫu nhiên dài | **bí mật**; phải **trùng** biến `GAS_KEY` của Worker (`workers/meta-webhook/README.md`) |
| `THONG_BAO_TEMPLATE` | `thong_bao_ngan_sach_thap` | không đặt thì dùng đúng tên này |
| `THONG_BAO_LANG` | `vi` | không đặt thì `vi` |
| `GRAPH_VERSION` | vd `v23.0` | không bắt buộc; mặc định `v23.0` — kiểm phiên bản Graph API còn hỗ trợ ở trang Meta trước khi bật |

## Bước 4 — tạo mẫu tin tiện ích (chạy tay MỘT lần)

Trong trình soạn Apps Script chọn hàm **`taoMauTinTienIch_`** → Chạy. Hàm gửi `POST /{PAGE_ID}/message_templates` với:

- category `UTILITY`, tên = `THONG_BAO_TEMPLATE`, ngôn ngữ = `THONG_BAO_LANG`;
- thân: "Thông báo tài khoản quảng cáo {{1}}: số dư còn khoảng {{2}}, đủ chạy khoảng {{3}} ngày. Bạn xem báo cáo và nạp thêm ngân sách để quảng cáo không bị gián đoạn." (ví dụ: `K-Aura`, `1.500.000 đ`, `2`);
- nút URL "Xem báo cáo" → `https://www.ads-nolimit.agency/tai-khoan/#bao-cao-ads`.

Xem kết quả ở **Nhật ký thực thi**. Meta duyệt thường trong vài giây; trạng thái về qua webhook `message_template_status_update` (cũng được ghi vào nhật ký). Mẫu bị từ chối → sửa chữ rồi đổi `THONG_BAO_TEMPLATE` sang tên mới và chạy lại.

## Bước 5 — triển khai lại web app

Triển khai → **Quản lý các bản triển khai** → biểu tượng bút chì → Phiên bản: **Phiên bản mới** → Triển khai. (Giữ nguyên địa chỉ `/exec`.) Dán địa chỉ đó vào biến `GAS_URL` của Worker.

## Thử trước khi mở cho khách

1. Chủ tịch vào web → Tài khoản → Thông báo → bấm **Nối Messenger** bằng nick Facebook của chính mình → gửi tin có sẵn → quay lại thấy "Đã nối ✓".
2. Chạy tay `guiMessengerThap_` với dữ liệu thử (hoặc hạ ngưỡng `lowVnd` của một TKQC thử rồi bấm "Đồng bộ ngay" ở /quan-tri/) để nhận tin tiện ích thật.
3. Kiểm Business Manager xem Meta có tính phí tin tiện ích không (rủi ro đã nêu trong thiết kế). Chỉ khi chắc mới báo khách nối Messenger.

## Hành vi cần biết

- **Nối mã:** webhook chỉ nối khi mã `notifyCodes/{mã}` còn trong 7 ngày; nối xong xóa mã; PSID ghi ở `notifyPrivate/{uid}` (trình duyệt bị cấm đọc), web chỉ thấy `notifyLinks/{uid}.messenger.linked`.
- **Bỏ nối:** khách bấm "Bỏ nối" → web ghi `linked:false`; lần gửi kế tiếp `guiMessengerThap_` thấy vậy, không gửi và xóa PSID.
- **Gửi:** mỗi thành viên (chủ + người xem thêm) có `users/{uid}.notify.messenger !== false` và đang nối. Lỗi từng người chỉ ghi `loiKhac`, không làm hỏng đồng bộ. Nếu Messenger lỗi với tất cả mọi người thì chưa đánh dấu `lastNotifyDay` để giờ sau thử lại.
- **Zalo:** `zaloQueue/{actId}_{uid}_{yyyy-MM-dd}`; tin còn "cho" thì cập nhật nội dung; tin đã "da-gui"/"bo-qua" thì giữ nguyên. Không tự gửi Zalo — Chủ tịch bấm gửi ở `/quan-tri/#nhac-zalo`.
- **Số ngày chưa tính được** (chưa có chi tiêu trung bình 7 ngày): Messenger điền "vài" vào chỗ {{3}}; tin Zalo bỏ vế "đủ chạy khoảng … ngày".
- Không gửi quảng cáo/khuyến mãi qua các kênh này, chỉ thông báo tài khoản.

## Kiểm bằng máy (không gọi mạng)

`cd firebase && npm run test:unit` — `firebase/test/unit-thong-bao.test.mjs` nạp `thong-bao.gs` vào Node với bản giả của dịch vụ Google và các hàm bot 3.
Chưa kiểm được bằng máy: gọi Graph API thật (cấu trúc thân gửi mẫu tin dựa trên tài liệu Meta ngày 26/11/2026, cần thử bằng nick của Chủ tịch).
