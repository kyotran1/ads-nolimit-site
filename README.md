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
| **Tài khoản khách hàng**: chữ trên trang đăng nhập/đăng ký/quên mật khẩu | `src/views/SignInPage.astro`, `SignUpPage.astro`, `ForgotPasswordPage.astro` |
| Chữ cố định trên trang tài khoản (từng mục: Tổng quan, Nạp tiền, Đơn hàng, Dịch vụ, Khóa học, Hướng dẫn, Key & máy, Hồ sơ, Bảo mật) | `src/components/account/*.astro`; khung + menu: `src/views/AccountPage.astro`; tên mục và #neo: `src/lib/account/routes.ts` |
| Chữ hiện ra khi dùng trang tài khoản (trạng thái, thông báo nạp tiền, thanh toán, key…) | `src/lib/account/text.ts`; lỗi đăng nhập / Firestore: `src/lib/auth/messages.ts` |
| **Dịch vụ bán bằng số dư** và ô chọn dịch vụ (giá vẫn lấy từ `pricing.ts`) | `src/data/catalog.ts` |
| Danh sách ngân hàng (mã BIN VietQR) cho trang quản trị | `src/data/banks.ts` |
| **Điều khoản nạp tiền & sử dụng số dư** | `src/views/TermsPage.astro` (`/dieu-khoan/`, `/en/terms/`) |
| Trang quản trị của chủ | `src/views/AdminPage.astro`, xử lý `src/lib/admin/*.ts` |
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

## Tài khoản khách hàng (Firebase) — V4

Dự án Firebase "ADS-Nolimit Web" (`ads-nolimit-web`), gói miễn phí Spark (không dùng Cloud Functions, không cổng thanh toán).
Đăng nhập bằng email/mật khẩu hoặc Google (Firebase Authentication); mọi dữ liệu khác nằm trong Cloud Firestore.

- **Chỉ các trang tài khoản (đăng nhập, đăng ký, quên mật khẩu, `/tai-khoan/`) và `/quan-tri/` tải Firebase.** Các trang khác
  không tải gì của Firebase/Google. Header biết khách đã đăng nhập nhờ một ghi nhớ nhỏ trong trình duyệt (`localStorage` khóa
  `adsnl-user`), xem `src/components/AccountLink.astro` và `src/lib/auth/user-cache.ts`.
- **Trang tài khoản** `/tai-khoan/` (`/en/account/`) là một bảng điều khiển, chuyển mục bằng #neo:
  `#tong-quan`, `#nap-tien`, `#don-hang`, `#dich-vu`, `#khoa-hoc` (`#khoa-hoc/<id>`), `#huong-dan` (`#huong-dan/<id>`), `#key-may`,
  `#ho-so`, `#bao-mat` (tiếng Anh: `#overview`, `#top-up`, `#orders`, `#services`, `#courses`, `#guides`, `#keys`, `#profile`,
  `#security`; trang nào cũng hiểu cả hai, neo cũ `#yeu-cau` vẫn mở mục Dịch vụ).
  Link chọn sẵn dịch vụ: `/tai-khoan/?plan=<id gói>#dich-vu` (trang Bảng giá đã dùng).
- **Số dư tính bằng VNĐ** (tiền khách chuyển khoản). Trang tiếng Anh hiện số dư dạng "1,000,000 VND"; giá tham khảo trên thẻ
  dịch vụ vẫn là USD từ `pricing.ts`, kèm số VNĐ sẽ trừ vào số dư.

### Dữ liệu Firestore

