# Ứng dụng cài được (PWA) — bản thiết kế ngắn

Chủ yêu cầu 24/11/2026 (bước 1 của lộ trình đưa web app lên App Store / Google Play).

## Mục đích
Khách và chủ cài được ADS-Nolimit ra màn hình chính điện thoại/máy tính, mở lên như một ứng dụng
(không thanh địa chỉ), vào thẳng trang Tài khoản. Là nền cho bước đóng gói lên store sau này.

## Hiện trạng (đã kiểm tra mã)
- Đã có `public/site.webmanifest` nhưng `display: "browser"`, `start_url: "/"` → cài ra chỉ là lối tắt mở trình duyệt.
- Đã có icon 192/512 (nền tối tràn viền, logo nằm gọn trong vùng an toàn), apple-touch-icon 180, `theme-color`, `viewport-fit=cover`,
  các thanh dưới đã tính `safe-area-inset-bottom`.
- Chưa có service worker, chưa có lời mời cài, trang Quản trị chưa gắn manifest.
- Đăng nhập Google dùng `signInWithPopup` — trên iPhone ở chế độ ứng dụng có thể không chạy (xem Rủi ro).

## Mục tiêu
1. Cài được trên Android (Chrome), iPhone (Safari → Thêm vào MH chính), máy tính (Chrome/Edge).
2. Mở app → trang Tài khoản; chưa đăng nhập → trang Đăng nhập rồi quay lại.
3. Mất mạng → hiện trang "Không có mạng" của ADS-Nolimit có nút Thử lại (không hiện trang lỗi của trình duyệt).
4. Mở lại nhanh hơn (tệp JS/CSS/phông/ảnh đã tải được giữ lại trên máy).
5. Có lời mời cài đặt nhẹ nhàng, tắt được, không làm phiền.

## Không làm (đợt này)
- Không thông báo đẩy, vân tay/khuôn mặt, camera (bước 3 — cần gói Blaze).
- Không xem dữ liệu khi mất mạng (số dư, báo cáo luôn cần mạng để đúng số).
- Không tách "vỏ app" (bước 2), không đổi giao diện các mục, không đổi luật Firestore.
- Không đưa lên store.

## Tuyệt đối tránh
- Khách thấy **bản web cũ** sau khi em cập nhật (web đang cập nhật nhiều lần/ngày).
- Khách thấy **số dư/báo cáo cũ** do máy giữ lại.
- Lời mời cài che nội dung hoặc hiện lại mãi sau khi khách đã từ chối.

## Các cách đã cân nhắc
- **A. Chỉ sửa manifest, không service worker.** Đơn giản nhất, không bao giờ lo bản cũ. Nhưng mất mạng hiện trang lỗi
  trình duyệt, không nhanh hơn, và thiếu nền cho thông báo đẩy sau này.
- **B. Service worker tối giản (CHỌN).** Trang HTML luôn lấy từ mạng trước (nên luôn là bản mới nhất); chỉ giữ trên máy các tệp
  có tên gắn mã băm trong `/_astro/` (đổi nội dung là đổi tên, không thể cũ) + biểu tượng + trang "Không có mạng".
  Không đụng tới yêu cầu gửi Firebase/Google/SePay. Được trang ngoại tuyến, mở nhanh hơn, không có rủi ro bản cũ.
- **C. Lưu sẵn toàn bộ trang (kiểu Workbox precache).** Mở tức thì kể cả mất mạng, nhưng dễ dính bản cũ, phải làm màn
  "Có bản mới – tải lại", mà dữ liệu vẫn cần mạng nên lợi ích thật rất ít. Loại.

## Thiết kế (cách B)
**Manifest** (`site.webmanifest`, tiếng Việt): `id: "/tai-khoan/"`, `start_url: "/tai-khoan/?src=pwa"`, `scope: "/"`,
`display: "standalone"`, `name: "ADS-Nolimit"`, `short_name: "ADS-Nolimit"`, màu nền/chủ đề `#070a1a`,
icon 192 + 512 (`purpose: "any"`) + 512 maskable (logo thu ~10% cho chắc vùng an toàn),
`shortcuts` (giữ lâu icon để mở nhanh): Nạp tiền `#nap-tien`, Báo cáo quảng cáo `#bao-cao-ads`, Đơn hàng `#don-hang`.
Trang tiếng Anh dùng `site.en.webmanifest` (`lang: en`, `start_url: /en/account/?src=pwa`, tên mục tiếng Anh).
Trang Quản trị gắn manifest tiếng Việt + apple-touch-icon (cài từ đó vẫn mở Tài khoản; chủ vào Quản trị bằng link có sẵn).

