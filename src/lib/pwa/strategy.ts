/**
 * Chọn cách service worker xử lý một yêu cầu. Hàm thuần, TỰ CHỨA (không gọi hàm/hằng nào ngoài chuẩn JS)
 * vì được nhúng nguyên văn vào /sw.js bằng strategyFor.toString() (xem src/pages/sw.js.ts).
 *   'page'  → điều hướng trang: luôn mạng trước, lỗi mạng mới sang /offline/
 *   'asset' → tệp gắn mã băm /_astro/, phông, icon: lấy trên máy trước
 *   'pass'  → không đụng tới (khác tên miền, không phải GET, mọi thứ còn lại)
 */
export function strategyFor(req: { method: string; url: string; mode: string }, origin: string): 'page' | 'asset' | 'pass' {
  if (req.method !== 'GET') return 'pass';
  let u: URL;
  try {
    u = new URL(req.url);
  } catch (e) {
    return 'pass';
  }
  if (u.origin !== origin) return 'pass';
  if (req.mode === 'navigate') return 'page';
  const p = u.pathname;
  if (p.indexOf('/_astro/') === 0) return 'asset';
  if (/^\/(icon-192|icon-512|icon-maskable-512|apple-touch-icon|favicon-16|favicon-32)\.png$/.test(p)) return 'asset';
  if (/\.(woff2?|ttf|otf)$/.test(p)) return 'asset';
  return 'pass';
}