| Bộ sưu tập | Nội dung | Ai ghi |
|---|---|---|
| `users/{uid}` | Hồ sơ: tên, **email đăng nhập** (để chủ tìm khách), điện thoại/Zalo, công ty, ngành hàng, nhận tin AI Office | Khách (của mình) |
| `wallets/{uid}` | `balance` (số nguyên VNĐ), `lastTx` (dòng sổ gần nhất), `updatedAt` | Chủ; khách chỉ **giảm** khi mua |
| `transactions/{id}` | Sổ giao dịch: `type` = `topup` / `purchase` / `refund` / `adjust`, `amount` (+/−), `balanceAfter`, `refId`, `note`, `by` | Chủ; khách chỉ dòng `purchase` khi mua. **Không ai sửa/xóa** |
| `topups/{mã ADSN…}` | Lệnh nạp: `amount`, `code`, `status` = `pending` / `approved` / `rejected` / `cancelled`, `reason` | Khách tạo & tự hủy; chủ duyệt/từ chối |
| `orders/{id}` | Đơn trả bằng số dư: dịch vụ, số lượng, đơn giá, tổng, `status` = `paid` / `processing` / `done` / `cancelled` / `refunded`, ID tài khoản quảng cáo (nạp ngân sách) | Khách tạo (đã thanh toán); chủ đổi trạng thái, hoàn tiền |
| `products/{id}` | Bảng giá bán bằng số dư (từ `src/data/catalog.ts`) | Chủ ("Đồng bộ bảng giá") |
| `courses/{id}`, `courses/{id}/lessons/{id}` | Khóa học (tên, mô tả, giá VNĐ/USD, màu bìa, đề cương) và bài học (tên, link video, thời lượng) | Chủ |
| `courseAccess/{uid}_{idKhóa}` | Quyền học: mua bằng số dư / khóa miễn phí / chủ cấp | Khách (khi mua); chủ cấp/thu hồi |
| `guides/{id}` | Hướng dẫn sử dụng: tiêu đề, chủ đề, nội dung (Markdown đơn giản), video | Chủ |
| `keys/{AINO-…}` | Key ADS-NOLIMIT AI Office: khách, gói, `maxMachines`, `machines` [{id, name, activatedAt}], `status` | Chủ |
| `keyRequests/{id}` | Yêu cầu đổi máy của khách | Khách tạo; chủ xử lý |
| `settings/payment` | Ngân hàng nhận tiền: `bankBin`, `bankName`, `accountNumber`, `accountName`, `note` | **Chỉ chủ** (ở `/quan-tri/`) |
| `requests/{id}` | Yêu cầu tư vấn (như V3) | Khách tạo & hủy; chủ đổi trạng thái |
| `admins/{uid}` | Danh sách quản trị viên | **Chỉ tạo trong Firebase Console** |

### Tiền đi thế nào (và luật bảo mật chặn gì)

- **Nạp tiền:** khách chọn số tiền (100.000đ – 500.000.000đ, chẵn nghìn) → "Tạo lệnh nạp" tạo `topups/ADSNxxxxxx` (6 ký tự
  không có I, O, 0, 1). Trang hiện **mã VietQR tạo ngay trên trình duyệt** (`src/lib/vietqr.ts`, thư viện `qrcode`, không gọi
  dịch vụ ngoài) + nút chép ngân hàng, số tài khoản, chủ tài khoản, số tiền, nội dung. Chưa có `settings/payment` thì không tạo QR,
  khách được mời nhắn Zalo.
- **Duyệt** (ở `/quan-tri/#nap-tien`) là MỘT transaction: lệnh nạp → `approved` + dòng sổ `topup_<mã>` + ví cộng tiền.
  Mỗi lệnh chỉ duyệt được một lần. Khách hủy nhầm nhưng đã chuyển tiền: vẫn duyệt được (lọc "Khách đã hủy").
  Khách chuyển thiếu/dư: duyệt lệnh rồi chỉnh chênh lệch ở mục Khách hàng (điều chỉnh có ghi chú), hoặc từ chối kèm lý do.
- **Thanh toán bằng số dư** là MỘT transaction của khách: đơn (`paid`) + dòng sổ `purchase` (cùng mã với đơn) + ví trừ tiền
  (+ quyền học nếu là khóa học). Luật kiểm tra: giá đúng `products/` (hoặc `courses/`), tổng = đơn giá × số lượng, ngân sách quảng
  cáo ≥ 500.000đ và có ID tài khoản, số dư mới = số dư cũ − tổng ≥ 0, dòng sổ khớp đơn, mỗi khóa học chỉ mua một lần.
  Khách **không bao giờ** tự cộng tiền, tự duyệt, đổi giá, đọc dữ liệu người khác hay sửa sổ giao dịch.