**Service worker** (`/sw.js`, một tệp viết tay ~60 dòng, không thêm thư viện):
- `install`: lưu `/offline/` + icon; `skipWaiting`. `activate`: xóa kho cũ theo tên phiên bản; `clients.claim`.
- `fetch`: chỉ xử lý GET cùng tên miền. Điều hướng trang → mạng trước, lỗi mạng → `/offline/`.
  `/_astro/*`, phông, icon → lấy trên máy trước, chưa có thì tải rồi lưu. Còn lại → để nguyên cho trình duyệt.
- Đăng ký trong `BaseLayout` và `AdminPage` sau sự kiện `load`; không đăng ký khi chạy `astro dev`.
- Trang `/offline/` (vi/en trong một trang, noindex, không vào sitemap): logo, "Không có mạng", nút Thử lại.

**Lời mời cài** (chỉ trong trang Tài khoản, ở Tổng quan, một thẻ nhỏ; không hiện trên các trang giới thiệu):
- Android/máy tính: bắt `beforeinstallprompt` → nút "Cài ứng dụng" gọi hộp cài của trình duyệt.
- iPhone/iPad Safari: thẻ hướng dẫn 2 bước (nút Chia sẻ → "Thêm vào MH chính"), có hình biểu tượng.
- Ẩn khi đang chạy ở chế độ ứng dụng, khi đã cài (`appinstalled`), hoặc khách bấm "Để sau" (nhớ 30 ngày trên máy đó).
- Mục Hồ sơ có dòng "Cài ứng dụng" cố định để khách tự tìm lại.

**Chạy ở chế độ ứng dụng** (`display-mode: standalone`):
- Liên kết ra ngoài (Zalo, Facebook, Messenger) mở bằng trình duyệt/app tương ứng — giữ `target="_blank"` hiện có, rà lại.
- Thêm `apple-mobile-web-app-title`, `mobile-web-app-capable`; thanh trạng thái iPhone nền tối theo `theme-color`.
- Đầu trang Tài khoản chừa `safe-area-inset-top` (tai thỏ).

## Rủi ro đã biết
- **Đăng nhập Google trên iPhone ở chế độ ứng dụng**: cửa sổ bật lên có thể không trả kết quả về app. Email + mật khẩu chạy
  bình thường. Xử lý trong đợt này: nếu cửa sổ Google bị chặn/đóng không kết quả khi đang ở chế độ ứng dụng trên iOS → hiện
  gợi ý "Dùng email và mật khẩu, hoặc Quên mật khẩu để đặt mật khẩu cho tài khoản Google này". Không tự kiểm tra được trên
  máy ảo — cần chủ thử trên iPhone thật sau khi lên web.
- iPhone: app cài ra có bộ nhớ riêng với Safari → khách phải đăng nhập lại một lần trong app (bình thường).
- GitHub Pages không cho đặt tiêu đề cache riêng; trình duyệt luôn kiểm tra `sw.js` mới bỏ qua cache nên không ảnh hưởng.

## Việc để người làm tự quyết
Chữ trên thẻ mời cài, hình minh họa nút Chia sẻ, tên kho cache, cách sinh icon maskable (sharp, từ `brand/`).

## Kiểm tra
- `npm run build`; test đơn vị cho hàm chọn chiến lược của service worker (URL nào mạng trước / máy trước / bỏ qua).
- Playwright trên bản build: manifest hợp lệ và trỏ đúng; service worker đăng ký được; tắt mạng → hiện `/offline/`;
  có mạng lại → trang mới; đổi nội dung HTML → lần mở sau thấy ngay bản mới; thẻ mời cài hiện/ẩn đúng 4 trường hợp;
  ảnh xem trước 390 và 1440.
- Toàn bộ test luật Firestore và test đơn vị hiện có vẫn qua (không đổi luật).
- Sau khi lên web: chủ thử cài trên Android + iPhone (em gửi các bước).

## Thứ tự làm (một đợt, một lần lên web)
Sao lưu → manifest + icon → service worker + trang offline → thẻ mời cài → chế độ ứng dụng → kiểm tra → gửi ảnh xem trước →
chủ duyệt lên web thật.
