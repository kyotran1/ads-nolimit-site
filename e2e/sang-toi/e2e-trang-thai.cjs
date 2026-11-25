// Giao diện sáng: chữ khi rê chuột / chọn bằng bàn phím phải đọc được; viền chọn bằng bàn phím đủ tương phản;
// đổi giao diện ở tab khác hoặc bấm Quay lại (bfcache) thì trang đồng bộ theo. (Lỗi do kiểm tra độc lập 26/11 tìm ra.)
// Dùng: node e2e/sang-toi/e2e-trang-thai.cjs <cổng web>
const { chromium } = require('playwright');
const BASE = `http://127.0.0.1:${process.argv[2] || 4350}`;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('ĐẠT  ', m); } else { fail++; console.log('KHÔNG', m); } };
const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const PAGE_BG = 'rgb(246, 247, 251)';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('x')) { localStorage.setItem('adsnl-theme', 'light'); sessionStorage.setItem('x', '1'); } } catch {} });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  const color = (sel) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).color);
  // nút phụ (secondary) khi rê chuột
  const sec = 'main .btn:not(.btn-primary):not(.btn-sun):not(.btn-ghost) >> visible=true';
  await page.locator(sec).first().hover(); await page.waitForTimeout(250);
  const c1 = await color(sec);
  ok(ratio(c1, PAGE_BG) >= 4.5, `nút phụ khi rê chuột: chữ ${c1} (tương phản ${ratio(c1, PAGE_BG).toFixed(2)})`);
  // menu Giải pháp đang mở + mục dưới chuột
  await page.click('.nav-desktop .dd > summary'); await page.waitForTimeout(250);
  const c2 = await color('.nav-desktop .dd > summary');
  ok(ratio(c2, PAGE_BG) >= 4.5, `"Giải pháp" khi menu mở: ${c2} (${ratio(c2, PAGE_BG).toFixed(2)})`);
  await page.locator('.dd-panel a').first().hover(); await page.waitForTimeout(250);
  const c3 = await color('.dd-panel a');
  ok(ratio(c3, PAGE_BG) >= 4.5, `mục menu dưới chuột: ${c3} (${ratio(c3, PAGE_BG).toFixed(2)})`);
  await page.keyboard.press('Escape');
  // text-link khi rê chuột
  if (await page.locator('main .text-link >> visible=true').count()) {
    await page.locator('main .text-link >> visible=true').first().hover(); await page.waitForTimeout(250);
    const c4 = await color('main .text-link >> visible=true');
    ok(ratio(c4, 'rgb(255, 255, 255)') >= 4.5, `link chữ khi rê chuột: ${c4} (${ratio(c4, 'rgb(255, 255, 255)').toFixed(2)})`);
  }
  // viền chọn bằng bàn phím
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  const oc = await page.evaluate(() => getComputedStyle(document.activeElement).outlineColor);
  ok(ratio(oc, PAGE_BG) >= 3, `viền chọn bằng bàn phím: ${oc} (${ratio(oc, PAGE_BG).toFixed(2)} ≥ 3)`);
  // tab khác đổi giao diện → tab này theo
  const other = await ctx.newPage();
  await other.goto(BASE + '/bang-gia/', { waitUntil: 'load' });
  await other.click('.theme-toggle'); // sang → tối
  await page.waitForTimeout(400);
  ok((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === null, 'tab khác chuyển sang tối → tab này cũng tối');
  await other.click('.theme-toggle'); // tối → sáng
  await page.waitForTimeout(400);
  ok((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light', 'tab khác chuyển lại sáng → tab này cũng sáng');
  // Quay lại (bfcache)
  await page.goto(BASE + '/bang-gia/', { waitUntil: 'load' });
  await page.click('.theme-toggle'); // → tối
  await page.goBack({ waitUntil: 'load' });
  await page.waitForTimeout(300);
  const t = await page.evaluate(() => [document.documentElement.getAttribute('data-theme'), document.querySelector('meta[name="theme-color"]').content]);
  ok(t[0] === null && t[1] === '#070a1a', `bấm Quay lại sau khi đổi sang tối → trang trước cũng tối (${t})`);
  const lbl = await page.$eval('.theme-toggle', (e) => e.getAttribute('aria-label'));
  ok(/sáng/i.test(lbl), `nhãn nút sau Quay lại đúng: "${lbl}"`);
  await browser.close();
  console.log(`\nKết quả: ${pass} đạt, ${fail} không đạt`);
  process.exit(fail ? 1 : 0);
})();
