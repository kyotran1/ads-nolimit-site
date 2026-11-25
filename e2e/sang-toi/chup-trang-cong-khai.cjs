// Chụp mọi trang tĩnh (danh sách lấy từ dist/**/index.html) ở 1440×900 và 390×844.
// Dùng: node chup-trang-cong-khai.cjs <cổng web> <thư mục dist> <thư mục ảnh ra> [sang|toi]
// Không JS động: chặn mọi yêu cầu ra ngoài, tắt hoạt ảnh để ảnh ổn định giữa hai lần chụp.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [port, dist, out, theme = 'toi'] = process.argv.slice(2);
const BASE = `http://127.0.0.1:${port}`;
fs.mkdirSync(out, { recursive: true });

const walk = (d, acc = []) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, acc);
    else if (f.name === 'index.html') acc.push(p);
  }
  return acc;
};
const pages = walk(dist)
  .map((p) => '/' + path.relative(dist, path.dirname(p)).split(path.sep).join('/'))
  .map((p) => (p === '/.' ? '/' : p + '/'))
  .map((p) => p.replace('//', '/'))
  .filter((p) => !/http-equiv="refresh"/i.test(fs.readFileSync(path.join(dist, p, 'index.html'), 'utf8'))) // bỏ trang chuyển hướng (/EN/)
  .sort();

if (process.env.ONLY) pages.splice(0, pages.length, ...pages.filter((p) => new RegExp(process.env.ONLY).test(p)));
const slug = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '_'));

(async () => {
  const browser = await chromium.launch();
  for (const w of [1440, 390]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: w > 600 ? 900 : 844 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    if (theme === 'sang') await ctx.addInitScript(() => { try { localStorage.setItem('adsnl-theme', 'light'); } catch (e) {} });
    await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    const page = await ctx.newPage();
    for (const p of pages) {
      await page.goto(BASE + p, { waitUntil: 'load' });
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(out, `${slug(p)}-${w}.png`), fullPage: true });
    }
    await ctx.close();
  }
  await browser.close();
  console.log('xong', pages.length, 'trang ->', out);
})();
