// Thanh đầu trang 2 hàng trên điện thoại / máy tính bảng (< 1080px):
//   hàng trên: logo | VI/EN | (Tư vấn miễn phí ≥ 560px) | Menu
//   hàng dưới: "Đăng nhập" | "Tạo tài khoản" (đã đăng nhập: "Tài khoản · tên"), ngay dưới thanh dính, trôi theo trang khi cuộn.
// Menu điện thoại: mục Tài khoản đầu tiên, Ngôn ngữ thứ hai. Trang đăng nhập / đăng ký / quên mật khẩu / tài khoản: không có hàng dưới.
// Chạy: bash e2e/pwa/serve.sh 4350 <dist>; node e2e/nut-dang-nhap/e2e-nut-dang-nhap.cjs [port=4350] [thư mục ảnh]
const { chromium } = require('playwright');
const PORT = process.argv[2] || '4350';
const SHOTS = process.argv[3] || '/tmp/claude-0/nut-dang-nhap';
const BASE = process.env.BASE || `http://127.0.0.1:${PORT}`; // BASE=https://www.ads-nolimit.agency để kiểm trên web thật
require('fs').mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('ĐẠT  ', m); } else { fail++; console.log('KHÔNG', m); } };
const USER = JSON.stringify({ name: 'Nguyễn Văn Khách', initial: 'N' });

const measure = () => {
  const vis = (e) => e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
  const inner = document.querySelector('.header-inner');
  const ib = inner.getBoundingClientRect();
  const kids = [...inner.querySelectorAll('.brand, .header-actions > .lang-switch, .menu-toggle, .header-cta, .acct--desktop')].filter(vis);
  const over = kids.filter((e) => { const b = e.getBoundingClientRect(); return b.right > ib.right + 0.5 || b.left < ib.left - 0.5; }).map((e) => e.className);
  const boxes = kids.map((e) => ({ c: e.className, b: e.getBoundingClientRect() }));
  const overlap = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].b, b = boxes[j].b;
    if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom && b.top < a.bottom) overlap.push(boxes[i].c + ' × ' + boxes[j].c);
  }
  const row2 = document.querySelector('.header-row2');
  const bar = document.querySelector('.acct--bar');
  const su = document.querySelector('.row2-signup');
  const hdr = document.querySelector('.site-header').getBoundingClientRect();
  const mt = document.querySelector('.menu-toggle').getBoundingClientRect();
  const r = {
    over, overlap, pageOverflow: document.documentElement.scrollWidth > innerWidth,
    hasRow2: !!row2, row2Shown: vis(row2) && row2.getBoundingClientRect().height > 20,
    menuW: mt.width, menuH: mt.height, brandW: document.querySelector('.brand').getBoundingClientRect().width,
    hdrH: hdr.height, hdrBottom: hdr.bottom, langInBar: vis(inner.querySelector('.header-actions > .lang-switch')),
  };
  if (bar) {
    const bb = bar.getBoundingClientRect();
    Object.assign(r, { barText: bar.querySelector('.acct-label').textContent, barHref: bar.getAttribute('href'), barH: bb.height, barW: bb.width, barInHeader: Math.abs(row2.getBoundingClientRect().top - hdr.bottom) < 1 && bb.top >= hdr.bottom,
      suShown: vis(su), suHref: su.getAttribute('href'), suH: su.getBoundingClientRect().height, barOverflow: [bar, su, bar.querySelector('.acct-text'), bar.querySelector('.acct-label')].some((e) => vis(e) && e.scrollWidth > e.clientWidth + 1) });
  }
  return r;
};

