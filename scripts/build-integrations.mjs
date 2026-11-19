/**
 * Hai bước chạy sau khi build (được nạp trong astro.config.mjs):
 *   - keepBrandTogether: giữ "ADS-Nolimit" trên một dòng.
 *   - uppercaseEnRedirect: tạo /EN/ → /en/.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Không để tên "ADS-Nolimit" bị ngắt dòng ở dấu gạch nối ("ADS-" / "Nolimit").
 * Sau khi build, bọc tên trong phần chữ hiển thị của <body> bằng <span class="nw">
 * (CSS: white-space: nowrap). Không đụng tới thuộc tính, <script>, <style>, <title>, <option>, <textarea>,
 * nên JSON-LD, meta, aria-label giữ nguyên.
 */
export const keepBrandTogether = {
  name: 'keep-brand-together',
  hooks: {
    'astro:build:done': ({ dir }) => {
      const root = fileURLToPath(dir);
      const skip = /(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<title[\s\S]*?<\/title>|<option[\s\S]*?<\/option>|<textarea[\s\S]*?<\/textarea>|<[^>]+>)|ADS-Nolimit/g;
      const walk = (folder) => {
        for (const entry of readdirSync(folder, { withFileTypes: true })) {
          const path = join(folder, entry.name);
          if (entry.isDirectory()) walk(path);
          else if (entry.name.endsWith('.html')) {
            const html = readFileSync(path, 'utf8');
            const out = html.replace(/<body[\s\S]*<\/body>/, (body) =>
              body.replace(skip, (_match, kept) => kept ?? '<span class="nw">ADS-Nolimit</span>'),
            );
            if (out !== html) writeFileSync(path, out);
          }
        }
      };
      walk(root);
    },
  },
};

/**
 * Trang chuyển hướng /EN/ → /en/ (giống public/vn/index.html).
 *
 * Không đặt ở public/EN/ vì trên Windows/macOS (ổ đĩa không phân biệt hoa thường)
 * thư mục EN và en là MỘT: Astro sẽ bỏ qua trang /en/ thật. Vì vậy file
 * scripts/redirect-EN.html được chép vào dist/EN/index.html sau khi build,
 * và chỉ khi ổ đĩa phân biệt hoa thường (máy build của GitHub Actions là Linux).
 */
export const uppercaseEnRedirect = {
  name: 'uppercase-en-redirect',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      const target = new URL('EN/index.html', dir);
      if (existsSync(target)) {
        logger.info('Ổ đĩa không phân biệt hoa thường: bỏ qua /EN/ (đã có /en/).');
        return;
      }
      mkdirSync(new URL('EN/', dir), { recursive: true });
      copyFileSync(new URL('./redirect-EN.html', import.meta.url), fileURLToPath(target));
      logger.info('Đã tạo /EN/index.html → /en/');
    },
  },
};
