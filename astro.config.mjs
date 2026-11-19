// @ts-check
import { defineConfig } from 'astro/config';

// Cấu hình Astro cho site tĩnh ADS-Nolimit.
// Tên miền chính thức; dùng cho canonical, sitemap và ảnh chia sẻ.
export default defineConfig({
  site: 'https://www.ads-nolimit.agency',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // CSS nhỏ được nhúng thẳng vào HTML để trang hiện nhanh hơn trên điện thoại.
    inlineStylesheets: 'auto',
  },
  // Giữ khoảng trắng giữa các thẻ inline (Astro 7 mặc định 'jsx' sẽ dính chữ).
  compressHTML: true,
  devToolbar: { enabled: false },
});
