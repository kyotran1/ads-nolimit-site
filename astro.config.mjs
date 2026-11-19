// @ts-check
import { defineConfig } from 'astro/config';
import { keepBrandTogether, uppercaseEnRedirect } from './scripts/build-integrations.mjs';

// Cấu hình Astro cho site tĩnh ADS-Nolimit.
// Tên miền chính thức; dùng cho canonical, sitemap và ảnh chia sẻ.
export default defineConfig({
  site: 'https://www.ads-nolimit.agency',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // Nhúng toàn bộ CSS vào HTML: trang hiện ngay sau một lượt tải, không chờ file CSS riêng
    // (quan trọng trên điện thoại 4G). CSS của site nhỏ (~10 KB sau nén).
    inlineStylesheets: 'always',
  },
  // Giữ khoảng trắng giữa các thẻ inline (Astro 7 mặc định 'jsx' sẽ dính chữ).
  compressHTML: true,
  devToolbar: { enabled: false },
  integrations: [keepBrandTogether, uppercaseEnRedirect],
});
