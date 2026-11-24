import type { APIRoute } from 'astro';
import { strategyFor } from '../lib/pwa/strategy';

/**
 * /sw.js — service worker tối giản, sinh lúc build (cách B trong docs/superpowers/specs/2026-11-24-pwa-design.md).
 *  - Trang HTML luôn lấy từ mạng (nên luôn là bản mới nhất); chỉ khi LỖI MẠNG mới hiện /offline/.
 *    404/500 có mạng vẫn hiện đúng trang đó.
 *  - Chỉ giữ trên máy tệp gắn mã băm /_astro/*, phông, icon (đổi nội dung là đổi tên nên không thể cũ).
 *  - Không đụng tới yêu cầu khác tên miền (Firebase/Google/SePay/QR) và mọi yêu cầu không phải GET.
 * Mỗi lần build có mốc BUILD riêng → tên kho mới → kho cũ bị xóa ở bước activate.
 */
const BUILD = new Date().toISOString().replace(/\D/g, '').slice(0, 14);

const body = `// ADS-Nolimit service worker — tự sinh lúc build, đừng sửa tay.
const BUILD = '${BUILD}';
const CACHE = 'adsnl-' + BUILD;
const strategyFor = ${strategyFor.toString()};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['/offline/', '/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.indexOf('adsnl-') === 0 && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const kind = strategyFor({ method: request.method, url: request.url, mode: request.mode }, self.location.origin);
  if (kind === 'pass') return;

  if (kind === 'page') {
    // Mạng trước. Có phản hồi (kể cả 404/500) → trả nguyên; chỉ lỗi mạng mới sang trang offline.
    // cache: 'no-cache' = luôn hỏi lại máy chủ (không dùng bản trong bộ nhớ đệm HTTP của trình duyệt, vd GitHub Pages max-age=600)
    // nên trang HTML mới đăng là thấy ngay; không đổi thì máy chủ trả 304, gần như không tốn băng thông.
    // Nếu trình duyệt nào đó từ chối yêu cầu có tùy chọn → thử lại y nguyên một lần; cả hai cùng hỏng mới coi là mất mạng.
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .catch(() => fetch(request))
        .catch(() => caches.match('/offline/').then((r) => r || Response.error())),
    );
    return;
  }

  // asset: lấy trên máy trước, chưa có thì tải rồi lưu (chỉ phản hồi ok + cùng nguồn).
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          // Giữ service worker sống tới khi lưu xong; hết chỗ lưu thì bỏ qua.
          event.waitUntil(
            caches
              .open(CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => {}),
          );
        }
        return res;
      });
    }),
  );
});
`;

export const GET: APIRoute = () =>
  new Response(body, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
