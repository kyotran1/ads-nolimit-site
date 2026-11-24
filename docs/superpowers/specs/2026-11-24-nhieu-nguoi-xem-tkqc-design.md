# Nhiều tài khoản cùng xem một TKQC + nút Làm mới — bản thiết kế ngắn

Chủ tịch yêu cầu và duyệt 24/11/2026 ("DUYỆT NHIỀU NGƯỜI XEM", "LÀM NÚT LÀM MỚI", email cảnh báo "gửi cho tất cả").

## Mục đích
Công ty đối tác có nhiều cổ đông; mỗi người tự tạo một tài khoản trên web. Quản trị cấp cho ai thì người đó xem được
TKQC, báo cáo quảng cáo và thẻ dịch vụ tương ứng. Hiện mỗi TKQC chỉ gắn được với đúng một tài khoản.

## Đã chốt
- Mỗi TKQC có **một tài khoản chính** (như hiện nay) + **tối đa 10 người xem thêm** (nhập bằng email đã đăng ký web).
- Người xem thêm: xem thẻ TKQC, báo cáo, thẻ dịch vụ tự động ở Tổng quan, **và tạo được lệnh "Nạp thêm ngân sách"**.
- Email cảnh báo số dư thấp gửi cho **tất cả** (chính + người xem thêm).
- Gỡ email khỏi danh sách → người đó hết quyền ngay sau lần đồng bộ (web đã tự đồng bộ khi lưu TKQC).

## Không làm
- Không lập "hồ sơ công ty". Thẻ dịch vụ gán tay (`customerServices`) vẫn theo từng tài khoản.
- Ví (số dư), đơn hàng, key: vẫn riêng từng tài khoản. Mỗi người chỉ thấy các lệnh nạp do chính mình tạo.

## Các cách đã cân nhắc
- **A. Danh sách người xem theo từng TKQC (chọn):** ít thay đổi, đủ nhu cầu, nâng lên B sau được.
- B. Hồ sơ công ty gom TKQC + dịch vụ + thành viên: đúng về lâu dài nhưng phải làm lại phần khách hàng–dịch vụ vừa xong.
- C. Tạo bản sao TKQC cho từng người: số liệu nhân đôi, dễ lệch. Loại.

## Dữ liệu
- `adAccounts/{actId}` thêm: `viewerUids: string[]` (≤ 10, không trùng, không chứa `uid`), `viewerEmails: string[]` (cùng thứ tự, cùng độ dài),
  `memberUids: string[]` = `[uid, ...viewerUids]`.
- `adReports/{actId}_{tháng}`: Apps Script ghi thêm `memberUids` (lấy từ TKQC; thiếu thì `[uid]`).
- Tài liệu cũ chưa có `memberUids` vẫn chạy: trang khách hỏi **cả hai** kiểu (`uid ==` và `memberUids array-contains`) rồi gộp theo id.

## Luật Firestore
- Đọc `adAccounts`, `adReports`: quản trị, hoặc `uid == mình`, hoặc `mình ∈ memberUids`.
- Ghi `adAccounts` (quản trị): thêm 3 khóa; kiểm `memberUids[0] == uid`, độ dài = `viewerUids.size() + 1`, chứa đủ `viewerUids`, ≤ 10 người xem, `viewerEmails` cùng độ dài. Thiếu cả 3 khóa vẫn hợp lệ (tài liệu cũ).
- Tạo `adTopups`: cho phép khi người tạo là chính **hoặc** ∈ `memberUids` của TKQC đó (các kiểm tra khác giữ nguyên).

## Quản trị
- Form TKQC: ô nhiều dòng "Email người xem thêm (mỗi dòng một email, tối đa 10)". Mỗi email phải là khách đã đăng ký; báo lỗi nêu đúng email sai; bỏ trùng; không được trùng email chính.
- Thẻ TKQC trong danh sách hiện "Người xem thêm: …". Chi tiết khách → tab TKQC và số "TKQC" ở danh sách khách tính cả TKQC mà khách là người xem thêm (ghi rõ "người xem thêm").

## Apps Script bot 3 (phiên chính làm)
`adReports` ghi `memberUids`; email cảnh báo gửi tới `customerEmail` + `viewerEmails`.

## Nút Làm mới (phiên chính làm)
- Trang Tài khoản: nút "Làm mới" ở đầu trang → tải lại mọi số liệu đã tải (`reloadLoaded()`), báo "Đã cập nhật lúc HH:MM"; không tải lại cả trang.
- Trang Quản trị: nút "Làm mới" → tải lại trang (các mục quản trị tự nạp dữ liệu khi mở).

## Thứ tự lên web
Luật Firestore → Apps Script → web. Mỗi bước sao lưu trước.

## Kiểm tra
Test luật (đọc/list theo cả hai kiểu, người ngoài không đọc được, người xem thêm tạo được lệnh nạp, người ngoài không tạo được),
test đơn vị, e2e emulator (người xem thêm thấy TKQC + báo cáo + thẻ dịch vụ; gỡ ra thì hết), ảnh 390/1440.
