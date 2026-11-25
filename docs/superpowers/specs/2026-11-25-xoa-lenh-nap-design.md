# Nút xóa lệnh nạp trong Quản trị — thiết kế ngắn

Chủ tịch yêu cầu 25/11/2026 và duyệt đề xuất ("DUYỆT XÓA LỆNH NẠP"): nhiều lệnh nạp là lệnh thử, lệnh đã từ chối
chiếm chỗ trong danh sách → cần nút xóa cho gọn.

## Quyết định
- **Xóa được** (chỉ quản trị): lệnh `pending` (chờ chuyển khoản), `cancelled` (khách đã hủy), `rejected` (đã từ chối).
- **Không xóa được**: lệnh `approved` (đã nhận tiền — đã cộng ngân sách trên trang tính / số dư ví), và lệnh nạp ngân sách
  mà hệ thống đã ghi nhận có tiền về (`sepayId`, `paidAmount`) hoặc đã đụng tới trang tính (`written`).
- Mỗi lệnh xóa được có nút **Xóa** + hộp xác nhận. Lệnh đang chờ: hộp xác nhận nhắc "khách chuyển tiền theo mã này thì
  hệ thống không tự nhận ra; lệnh của khách thật nên Từ chối".
- Nút **"Xóa hết lệnh đã từ chối và đã hủy (N)"** để dọn cả loạt (không gồm lệnh đang chờ).
- Hai nơi: lệnh nạp ngân sách `adTopups` (mục Tài khoản quảng cáo) và lệnh nạp ví `topups` (mục Nạp tiền).
- Sổ giao dịch số dư (`transactions`) giữ nguyên, không bao giờ xóa.
- Xóa là xóa hẳn (không thùng rác); lệnh cũng biến mất khỏi lịch sử phía khách.

## Các cách đã cân nhắc
- **Ẩn / lưu trữ thay vì xóa**: giữ được dấu vết nhưng thêm trạng thái, thêm bộ lọc, và Chủ tịch muốn gọn hẳn. Lệnh chưa
  có tiền thì không có giá trị sổ sách → xóa hẳn là đủ.
- **Chỉ cho xóa lệnh đã từ chối / đã hủy**: an toàn hơn, nhưng lệnh thử phải bấm Từ chối + ghi lý do rồi mới xóa. Chủ tịch
  chọn cho xóa cả lệnh đang chờ.
- **Cho xóa cả lệnh đã duyệt**: loại — làm lệch đối chiếu với trang tính và sổ giao dịch.

## Luật Firestore
- `adTopups`: `allow delete: if isAdmin() && status in [pending, cancelled, rejected] && !written && !sepayId && !paidAmount`.
- `topups`: `allow delete: if isAdmin() && status in [pending, cancelled, rejected]`.
- Khách không bao giờ xóa được (kể cả lệnh của mình).

## Rủi ro đã biết
- Xóa lệnh đang chờ đúng lúc SePay báo tiền về: Apps Script ghi chú "không có lệnh", tiền không được tự cộng → Chủ tịch
  xử lý tay. Hộp xác nhận đã nhắc.
- Apps Script đọc/ghi bằng quyền riêng, không qua luật → không cần sửa Apps Script.

## Kiểm tra
Test luật (quản trị xóa được 3 trạng thái, không xóa được approved / có tiền về / đã ghi; khách và người lạ không xóa được),
test đơn vị cho hàm xét "xóa được", kịch bản đầu-cuối trên emulator ở 390 và 1440, kiểm tra giả lập chặn quảng cáo.
