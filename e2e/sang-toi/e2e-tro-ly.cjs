// Khung trợ lý AI ở hai giao diện. Cần bản build có PUBLIC_TRO_LY_ENDPOINT=https://tro-ly.test/exec
// Dùng: node e2e-tro-ly.cjs <cổng web> <thư mục ảnh>   (trạm được giả bằng page.route, không gọi ra ngoài)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { auditPage } = require('./tuong-phan.cjs');
const BASE = `http://127.0.0.1:${process.argv[2] || 4342}`;
const OUT = process.argv[3] || '/tmp/claude-0/sang-toi/tro-ly';
fs.mkdirSync(OUT, { recursive: true });
const REPLY = { ok: true, reply: 'Chào bạn! Gói **Khởi đầu** xem [bảng giá](https://www.ads-nolimit.agency/bang-gia/).' };
let fail = 0;
const ok = (n, c, x = '') => { if (!c) fail++; console.log(c ? 'ĐẠT ' : 'KHÔNG', n, x); };

(async () => {
  const browser = await chromium.launch();
  for (const w of [1440, 390]) {
    for (const theme of ['toi', 'sang']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w > 600 ? 900 : 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      if (theme === 'sang') await ctx.addInitScript(() => { try { localStorage.setItem('adsnl-theme', 'light'); } catch (e) {} });
      const reqs = [];
      await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
      await ctx.route('https://tro-ly.test/**', (r) => { reqs.push(r.request().method()); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(REPLY) }); });
      const page = await ctx.newPage();
      await page.goto(BASE + '/');
      await page.waitForSelector('.trl-fab');
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
      await page.screenshot({ path: path.join(OUT, `tro-ly-nut-${theme}-${w}.png`) });
      await page.click('.trl-fab');
      await page.waitForSelector('.trl-panel', { state: 'visible' });
      await page.fill('.trl-form textarea', 'Gói khởi đầu giá bao nhiêu?');
      await page.click('.trl-send');
      await page.waitForSelector('.trl-msg--ai:not(.trl-typing)', { timeout: 8000 });
      await page.waitForTimeout(400);
      ok(`${theme} ${w}: có câu trả lời, trạm giả nhận ${reqs.length} yêu cầu`, (await page.locator('.trl-msg--ai a').count()) === 1 && reqs.length >= 1);
      await page.screenshot({ path: path.join(OUT, `tro-ly-khung-${theme}-${w}.png`) });
      if (theme === 'sang') {
        const loi = await auditPage(page);
        ok(`sáng ${w}: tương phản (cả khung chat) không có chỗ nào dưới ngưỡng`, loi.length === 0, JSON.stringify(loi.slice(0, 3)));
        // đổi giao diện khi khung đang mở: khung đổi theo ngay
        const before = await page.evaluate(() => getComputedStyle(document.querySelector('.trl-panel')).backgroundColor);
        await page.evaluate(() => document.querySelector('.theme-toggle') && document.querySelector('.theme-toggle').click());
        await page.waitForTimeout(150);
        const after = await page.evaluate(() => getComputedStyle(document.querySelector('.trl-panel')).backgroundColor);
        ok(`sáng ${w}: bấm nút sáng/tối khi khung đang mở → màu khung đổi (${before} → ${after})`, before !== after && (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === null);
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(fail ? `CÓ ${fail} MỤC KHÔNG ĐẠT` : 'TẤT CẢ ĐẠT');
})();