(async () => {
  const browser = await chromium.launch();
  const widths = [320, 360, 375, 390, 430, 480, 560, 768, 1024, 1079, 1080, 1440];
  for (const signedIn of [false, true]) {
    const who = signedIn ? 'đã ĐN' : 'chưa ĐN';
    for (const w of widths) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1 });
      if (signedIn) await ctx.addInitScript((u) => localStorage.setItem('adsnl-user', u), USER);
      const page = await ctx.newPage();
      const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
      for (const path of ['/', '/en/', '/quang-cao/']) {
        const en = path.startsWith('/en/');
        await page.goto(BASE + path, { waitUntil: 'load' });
        const r = await page.evaluate(measure);
        const tag = `${who} ${w}px ${path}`;
        ok(!r.over.length && !r.overlap.length && !r.pageOverflow, `${tag}: hàng trên không tràn/chồng ${[...r.over, ...r.overlap].join(', ')}`);
        ok((w >= 1080 || (r.menuW >= 44 && r.menuH >= 44)) && r.brandW >= 120, `${tag}: nút Menu ${r.menuW}×${r.menuH}, logo ${Math.round(r.brandW)}px`);
        ok(r.langInBar, `${tag}: VI/EN vẫn ở hàng trên`);
        if (w < 1080) {
          ok(r.row2Shown && r.barInHeader, `${tag}: hàng dưới hiện trong thanh đầu trang (cao ${Math.round(r.hdrH)}px)`);
          const want = signedIn ? (en ? 'Account' : 'Tài khoản') : (en ? 'Sign in' : 'Đăng nhập');
          const href = signedIn ? (en ? '/en/account/' : '/tai-khoan/') : (en ? '/en/sign-in/' : '/dang-nhap/');
          ok(r.barText === want && r.barHref === href, `${tag}: nút "${r.barText}" → ${r.barHref}`);
          ok(signedIn ? !r.suShown : r.suShown && r.suHref === (en ? '/en/sign-up/' : '/dang-ky/'), `${tag}: nút Tạo tài khoản ${r.suShown ? 'hiện → ' + r.suHref : 'ẩn'}`);
          ok(r.barH >= 44 && (signedIn || r.suH >= 44) && !r.barOverflow, `${tag}: nút cao ≥ 44px, chữ không tràn (${r.barH}/${r.suH})`);
        } else ok(!r.row2Shown, `${tag}: màn hình rộng không có hàng dưới`);
      }
      for (const path of ['/dang-nhap/', '/dang-ky/', '/quen-mat-khau/', '/en/sign-in/', '/en/sign-up/']) {
        await page.goto(BASE + path, { waitUntil: 'load' });
        ok(await page.evaluate(() => !document.querySelector('.header-row2')), `${who} ${w}px ${path}: không có hàng dưới`);
      }
      if (w < 1080) {
        // cuộn: hàng trên vẫn dính, hàng dưới trôi theo trang, quay lại đầu trang thì hàng dưới còn nguyên
        await page.goto(BASE + '/', { waitUntil: 'load' });
        await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(300);
        const s1 = await page.evaluate(() => ({ top: document.querySelector('.site-header').getBoundingClientRect().top, row2: document.querySelector('.header-row2').getBoundingClientRect().bottom }));
        ok(Math.abs(s1.top) < 1 && s1.row2 < 0, `${who} ${w}px: cuộn xuống → hàng trên dính ở đỉnh, hàng dưới đã trôi đi`);
        if (w === 390) await page.screenshot({ path: `${SHOTS}/cuon-${signedIn ? 'in' : 'out'}-390.png` });
        await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
        ok((await page.evaluate(measure)).row2Shown, `${who} ${w}px: về đầu trang → hàng dưới hiện`);
        // menu
        await page.click('.menu-toggle');
        const m = await page.evaluate(() => {
          const panel = document.querySelector('.mobile-panel');
          const pb = panel.getBoundingClientRect();
          const groups = [...panel.querySelectorAll('.mobile-group')].map((g) => g.textContent.trim());
          const acct = panel.querySelector('.acct--mobile').getBoundingClientRect();
          const su = panel.querySelector('.mobile-signup');
          return { groups, acctTop: acct.top - pb.top, signupShown: getComputedStyle(su).display !== 'none', bottomOk: pb.bottom <= innerHeight + 1, top: pb.top, hdr: document.querySelector('.site-header').getBoundingClientRect().bottom };
        });
        ok(m.groups[0] === 'Tài khoản' && m.groups[1] === 'Ngôn ngữ' && m.acctTop < 120, `${who} ${w}px menu: ${m.groups.join(' › ')} (tài khoản cách đỉnh ${Math.round(m.acctTop)}px)`);
        ok(signedIn ? !m.signupShown : m.signupShown, `${who} ${w}px menu: nút Tạo tài khoản ${m.signupShown ? 'hiện' : 'ẩn'}`);
        ok(m.bottomOk && Math.abs(m.top - m.hdr) < 2, `${who} ${w}px menu: nằm ngay dưới thanh đầu trang, không quá đáy màn hình`);
        if ([360, 390].includes(w)) await page.screenshot({ path: `${SHOTS}/menu-${signedIn ? 'in' : 'out'}-${w}.png` });
        await page.click('.menu-toggle');
      }
      if ([320, 360, 390, 430, 768, 1440].includes(w)) {
        await page.goto(BASE + '/', { waitUntil: 'load' });
        await page.screenshot({ path: `${SHOTS}/dau-trang-${signedIn ? 'in' : 'out'}-${w}.png`, clip: { x: 0, y: 0, width: w, height: 300 } });
      }
      ok(!errs.length, `${who} ${w}px: không lỗi trang ${errs.join(' | ')}`);
      await ctx.close();
    }
  }
  // trang tài khoản (đã đăng nhập giả, chưa có Firebase thật): không có hàng dưới
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/tai-khoan/', { waitUntil: 'domcontentloaded' });
  ok(await page.evaluate(() => !document.querySelector('.header-row2')), '/tai-khoan/: không có hàng dưới');
  await browser.close();
  console.log(`\nKết quả: ${pass} đạt, ${fail} không đạt`);
  process.exit(fail ? 1 : 0);
})();