- **Hoàn tiền** (`/quan-tri/#don-hang`): đơn → `refunded` + dòng sổ `refund_<mã đơn>` + ví cộng lại đủ tổng (khóa học: thu hồi
  quyền học). Mỗi đơn chỉ hoàn một lần.
- **Không cho tự xóa tài khoản khi số dư > 0** (giao diện ẩn nút xóa và mời liên hệ; luật cũng chặn bước xóa hồ sơ).
- Code ghi tiền dùng chung cho website, trang quản trị và bộ test: `src/lib/ledger/ops.ts`.

### Việc của chủ ở trang quản trị `/quan-tri/`

Trang chỉ tiếng Việt, `noindex`, không có trong sitemap. Đăng nhập bằng tài khoản của chủ như khách bình thường, rồi mở `/quan-tri/`.

1. **Tự thêm mình làm quản trị viên (làm một lần):** mở `/quan-tri/` khi đã đăng nhập → trang báo "Không có quyền truy cập" và
   hiện **UID** của bạn (nút "Chép UID"). Vào Firebase Console → dự án `ads-nolimit-web` → Firestore Database → Data →
   "Start collection" `admins` → Document ID = UID vừa chép → thêm một trường bất kỳ (ví dụ `name` = tên bạn) → Save → tải lại trang.
2. **Cài đặt thanh toán:** tab "Cài đặt thanh toán" → chọn ngân hàng (hoặc "Ngân hàng khác" + mã BIN), **tự gõ số tài khoản và tên
   chủ tài khoản** (chữ in hoa không dấu, tự chuyển) → Lưu. Trang hiện mã QR thử 100.000đ: **quét thử bằng app ngân hàng** (không cần
   chuyển) để chắc tên chủ tài khoản đúng. Website không chứa sẵn số tài khoản nào.
3. **Đồng bộ bảng giá:** cùng tab, bấm "Đồng bộ bảng giá" (lần đầu, và mỗi khi đổi giá trong `src/data/pricing.ts` đã deploy).
   Chưa đồng bộ thì nút "Thanh toán bằng số dư" báo dịch vụ chưa mở bán.
4. **Duyệt nạp tiền:** tab "Nạp tiền" (mặc định lọc "Chờ duyệt"). Đối chiếu sao kê: đúng nội dung `ADSN…` và đủ số tiền → "Duyệt".
   Không nhận được tiền → "Từ chối" kèm lý do (khách thấy lý do). Website không tự báo khi có lệnh mới: tab "Tổng quan" đếm số lệnh chờ.
5. **Đơn hàng:** đổi trạng thái (Đã thanh toán → Đang xử lý → Hoàn thành), ghi chú cho khách, "Hoàn tiền" khi không thực hiện được.
   Đơn "Nạp ngân sách quảng cáo" có ID tài khoản quảng cáo khách nhập.
6. **Khách hàng:** tìm theo email/tên/số điện thoại, xem số dư và sổ giao dịch, điều chỉnh số dư bằng tay (số âm để trừ, bắt buộc
   ghi chú; khách thấy ghi chú trong sổ giao dịch).
7. **Key & máy:** cấp key theo email khách (khách cần đăng nhập trang tài khoản ít nhất một lần) → key dạng `AINO-XXXX-XXXX-XXXX`;
   "Đặt lại máy", "Thu hồi"/"Mở lại"; xử lý "Yêu cầu đổi máy" của khách. Kích hoạt máy thật sẽ nối khi phần mềm ra mắt
   (ghi chú trong `firestore.rules`, mục `keys`).
8. **Khóa học & Hướng dẫn:** "Khóa học mới" (tên, giá VNĐ, giá USD, màu bìa, bật "Đăng") → thêm bài học (link YouTube, Google Drive
   chia sẻ công khai, Vimeo hoặc file .mp4 https; thời lượng dạng 12:30) → cấp quyền học theo email nếu cần. "Bài hướng dẫn mới":
   chủ đề, nội dung (viết thường hoặc Markdown đơn giản), video tùy chọn. Chỉ mục đã bật "Đăng" mới hiện cho khách.
9. **Yêu cầu dịch vụ:** đổi trạng thái `Mới → Đã liên hệ → Đang triển khai → Hoàn thành` (hoặc `Đã hủy`).

