# ads-nolimit-website

Website mới của **ADS-Nolimit — Quảng cáo & AI Agent cho doanh nghiệp** (www.ads-nolimit.agency).
Site tĩnh dựng bằng [Astro](https://astro.build), font Be Vietnam Pro, gần như không dùng JavaScript.
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
| **Giá, gói dịch vụ, ưu đãi thí điểm, ghi chú VAT** | `src/data/pricing.ts` |
| **Số điện thoại, Zalo, Telegram, email, fanpage, Messenger** | `src/config/site.ts` (object `contact`) |
| Menu, tên site, mô tả mặc định | `src/config/site.ts` |
| Huy hiệu đối tác (Meta, Google, Shopify, TikTok Shop) và link xác minh `verifyUrl` | `src/config/site.ts` (`partners`); ảnh ở `src/assets/partners/` |
| Google Analytics / Meta Pixel (đang **tắt**) | `src/config/analytics.ts` |
| Câu hỏi thường gặp (FAQ) | `src/data/faq.ts` |
| Bài blog | `src/content/blog/*.md` (thêm file mới là có bài mới) |
| Nội dung từng trang | `src/pages/*.astro` |
| Màu sắc, cỡ chữ chung | `src/styles/global.css` (biến ở đầu file) |

### Giá

Mọi trang (trang chủ, `/bang-gia/`, các trang dịch vụ, FAQ) đều đọc giá từ `src/data/pricing.ts`.
Số tiền viết dạng số nguyên, ví dụ `vnd(4_900_000)` hiển thị thành `4.900.000đ`.
Khi đã đủ 3 khách thí điểm, đổi `pilotOffer.active` thành `false` để ẩn ưu đãi ở mọi nơi.

### Liên hệ

Chỉ sửa các giá trị trong object `contact` của `src/config/site.ts`.
Link `tel:`, `zalo.me`, `t.me`, `mailto:`, `m.me` và dữ liệu JSON-LD được tạo tự động từ đó.

### Analytics / Meta Pixel

Mặc định tắt, site không tải script đo lường nào. Để bật: điền ID vào `src/config/analytics.ts`,
đổi `enabled: true`, rồi cập nhật mục "Cookie & công cụ đo lường" trong `src/pages/chinh-sach-bao-mat.astro`.

### Form liên hệ

Site chưa có backend. Form ở `/lien-he/` chỉ soạn sẵn nội dung rồi mở ứng dụng email (mailto:) hoặc Zalo,
không lưu gì trên website. Nút "Đăng ký nhận tin" của ADS-NOLIMIT AI Office cũng mở email soạn sẵn.
Khi có dịch vụ nhận form, xem ghi chú `TODO` trong `src/pages/lien-he.astro` và `src/components/AiOfficeTeaser.astro`.

## Logo, favicon, ảnh chia sẻ

- Logo gốc: `brand/logo-full-transparent.png`. Bản cắt chỉ biểu tượng vô cực: `src/assets/brand/logo-mark.png`
  (dùng ở header, Astro tự xuất WebP). Logo đầy đủ ở footer: `src/assets/brand/logo-full.png`.
- Favicon và icon ứng dụng: `public/favicon*.png`, `public/favicon.ico`, `public/apple-touch-icon.png`, `public/icon-*.png`.
- Ảnh chia sẻ mạng xã hội 1200×630: `public/og-image.png`, nguồn ở `scripts/og-image.html`
  (lệnh tạo lại ghi ở đầu file đó).
- Thư mục `brand/` không được build ra `dist/`; chỉ những gì nằm trong `public/` và `src/` mới lên web.

## Trang

`/`, `/giai-phap-ai-agent/`, `/tu-dong-hoa/`, `/quang-cao/`, `/thiet-ke-website/`, `/phan-mem/`, `/bang-gia/`,
`/du-an/`, `/blog/` (+ 2 bài), `/ve-chung-toi/`, `/lien-he/`, `/chinh-sach-bao-mat/`, `/en/`, trang 404.
`/sitemap.xml` tự sinh từ các trang và bài blog; `robots.txt` ở `public/`.

## Deploy

- `public/CNAME` = `www.ads-nolimit.agency`.
- `.github/workflows/deploy.yml` build và deploy lên GitHub Pages **khi push vào nhánh `main`**.
- Workflow chỉ chạy được sau khi chủ repo bật GitHub Pages (Settings → Pages → Source: GitHub Actions)
  và trỏ DNS tên miền về GitHub Pages. Hai bước này chưa làm; tên miền hiện vẫn trỏ về site Canva cũ.
