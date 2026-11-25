# Trợ lý AI trên web (khung chat góc phải) — thiết kế ngắn

Chủ tịch yêu cầu 26/11/2026: biểu tượng chat ở góc dưới phải; bấm vào mở khung chat nhỏ; khách hỏi bất cứ điều gì,
AI Claude trả lời; cố định mô hình rẻ nhất. Chủ tịch đã giao quyền tự triển khai ("bắt đầu làm đi").

## Quyết định
- Mô hình: **Claude Haiku 5.5** (`claude-haiku-5-5`) qua Claude API, trả bằng tín dụng API 100 USD/tháng của gói Max
  (Console chưa có thẻ → không thể bị tính vượt tín dụng).
- **Trạm trung gian: Google Apps Script** (dự án riêng "ADS-Nolimit Tro ly AI", KHÔNG gộp vào bot 3). Khóa API nằm trong
  Script Properties `ANTHROPIC_API_KEY`, Chủ tịch tự dán. Web không bao giờ thấy khóa.
- **Kiến thức của trợ lý** sinh lúc build từ chính dữ liệu web (`src/data/pricing.ts`, `faq.ts`, `config/site.ts`) ra
  `/tro-ly-ai/kien-thuc.json`; Apps Script tải về và giữ 6 giờ. Đổi giá trên web là trợ lý biết, không phải sửa Apps Script.
- Chống lạm dụng (trong Apps Script): câu hỏi ≤ 800 ký tự; gửi tối đa 12 tin gần nhất; mỗi phiên trình duyệt 40 câu / 6 giờ;
  toàn web 30 câu / phút và 1.500 câu / ngày; `max_tokens` 700. Trần chi thật: tín dụng API.
- Khung chat ghi rõ "trợ lý AI, có thể sai", nút "Gặp người thật qua Zalo", ghi chú tin nhắn gửi tới Claude (Anthropic)
  và ADS-Nolimit không lưu nội dung. Apps Script không ghi nội dung tin nhắn, chỉ đếm số lượt.
- Hiện trên mọi trang dùng BaseLayout (trang công khai + trang Tài khoản), không có ở Quản trị và trang Không có mạng.
  Địa chỉ trạm để trống → không hiện nút (an toàn khi chưa có khóa).
- Trả lời hiện cả khối (Apps Script không truyền chữ dần được). Có chấm "đang soạn" trong lúc chờ.
- Tên class/id dùng tiền tố `trl-` (không có "ad", "chat-widget"… để trình chặn quảng cáo không ẩn — quy tắc C11).

## Đã cân nhắc
- Một "dự án" trong tài khoản claude.ai: không nối ra web được → loại.
- Cloudflare Worker: chạy chữ dần, nhanh hơn, nhưng phải lập tài khoản mới → để sau nếu cần.
- Gộp vào bot 3: không phải cấp quyền mới, nhưng trộn lưu lượng khách vào bot đang chạy tiền thật → loại.

## Kiểm tra
Test đơn vị (cắt lịch sử, dựng yêu cầu, hiển thị chữ an toàn, link chỉ tới tên miền cho phép); chạy Code.gs trong Node với
bản giả UrlFetchApp/CacheService (giới hạn, lỗi khóa, lỗi API); e2e Playwright với trạm giả ở 1440 và 390 (mở/đóng, gửi,
lưu khi tải lại, lỗi mạng, không đè thanh liên hệ, không lộ HTML); kiểm tra giả lập chặn quảng cáo.
