// Kiểm nút sáng/tối trên trang tĩnh (không cần emulator). Dùng: node e2e-nut.cjs <cổng web> [thư mục ảnh]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = `http://127.0.0.1:${process.argv[2] || 4340}`;
const OUT = process.argv[3] || '/tmp/claude-0/sang-toi/nut';
fs.mkdirSync(OUT, { recursive: true });
let fail = 0;
const ok = (name, cond, extra = '') => { if (!cond) fail++; console.log(cond ? 'ĐẠT ' : 'KHÔNG', name, extra); };
const theme = (p) => p.evaluate(() => document.documentElement.getAttribute('data-theme'));
const store = (p) => p.evaluate(() => { try { return localStorage.getItem('adsnl-theme'); } catch (e) { return 'LỖI'; } });
const bg = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
const meta = (p) => p.evaluate(() => document.querySelector('meta[name="theme-color"]').content);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  // 1. Mặc định tối, bấm đổi
  await page.goto(BASE + '/');
  ok('mặc định tối (không có data-theme)', (await theme(page)) === null);
  ok('theme-color mặc định tối', (await meta(page)) === '#070a1a');
  const btn = page.locator('.theme-toggle');
  ok('nút là <button type=button>', (await btn.evaluate((e) => e.tagName + ':' + e.type)) === 'BUTTON:button');
  ok('nhãn đang tối = "Chuyển sang giao diện sáng"', (await btn.getAttribute('aria-label')) === 'Chuyển sang giao diện sáng');
  ok('icon sun hiện, moon ẩn khi tối', await page.evaluate(() => getComputedStyle(document.querySelector('.theme-ic-sun')).display !== 'none' && getComputedStyle(document.querySelector('.theme-ic-moon')).display === 'none'));
  await page.evaluate(() => { window.__evt = []; window.addEventListener('adsnl-theme', (e) => window.__evt.push(e.detail && e.detail.theme)); });
  await btn.click();
  ok('bấm → data-theme="light"', (await theme(page)) === 'light');
  ok('ghi localStorage adsnl-theme=light', (await store(page)) === 'light');
  ok('theme-color đổi sang nền sáng', (await meta(page)) === '#f6f7fb');
  ok('nhãn đổi = "Chuyển sang giao diện tối"', (await btn.getAttribute('aria-label')) === 'Chuyển sang giao diện tối');
  ok('icon moon hiện, sun ẩn khi sáng', await page.evaluate(() => getComputedStyle(document.querySelector('.theme-ic-moon')).display !== 'none' && getComputedStyle(document.querySelector('.theme-ic-sun')).display === 'none'));
  ok('nền body sáng ngay', (await bg(page)) === 'rgb(246, 247, 251)', await bg(page));
  ok('phát sự kiện adsnl-theme trên window', JSON.stringify(await page.evaluate(() => window.__evt)) === '["light"]', JSON.stringify(await page.evaluate(() => window.__evt)));
  await page.screenshot({ path: path.join(OUT, 'nut-home-1440-sang.png') });

  // 2. Tải lại + chuyển trang vẫn giữ
  await page.reload();
  ok('tải lại vẫn sáng', (await theme(page)) === 'light');
  await page.goto(BASE + '/bang-gia/');
  ok('chuyển trang (bang-gia) vẫn sáng', (await theme(page)) === 'light');
  await page.goto(BASE + '/en/pricing/');
  ok('trang tiếng Anh vẫn sáng, nhãn tiếng Anh', (await theme(page)) === 'light' && (await page.locator('.theme-toggle').getAttribute('aria-label')) === 'Switch to dark theme');
  await page.locator('.theme-toggle').click();
  ok('bấm lần hai → tối (bỏ thuộc tính), lưu dark', (await theme(page)) === null && (await store(page)) === 'dark');
  ok('theme-color về tối', (await meta(page)) === '#070a1a');
  await page.goto(BASE + '/lien-he/');
  ok('sau khi chọn tối, trang khác vẫn tối', (await theme(page)) === null);

  // 3. Không nháy màu: chụp ngay sau domcontentloaded khi đã chọn sáng
  await page.evaluate(() => localStorage.setItem('adsnl-theme', 'light'));
  for (const url of ['/', '/bang-gia/', '/dang-nhap/']) {
    await page.goto(BASE + url, { waitUntil: 'commit' });
    await page.waitForLoadState('domcontentloaded');
    const state = await page.evaluate(() => ({ t: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor, meta: document.querySelector('meta[name=theme-color]').content }));
    await page.screenshot({ path: path.join(OUT, `nut-dcl-${url.replace(/\//g, '') || 'home'}.png`) });
    ok(`không nháy: ${url} ngay sau domcontentloaded đã sáng`, state.t === 'light' && state.bg === 'rgb(246, 247, 251)' && state.meta === '#f6f7fb', JSON.stringify(state));
  }
  // kiểm điểm ảnh ngay sau DCL: không có điểm tối lớn
  const { PNG } = require('pngjs');
  const png = PNG.sync.read(fs.readFileSync(path.join(OUT, 'nut-dcl-home.png')));
  let dark = 0;
  for (let i = 0; i < png.data.length; i += 4) if (png.data[i] + png.data[i + 1] + png.data[i + 2] < 150) dark++;
  ok('ảnh chụp ngay sau DCL: điểm tối < 3% (chỉ chữ)', dark / (png.width * png.height) < 0.03, (100 * dark / (png.width * png.height)).toFixed(2) + '%');

  // 4. localStorage bị chặn: trang vẫn mở tối, nút vẫn đổi được (chỉ không nhớ)
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctx2.addInitScript(() => {
    const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
    Storage.prototype.getItem = boom; Storage.prototype.setItem = boom; Storage.prototype.removeItem = boom;
  });
  await ctx2.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on('pageerror', (e) => errs2.push(String(e)));
  await p2.goto(BASE + '/');
  ok('localStorage chặn: trang mở tối', (await theme(p2)) === null && (await bg(p2)) === 'rgb(7, 10, 26)', await bg(p2));
  await p2.locator('.theme-toggle').click();
  ok('localStorage chặn: bấm vẫn đổi sang sáng', (await theme(p2)) === 'light');
  ok('localStorage chặn: không có lỗi trang', errs2.length === 0, errs2.join(' | '));
  await ctx2.close();

  // 5. Khóa = light nhưng trang /offline/ luôn tối
  await page.evaluate(() => localStorage.setItem('adsnl-theme', 'light'));
  await page.goto(BASE + '/offline/');
  ok('/offline/ luôn tối dù khóa = light', (await theme(page)) === null && (await bg(page)) === 'rgb(7, 10, 26)', await bg(page));

  // 6. Điện thoại: nút ≥ 40×40, không tràn ngang ở 360 và 390; bấm được
  for (const w of [360, 390, 320]) {
    const c = await browser.newContext({ viewport: { width: w, height: 800 }, hasTouch: true, serviceWorkers: 'block' });
    await c.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    const m = await c.newPage();
    await m.goto(BASE + '/');
    const r = await m.locator('.theme-toggle').boundingBox();
    const sw = await m.evaluate(() => document.documentElement.scrollWidth);
    ok(`${w}px: nút ${Math.round(r.width)}×${Math.round(r.height)} ≥ 40×40`, r.width >= 40 && r.height >= 40);
    ok(`${w}px: không tràn ngang (scrollWidth ${sw})`, sw <= w);
    const menu = await m.locator('.menu-toggle').boundingBox();
    ok(`${w}px: nút sáng/tối và nút Menu không đè nhau`, r.x + r.width <= menu.x + 0.5);
    await m.locator('.theme-toggle').tap();
    ok(`${w}px: chạm vào nút đổi được`, (await theme(m)) === 'light');
    if (w === 360) { await m.screenshot({ path: path.join(OUT, 'nut-header-360-sang.png'), clip: { x: 0, y: 0, width: 360, height: 80 } }); }
    await c.close();
  }
  ok('không có lỗi JS trên trang', errs.length === 0, errs.join(' | '));
  await browser.close();
  console.log(fail ? `CÓ ${fail} MỤC KHÔNG ĐẠT` : 'TẤT CẢ ĐẠT');
  process.exit(fail ? 1 : 0);
})();
