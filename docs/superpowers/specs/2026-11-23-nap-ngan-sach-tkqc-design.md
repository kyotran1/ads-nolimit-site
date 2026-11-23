# Nạp thêm ngân sách TKQC ngay trong báo cáo quảng cáo — thiết kế ngắn

Chủ duyệt: DUYỆT CÁCH A (23/11/2026 22:41).

## Mục đích
Khách đang xem báo cáo quảng cáo bấm "Nạp thêm ngân sách" → khung nạp hiện ngay tại chỗ (không chuyển mục),
chọn mức gợi ý hoặc tự gõ số tiền → "Tạo lệnh nạp" → mã VietQR + nút "Tải ảnh QR".
Chủ bấm "Đã nhận tiền" trong Quản trị → trang tính bot 3 tự ghi số tiền đúng ngày → số dư báo cáo trên web tự cập nhật.
Chủ tự sửa mức gợi ý, tối thiểu, tối đa, % phí trong Quản trị.

## Không làm
- Không cộng vào ví web; không đụng trang tính gốc "TOP UP NGÂN SÁCH ADS - BC TỔNG"; không tự duyệt thay chủ.

## Cách làm đã chọn (A)
Web chỉ ghi Firestore. Apps Script bot 3 (quyền Google của chủ) đọc lệnh đã duyệt chưa ghi, cộng vào cột C đúng ngày,
đánh dấu đã ghi, đồng bộ lên web. Quản trị bấm duyệt xong gọi `?dongbo=1`; nếu lỡ, lịch mỗi giờ ghi bù.
Loại bỏ: B (khóa Apps Script lộ trong code trình duyệt), C (phụ thuộc máy bật, chậm).

## Dữ liệu
- `settings/adTopup` { presets: int[] (1–8 mức, số tiền chuyển gồm phí), min, max, feePercent (0–50), updatedAt, updatedBy }.
  Khách đã đăng nhập đọc; quản trị ghi. Mặc định khi chưa có: 11.000.000 / 22.000.000, tối thiểu 11.000.000, tối đa 110.000.000, phí 10%.
- `adTopups/{code}` code = `ADSB` + 6 ký tự (cùng bảng chữ của lệnh nạp ví) = nội dung chuyển khoản.
  { uid, email, name?, actId, accountLabel, amount (tiền chuyển, gồm phí), budget (ngân sách vào TKQC = round(amount·100/(100+fee))),
    feePercent, day (yyyy-mm-dd giờ VN lúc tạo), code, status, lang, createdAt }
  - Khách tạo: đúng uid, TKQC của mình và đang hiện; amount nguyên, chẵn nghìn, trong [min,max] của settings; feePercent = settings; budget khớp công thức (±1).
  - Khách hủy lệnh chờ. Quản trị duyệt (pending|cancelled → approved, được sửa `day`) hoặc từ chối (kèm lý do).
  - Apps Script ghi `written`, `writtenAt`, `sheetTab`, `sheetRow` (REST, không qua rules). Trình duyệt không ghi được các trường này.

## Ghi trang tính (Apps Script bản 5)
- `ghiNapDaDuyet()` chạy đầu `dongBoWeb()`: lệnh approved chưa written → tìm tab theo tabPattern + tháng của `day`
  (chưa có thì taoThangMoi) → dòng có ngày ở cột B → C += budget (ô trống coi như 0).
- Chống ghi hai lần: patch `written:true` với điều kiện updateTime trước, rồi mới ghi ô; ghi ô lỗi thì trả `written:false`.
- Khóa LockService quanh cả lần đồng bộ.

## Giao diện
- Khách: hộp thoại (dialog) trong mục báo cáo: mức gợi ý, ô nhập, dòng "Ngân sách vào TKQC … · Phí 10% …", Tạo lệnh nạp →
  QR + thông tin chuyển khoản (nút chép) + "Tải ảnh QR" (ảnh PNG có QR, số tiền, nội dung, ngân hàng; điện thoại dùng menu chia sẻ
  để "Lưu hình ảnh", máy tính tải file). Danh sách lệnh nạp gần đây của TKQC dưới báo cáo (chờ / đã nhận / đã ghi / từ chối).
- Quản trị (mục Tài khoản quảng cáo): khối "Cài đặt nạp ngân sách" + danh sách lệnh nạp chờ duyệt với ngày ghi sửa được,
  nút Đã nhận tiền / Từ chối.

## Kiểm tra
Bài test rules mới trên emulator + toàn bộ bài cũ; build; ảnh xem trước 390/1440; thử Apps Script trên tab thử rồi xóa.
