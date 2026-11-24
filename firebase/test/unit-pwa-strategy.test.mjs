// Test đơn vị thuần: hàm chọn chiến lược của service worker (src/lib/pwa/strategy.ts). Chạy: npm run test:unit
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { strategyFor } from '../../src/lib/pwa/strategy.ts';

const ORIGIN = 'https://www.ads-nolimit.agency';
const abs = (p) => ORIGIN + p;
const get = (url, mode = 'no-cors') => strategyFor({ method: 'GET', url, mode }, ORIGIN);

describe('strategyFor', () => {
  test('điều hướng trang cùng tên miền → page', () => {
    assert.equal(get(abs('/tai-khoan/?src=pwa'), 'navigate'), 'page');
    assert.equal(get(abs('/en/account/'), 'navigate'), 'page');
    assert.equal(get(abs('/'), 'navigate'), 'page');
  });
  test('tệp gắn mã băm /_astro/, phông, icon → asset', () => {
    assert.equal(get(abs('/_astro/main.abc123.js')), 'asset');
    assert.equal(get(abs('/_astro/x.woff2'), 'cors'), 'asset');
    for (const p of ['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png', '/favicon-32.png']) {
      assert.equal(get(abs(p)), 'asset', p);
    }
  });
  test('không phải GET → pass', () => {
    assert.equal(strategyFor({ method: 'POST', url: abs('/tai-khoan/'), mode: 'navigate' }, ORIGIN), 'pass');
    assert.equal(strategyFor({ method: 'PUT', url: abs('/_astro/a.js'), mode: 'cors' }, ORIGIN), 'pass');
  });
  test('khác tên miền → pass', () => {
    assert.equal(get('https://firestore.googleapis.com/v1/projects/x/databases/(default)/documents', 'cors'), 'pass');
    assert.equal(get('https://identitytoolkit.googleapis.com/v1/accounts:lookup', 'cors'), 'pass');
    assert.equal(get('https://img.vietqr.io/image/x.png'), 'pass');
    assert.equal(get('https://evil.example/_astro/a.js'), 'pass');
    assert.equal(get('https://www.ads-nolimit.agency.evil.example/_astro/a.js'), 'pass');
  });
  test('tệp khác cùng tên miền → pass', () => {
    for (const p of ['/sw.js', '/site.webmanifest', '/site.en.webmanifest', '/sitemap.xml', '/logo.png', '/sounds/chat-send.mp3']) {
      assert.equal(get(abs(p), 'cors'), 'pass', p);
      assert.equal(get(abs(p), 'no-cors'), 'pass', p);
    }
  });
  test('điều hướng tới tệp tĩnh (không phải trang) vẫn là page, không phải asset', () => {
    assert.equal(get(abs('/_astro/a.js'), 'navigate'), 'page');
  });
  test('URL không hợp lệ → pass, không ném lỗi', () => {
    assert.equal(get('not a url'), 'pass');
    assert.equal(get(''), 'pass');
  });
});
