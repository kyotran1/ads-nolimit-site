// Tên class / id / tệp không được trông giống quảng cáo: trình chặn quảng cáo (Cốc Cốc, Brave, uBlock, AdGuard…) sẽ ẩn phần tử hoặc chặn tệp.
// Lỗi thật 25/11/2026: class "ad-card" có trong EasyList (##.ad-card) → khách dùng Cốc Cốc thấy trang Báo cáo quảng cáo trống.
// Kiểm tra đầy đủ với danh sách chặn thật: e2e/chan-quang-cao/. Test này là hàng rào rẻ, chạy mỗi lần `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const files = walk(SRC).filter((f) => /\.(astro|ts|css)$/.test(f));

// Từ "trông giống quảng cáo" đứng thành một phần riêng trong tên có gạch nối: ad-card, ov-ads-low, top-banner-ad, sponsor-box…
const RISKY = /(?<![\w-])(?:[a-z0-9]+-)*(?:ad|ads|adv|advert|advertisement|adsense|sponsor|sponsored|banner-ad|quangcao)(?:-[a-z0-9]+)*(?![\w-])/g;
// Được phép: tên thương hiệu / dự án Firebase, giá trị dữ liệu (không phải class hay id), #neo của trang.
const ALLOWED = new Set(['ads-nolimit', 'ads-nolimit-web', 'ad-budget', 'ad-reports', 'bao-cao-ads', 'ads', 'ad', 'adv', 'sponsor', 'sponsored', 'advert', 'advertisement']);

test('không có tên class / id nào trông giống quảng cáo trong src/', () => {
  const bad = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(RISKY)) {
      if (!m[0].includes('-') || ALLOWED.has(m[0]) || m[0].startsWith('ads-nolimit')) continue;
      bad.push(`${f.slice(SRC.length + 1)}: ${m[0]}`);
    }
  }
  assert.deepEqual([...new Set(bad)], [], 'Đổi các tên này sang tiền tố trung tính (vd rpt-…): trình chặn quảng cáo sẽ ẩn chúng');
});

test('không có tên tệp mã nào trong src/ trông giống quảng cáo (tên tệp có thể thành tên tệp JS/CSS khi build)', () => {
  // Trang trong src/pages/ là địa chỉ trang (vd /en/advertising/), trình chặn quảng cáo không chặn trang chính → không xét.
  const bad = files
    .map((f) => f.slice(SRC.length + 1))
    .filter((f) => !f.startsWith('pages/'))
    .filter((f) => /(^|[._-])(ads?|advert\w*|sponsor\w*|banner)([._-]|$)/i.test(f.split('/').pop().replace(/\.(astro|ts|css)$/, '')));
  assert.deepEqual(bad, [], 'Đổi tên tệp: một số trình chặn quảng cáo chặn cả tệp có tên như ads.js, ad-*.js');
});
