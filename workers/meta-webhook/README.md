# Trạm Worker "adsnl-meta" — nhận webhook Messenger của Meta

Cloudflare Worker miễn phí, một tệp (`index.js`), không thư viện ngoài, **không chứa bí mật nào**.
Việc của nó: kiểm chữ ký của Meta rồi chuyển nội dung sang Apps Script bot 3 (`doPost?meta=1`).
Apps Script không đọc được header chữ ký và trả 302 cho mọi yêu cầu nên cần trạm này đứng giữa.

```
Meta ──POST /meta (có chữ ký)──> Worker ──kiểm chữ ký──> POST GAS_URL?meta=1 {key, body} ──> Apps Script bot 3
```

## Triển khai bằng giao diện Cloudflare (không cần máy lập trình, không cần wrangler)

Chủ tịch tự làm; em không tạo tài khoản và không giữ khóa nào.

1. Vào <https://dash.cloudflare.com>, đăng ký/đăng nhập tài khoản miễn phí.
2. Menu trái **Workers & Pages** → **Create** → **Create Worker** (hoặc "Start with Hello World!").
3. Đặt tên **`adsnl-meta`** → **Deploy**.
4. Bấm **Edit code**. Xóa hết mã mẫu, dán toàn bộ nội dung tệp `workers/meta-webhook/index.js` vào → **Deploy**.
5. Quay lại trang của Worker → **Settings** → **Variables and Secrets** → **Add**, thêm đủ 4 biến (chọn loại **Secret** cho ba biến đầu):

   | Tên | Giá trị |
   |---|---|
   | `META_APP_SECRET` | App Secret của ứng dụng trong Meta for Developers (Settings → Basic → App secret). **Tự dán, không gửi cho ai.** |
   | `META_VERIFY_TOKEN` | Chuỗi tự đặt, dài khó đoán (ví dụ 24 ký tự ngẫu nhiên). Nhớ để dán sang Meta ở bước sau. |
   | `GAS_KEY` | Chuỗi tự đặt, dài khó đoán. **Phải trùng** Thuộc tính tập lệnh `GAS_KEY` của bot 3 (xem `apps-script/bot3-thong-bao/README.md`). |
   | `GAS_URL` | Địa chỉ ứng dụng web Apps Script của bot 3 (kết thúc bằng `/exec`), loại Text. |

   Bấm **Deploy** lần nữa để biến có hiệu lực.
6. Địa chỉ trạm: `https://adsnl-meta.<tên-tài-khoản>.workers.dev/meta` (xem ở đầu trang Worker).
7. Đăng ký webhook ở Meta for Developers → ứng dụng của page ADS-Nolimit → **Messenger → Webhooks** (hoặc **Webhooks → Page**):
   - **Callback URL**: địa chỉ ở bước 6.
   - **Verify token**: đúng chuỗi `META_VERIFY_TOKEN`.
   - Bấm **Verify and save**. Meta gửi `GET /meta?hub.mode=subscribe&...`; Worker trả `hub.challenge` thì được.
   - Đăng ký (Subscribe) các trường: `messages`, `messaging_postbacks`, `messaging_referrals`, `message_template_status_update`.
   - Gắn page ADS-Nolimit vào ứng dụng và bật Subscribe cho page đó.

## Kiểm nhanh sau khi triển khai

- Mở `https://adsnl-meta.<...>.workers.dev/meta` bằng trình duyệt: phải thấy **Forbidden** (403) — đúng, vì thiếu token.
- Mở `https://adsnl-meta.<...>.workers.dev/` : **Not found** (404).
- Bấm **Verify and save** ở Meta: thành công = Worker đã đọc đúng `META_VERIFY_TOKEN`.
- Trong Cloudflare, Worker → **Logs** (Observability) xem yêu cầu đến. Nhắn thử vào page: Worker trả 200, Apps Script ghi vào nhật ký thực thi.

## Hành vi

| Yêu cầu | Kết quả |
|---|---|
| `GET /meta` đúng `hub.mode=subscribe` và `hub.verify_token` | 200, nội dung = `hub.challenge` (text/plain) |
| `GET /meta` sai mode/token | 403 |
| `POST /meta` chữ ký `X-Hub-Signature-256` sai, thiếu, sai định dạng | 401, không chuyển tiếp |
| `POST /meta` chữ ký đúng | 200 `EVENT_RECEIVED` ngay; chuyển tiếp nền sang `GAS_URL?meta=1` với thân `{"key": GAS_KEY, "body": <JSON gốc của Meta>}` |
| `POST /meta` chữ ký đúng nhưng thân không phải JSON | 400 |
| Thân > 1 MB | 413 |
| Thiếu một trong `META_APP_SECRET`, `GAS_URL`, `GAS_KEY` | 503 |
| Đường khác `/meta` | 404; phương thức khác GET/POST trên `/meta`: 405 |

Chữ ký = `sha256=` + HMAC-SHA256(thân thô, `META_APP_SECRET`), so sánh bằng `crypto.subtle.verify` (thời gian hằng).

## Kiểm bằng máy (không cần mạng, không cần cài gói)

```
node workers/meta-webhook/test.mjs
```

Hoặc trong `cd firebase && npm run test:unit` (đã gắn sẵn qua `firebase/test/unit-meta-webhook.test.mjs`).

## Giới hạn / lưu ý

- Gói miễn phí của Cloudflare Workers: 100.000 yêu cầu/ngày, thừa sức.
- Muốn đổi khóa: đổi `GAS_KEY` ở **cả hai nơi** (Worker và Thuộc tính tập lệnh của bot 3), rồi Deploy lại.
- Đừng bao giờ dán App Secret / Page token vào chat hay vào kho mã.
