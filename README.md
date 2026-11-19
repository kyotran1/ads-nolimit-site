# ads-nolimit-website

Website mới của **ADS-Nolimit — Quảng cáo & AI Agent cho doanh nghiệp** (www.ads-nolimit.agency).
Site tĩnh dựng bằng [Astro](https://astro.build), font Be Vietnam Pro (tự host), rất ít JavaScript.
Song ngữ: tiếng Việt ở gốc (`/`), tiếng Anh dưới `/en/`.
Yêu cầu nội dung và giới hạn (điều được nói, điều cấm) nằm trong BRIEF.md ở repo riêng tư `kyotran1/ads-nolimit-website-backup` (nhánh `site-v1`).

## Chạy trên máy

Cần Node.js 22 (bản ≥ 22.23.4, xem `.nvmrc`).

```bash
npm ci            # cài thư viện đúng phiên bản trong package-lock.json
npm run dev       # chạy thử tại http://localhost:4321 (tự tải lại khi sửa file)
npm run build     # build ra thư mục dist/
npm run preview   # xem bản build trong dist/
```

Kết quả build nằm ở **`dist/`**. Đây là toàn bộ website, có thể đưa lên bất kỳ hosting tĩnh nào.

## Sửa nhanh

| Muốn sửa | Sửa ở file |
|---|---|
| **Giá, gói dịch vụ, ưu đãi thí điểm, ghi chú dưới bảng giá** (cả hai ngôn ngữ) | `src/data/pricing.ts` |
| **Số điện thoại, Zalo, Telegram, email, fanpage, Messenger** | `src/config/site.ts` (object `contact`) |
| Menu, tên site, mô tả mặc định, nút liên hệ chính mỗi ngôn ngữ | `src/config/site.ts` |
| **Bảng đối chiếu trang Việt ↔ Anh** (nút VI \| EN, hreflang, sitemap) | `src/config/i18n.ts` (`routes`) |
| Chữ giao diện dùng chung (header, footer, nút) | `src/config/i18n.ts` (`ui`) |
| Huy hiệu đối tác (Meta, Google, Shopify, TikTok Shop) và link xác minh `verifyUrl` | `src/config/site.ts` (`partners`); ảnh ở `src/assets/partners/` |
| Google Analytics / Meta Pixel (đang **tắt**) | `src/config/analytics.ts` |
| Câu hỏi thường gặp (FAQ, hai ngôn ngữ) | `src/data/faq.ts` |
| Bài blog tiếng Việt / tiếng Anh | `src/content/blog/*.md` / `src/content/blog-en/*.md` |
| Nội dung & bố cục từng trang (chữ Việt và Anh nằm cạnh nhau trong `copy`) | `src/views/*.astro` |
| Hội thoại minh họa (tự phát như video) | `copy.chat` trong `src/views/HomePage.astro`, `src/views/AiAgentPage.astro`; khung chat ở `src/components/ChatDemo.astro` |
| Màu sắc, cỡ chữ, khoảng cách, nút, thẻ | `src/styles/global.css` (biến ở đầu file) |
| **Tài khoản khách hàng**: chữ trên trang đăng nhập/đăng ký/tài khoản | `src/views/SignInPage.astro`, `SignUpPage.astro`, `ForgotPasswordPage.astro`, `AccountPage.astro` |
| Thông báo lỗi / thành công khi đăng nhập, lưu hồ sơ, gửi yêu cầu (hai ngôn ngữ) | `src/lib/auth/messages.ts` |
| Cấu hình Firebase (công khai) | `src/config/firebase.ts` |
| Luật bảo mật dữ liệu Firestore | `firestore.rules` (test: `firebase/`) |

### Giá

Mọi trang (trang chủ, `/bang-gia/`, `/en/pricing/`, các trang dịch vụ, FAQ) đều đọc giá từ `src/data/pricing.ts`.
Số tiền viết dạng số nguyên (`amount: 4_900_000`): trang Việt hiện `4.900.000đ`, trang Anh hiện `4,900,000 VND`.
Mỗi chữ trong file có hai bản `{ vi: '…', en: '…' }`.
Khi đã đủ 3 khách thí điểm, đổi `active: true` thành `false` trong object `pilot` để ẩn ưu đãi ở mọi nơi (cả tiếng Anh).

### Liên hệ

Chỉ sửa các giá trị trong object `contact` của `src/config/site.ts`.
Link `tel:`, `zalo.me`, `t.me`, `mailto:`, `m.me` và dữ liệu JSON-LD được tạo tự động từ đó.

### Analytics / Meta Pixel

Mặc định tắt, site không tải script đo lường nào. Để bật: điền ID vào `src/config/analytics.ts`,
đổi `enabled: true`, rồi cập nhật mục "Cookie & công cụ đo lường" trong `src/views/PrivacyPage.astro` (cả hai ngôn ngữ).

### Form liên hệ

Site chưa có backend. Form ở `/lien-he/` chỉ soạn sẵn nội dung rồi mở ứng dụng email (mailto:) hoặc Zalo
(bản tiếng Anh `/en/contact/`: email hoặc Telegram), không lưu gì trên website. Nút "Đăng ký nhận tin" của
ADS-NOLIMIT AI Office cũng mở email soạn sẵn. Khi có dịch vụ nhận form, xem ghi chú `TODO` trong
`src/views/ContactPage.astro` và `src/components/AiOfficeTeaser.astro`.

## Tài khoản khách hàng (Firebase)

Dự án Firebase "ADS-Nolimit Web" (`ads-nolimit-web`). Đăng nhập bằng email/mật khẩu hoặc Google
(Firebase Authentication); hồ sơ và yêu cầu dịch vụ lưu trong Cloud Firestore.

- **Chỉ 4 trang tài khoản tải Firebase.** Các trang khác không tải gì của Firebase/Google. Header biết khách đã đăng nhập
  nhờ một ghi nhớ nhỏ trong trình duyệt (`localStorage` khóa `adsnl-user`: tên, chữ cái đầu, ảnh), xem
  `src/components/AccountLink.astro` và `src/lib/auth/user-cache.ts`.
- **Dữ liệu Firestore:** `users/{uid}` (hồ sơ: tên hiển thị, điện thoại/Zalo, công ty, ngành hàng, nhận tin AI Office) và
  `requests/{id}` (yêu cầu dịch vụ: gói, mô tả, cách liên hệ, ngôn ngữ, trạng thái, thời điểm gửi).
- **Xử lý yêu cầu:** vào Firebase Console → Firestore → `requests`, đổi trường `status`:
  `new` → `contacted` → `in_progress` → `done` (hoặc `cancelled`). Khách thấy trạng thái mới ở trang tài khoản.
  Website **không tự báo** khi có yêu cầu mới: cần vào Console xem (hoặc thêm thông báo sau, ví dụ Cloud Functions).
  Muốn biết email của khách: lấy `uid` của yêu cầu, tra ở Authentication → Users.
- **Luật bảo mật:** `firestore.rules`. Sau khi sửa, chạy test trên máy (`cd firebase && npm ci && npm test`, cần Java),
  rồi dán nội dung file vào Firebase Console → Firestore → Rules → Publish. Thêm gói mới trong `src/data/pricing.ts`
  thì thêm id gói vào `planIds()` trong `firestore.rules`.
- Link chọn sẵn gói: `/tai-khoan/?plan=<id gói>#yeu-cau` (trang Bảng giá đã dùng).
- Mục "Tài khoản khách hàng" trong `src/views/PrivacyPage.astro` mô tả dữ liệu trên; thêm dữ liệu mới thì cập nhật mục này.

## Logo, favicon, ảnh chia sẻ

- Logo gốc: `brand/logo-full-transparent.png`. Bản cắt chỉ biểu tượng vô cực: `src/assets/brand/logo-mark.png`
  (dùng ở header, Astro tự xuất WebP). Logo đầy đủ ở footer: `src/assets/brand/logo-full.png`.
- Favicon và icon ứng dụng: `public/favicon*.png`, `public/favicon.ico`, `public/apple-touch-icon.png`, `public/icon-*.png`.
- Ảnh chia sẻ mạng xã hội 1200×630: `public/og-image.png`, nguồn ở `scripts/og-image.html`
  (lệnh tạo lại ghi ở đầu file đó).
- Thư mục `brand/` không được build ra `dist/`; chỉ những gì nằm trong `public/` và `src/` mới lên web.

## Trang

Tiếng Việt: `/`, `/giai-phap-ai-agent/`, `/tu-dong-hoa/`, `/quang-cao/`, `/thiet-ke-website/`, `/phan-mem/`, `/bang-gia/`,
`/du-an/`, `/blog/` (+ 2 bài), `/ve-chung-toi/`, `/lien-he/`, `/chinh-sach-bao-mat/`, trang 404,
tài khoản: `/dang-nhap/`, `/dang-ky/`, `/quen-mat-khau/`, `/tai-khoan/`.

Tiếng Anh: `/en/`, `/en/ai-agent/`, `/en/automation/`, `/en/advertising/`, `/en/web-design/`, `/en/software/`, `/en/pricing/`,
`/en/projects/`, `/en/blog/` (+ 2 bài), `/en/about/`, `/en/contact/`, `/en/privacy/`,
tài khoản: `/en/sign-in/`, `/en/sign-up/`, `/en/forgot-password/`, `/en/account/`.

- Mỗi cặp trang Việt/Anh dùng chung một file bố cục trong `src/views/`; `src/pages/` chỉ là các file mỏng gọi view với `lang="vi"` hoặc `lang="en"`.
- Thêm trang mới: tạo view, hai file trong `src/pages/` (Việt + `en/`), rồi thêm một dòng vào `routes` trong `src/config/i18n.ts`
  (nếu quên, build sẽ báo lỗi khi có link tiếng Anh trỏ tới trang chưa khai báo).
- `/sitemap.xml` tự sinh từ các trang và bài blog cả hai ngôn ngữ, kèm liên kết hreflang; `robots.txt` ở `public/`.
- Trang 404 có cả tiếng Việt và tiếng Anh (đường dẫn `/en/…` thì tiếng Anh lên trước).
- Chuyển hướng: `/vn/` → `/` (file `public/vn/index.html`); `/EN/` → `/en/` (file `scripts/redirect-EN.html`, được chép vào
  `dist/EN/` sau khi build — không đặt trong `public/` vì trên Windows/macOS thư mục `EN` và `en` trùng nhau).

## Sau khi build

`scripts/build-integrations.mjs` chạy hai bước nhỏ sau `npm run build`:
giữ chữ "ADS-Nolimit" không bị ngắt dòng ở dấu gạch nối, và tạo trang `/EN/`.

## Deploy

- `public/CNAME` = `www.ads-nolimit.agency`.
- `.github/workflows/deploy.yml` build và deploy lên GitHub Pages **khi push vào nhánh `main`**
  (site đang chạy tại https://www.ads-nolimit.agency). Làm việc trên nhánh khác, chỉ gộp vào `main` khi đã duyệt.