### Luật bảo mật & test

- Luật: `firestore.rules`. Sau khi sửa, chạy test trên máy (`cd firebase && npm ci && npm test`, cần Java) — chạy trên Firebase
  Emulator với dự án giả `demo-ads-nolimit`, không chạm dự án thật. Hai file test: `firebase/test/rules.test.mjs` (hồ sơ, yêu cầu tư vấn)
  và `firebase/test/money.test.mjs` (ví, sổ giao dịch, nạp tiền, đơn hàng, hoàn tiền, giả mạo số dư, tiêu hai lần, khóa học, key,
  cài đặt thanh toán, quyền quản trị). `money.test.mjs` chạy đúng code `src/lib/ledger/ops.ts` của website.
- Rồi dán nội dung `firestore.rules` vào Firebase Console → Firestore → Rules → Publish.
- Thêm gói mới trong `src/data/pricing.ts`: thêm id gói vào `planIds()` trong `firestore.rules` (yêu cầu tư vấn); muốn bán bằng số dư
  thì khai báo dòng giá trong `src/data/catalog.ts`, deploy, rồi "Đồng bộ bảng giá".
- Mục "Tài khoản khách hàng" trong `src/views/PrivacyPage.astro` và trang `/dieu-khoan/` mô tả dữ liệu và cách dùng số dư;
  thêm dữ liệu mới thì cập nhật hai trang này.

### Trước khi mở cho khách dùng (dự án thật)

1. Publish `firestore.rules` mới (bước trên). **Làm trước khi deploy website V4**: luật cũ (V3) chặn mọi dữ liệu mới, còn luật V4
   vẫn chạy đúng với website V3 đang chạy. Không cần tạo chỉ mục (index) nào: mọi truy vấn chỉ lọc một trường.
2. Tạo `admins/<UID của chủ>` trong Console (mục 1 ở trên).
3. Điền thông tin nhận tiền ở `/quan-tri/#cai-dat`, quét thử mã QR mẫu bằng app ngân hàng.
4. Bấm "Đồng bộ bảng giá".
5. Chủ duyệt nội dung `/dieu-khoan/` (đặc biệt phần hoàn trả số dư và ngân sách quảng cáo) và mục mới trong Chính sách bảo mật.
6. Thử trọn một vòng bằng tài khoản thật của chủ: nạp 100.000đ → duyệt → mua thử → hoàn tiền.

## Logo, favicon, ảnh chia sẻ

- Logo gốc: `brand/logo-full-transparent.png`. Bản cắt chỉ biểu tượng vô cực: `src/assets/brand/logo-mark.png`
  (dùng ở header, Astro tự xuất WebP). Logo đầy đủ ở footer: `src/assets/brand/logo-full.png`.
- Favicon và icon ứng dụng: `public/favicon*.png`, `public/favicon.ico`, `public/apple-touch-icon.png`, `public/icon-*.png`.
- Ảnh chia sẻ mạng xã hội 1200×630: `public/og-image.png`, nguồn ở `scripts/og-image.html`
  (lệnh tạo lại ghi ở đầu file đó).
- Thư mục `brand/` không được build ra `dist/`; chỉ những gì nằm trong `public/` và `src/` mới lên web.

## Trang

Tiếng Việt: `/`, `/giai-phap-ai-agent/`, `/tu-dong-hoa/`, `/quang-cao/`, `/thiet-ke-website/`, `/phan-mem/`, `/bang-gia/`,
`/du-an/`, `/blog/` (+ 2 bài), `/ve-chung-toi/`, `/lien-he/`, `/chinh-sach-bao-mat/`, `/dieu-khoan/`, trang 404,
tài khoản: `/dang-nhap/`, `/dang-ky/`, `/quen-mat-khau/`, `/tai-khoan/`; quản trị (chỉ tiếng Việt): `/quan-tri/`.

Tiếng Anh: `/en/`, `/en/ai-agent/`, `/en/automation/`, `/en/advertising/`, `/en/web-design/`, `/en/software/`, `/en/pricing/`,
`/en/projects/`, `/en/blog/` (+ 2 bài), `/en/about/`, `/en/contact/`, `/en/privacy/`, `/en/terms/`,
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
