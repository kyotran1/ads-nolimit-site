# Khách hàng – Dịch vụ – Quyền – Hồ sơ (V4.2) — bản thiết kế ngắn

Chủ yêu cầu 24/11/2026. Đã chốt: gán dịch vụ tay + tự động; mục chưa cấp vẫn hiện nhưng khóa;
ảnh đại diện thu nhỏ lưu trong hồ sơ; sắp xếp lại giao diện, giữ phong cách hiện tại.

## Mục đích
1. Quản trị → Khách hàng → Chi tiết: thấy mọi dịch vụ khách đang dùng, bật/tắt quyền từng mục cho khách.
2. Khách: tên hiển thị + ảnh đại diện ngay sau khi tạo tài khoản; Tổng quan hiện các dịch vụ đang dùng.
3. Trang Quản trị và trang Tài khoản dễ dùng hơn: bớt cuộn, bớt bấm, thông tin quan trọng lên trước.

## Không làm (đợt này)
- Không đổi màu/kiểu chữ/khung chung; không đổi trang Nạp tiền, Đơn hàng, Báo cáo quảng cáo (đã duyệt).
- Không dùng Firebase Storage (Spark). Không tạo tài khoản khách thật để thử.

## Dữ liệu
- `users/{uid}` thêm: `avatar` (chuỗi data:image/webp;base64, ≤ 24 KB; ảnh đã thu nhỏ 128×128 trên trình duyệt) — khách ghi.
- `customerServices/{uid}` (mới; **chỉ quản trị ghi**, khách đọc của mình):
  - `services[]` {id (theo bảng giá: ai-starter | ai-sales | ads | agency-account | ad-budget | automation | web | training | other),
    label (tên hiện cho khách), status: active | paused | ended, since (YYYY-MM-DD), note, source: manual | order | ad}
  - `access` {ads: bool, courses: bool, keys: bool, guides: bool} — mặc định false; mục có dữ liệu thật (TKQC gắn, khóa đã mua, key đã cấp) coi như được mở dù chưa bật.
  - `updatedAt`, `updatedBy`.
- Tự động: khi khách mua đơn (orders paid) → web khách không ghi vào customerServices (khách không có quyền) — thay vào đó trang Tổng quan khách và trang Chi tiết quản trị **tính gộp** từ: customerServices + đơn đã trả + TKQC đã gắn + khóa đã mua. Không cần Cloud Function.

## Quản trị → Khách hàng (sắp xếp lại)
- Danh sách: ô tìm + bộ lọc (Có số dư / Có TKQC / Mới 7 ngày). Mỗi dòng: ảnh/chữ cái đầu, tên, email, số dư, số dịch vụ đang dùng, ngày tạo. Bấm dòng → trang Chi tiết (hash `#khach-hang/<uid>`, có nút Quay lại, chia sẻ được link).
- Chi tiết khách: đầu trang = ảnh, tên, email, điện thoại, công ty, số dư, nút nhanh (Điều chỉnh số dư, Gắn TKQC). Dưới là tab:
  1. **Dịch vụ & quyền**: danh sách dịch vụ (gán tay: Thêm / Sửa trạng thái / Kết thúc; tự động: đơn đã mua, TKQC, khóa học — chỉ xem) + 4 công tắc quyền.
  2. **Số dư & giao dịch**: sổ giao dịch + form điều chỉnh (như hiện nay).
  3. **Đơn hàng** của khách. 4. **Tài khoản quảng cáo** của khách (số dư, link sang mục TKQC). 5. **Yêu cầu** tư vấn của khách.
- Mục "Tài khoản quảng cáo" giữ nguyên, thêm link "Xem khách" sang Chi tiết.

## Trang Tài khoản khách
- **Hoàn thiện hồ sơ** sau đăng ký (và lần đầu vào trang khi chưa có tên): hộp thoại 1 bước — tên hiển thị (bắt buộc), ảnh đại diện (tùy chọn, chọn ảnh → cắt vuông, thu nhỏ 128px ngay trên máy), điện thoại/Zalo (tùy chọn). Có "Để sau".
- Ảnh/tên hiện ở menu trái, thanh trên; mục Hồ sơ có đổi/xóa ảnh.
- **Tổng quan** sắp lại: hàng 1 = lời chào + ảnh; hàng 2 = 3 ô số liệu (Số dư, Đơn hàng, TKQC/Số dư ads thấp nếu có); hàng 3 = **Dịch vụ đang dùng** (thẻ: tên, trạng thái, từ ngày, nút đi tới mục liên quan — báo cáo ads, khóa học…; chưa có gì → gợi ý Chọn dịch vụ); hàng 4 = lệnh nạp chờ + giao dịch gần đây (gọn lại, 5 dòng).
- Mục bị khóa (ads/courses/keys/guides khi access=false và không có dữ liệu): vẫn trên menu với biểu tượng khóa; vào thấy giới thiệu ngắn + nút "Liên hệ để mở" (Zalo) — không trống trơn.

## Luật Firestore
- users: thêm `avatar` (string ≤ 32 000 ký tự, bắt đầu "data:image/").
- customerServices: read nếu là chủ uid hoặc admin; write chỉ admin; kiểm tra khóa, trạng thái, mảng ≤ 30 phần tử.
- Test emulator cho cả hai.

## Cách làm đã chọn
Một bộ sưu tập `customerServices` riêng (không nhét vào users) để khách không tự sửa được dịch vụ/quyền của mình; gộp nguồn tự động lúc hiển thị thay vì ghi thêm bản sao. Loại bỏ: ghi vào users (khách tự sửa được), Cloud Function (cần Blaze).

## Thứ tự làm (3 đợt, mỗi đợt duyệt riêng trước khi lên web thật)
1. Luật + test; hồ sơ: tên + ảnh đại diện, hộp thoại hoàn thiện hồ sơ, hiện ảnh ở menu.
2. Quản trị: Khách hàng danh sách mới + Chi tiết có tab + Dịch vụ & quyền.
3. Khách: Tổng quan mới + mục bị khóa.

## Kiểm tra
Test rules; build; ảnh xem trước 390/1440 từng đợt (emulator, tài khoản giả); không đụng dữ liệu thật.
