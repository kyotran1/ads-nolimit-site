// Task 2 e2e: thẻ mời cài ứng dụng, khối ở Hồ sơ, chế độ ứng dụng. Chạy trong emulator (xem báo cáo).
const { SHOTS, setupContext, chromium, emu, signIn, watchConsole, step, assert, eq, has, results } = require('./harness.cjs');
const { seedGlobal } = require('./seed.cjs');
const path = require('path');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const FAKE_PROMPT = `
  window.__promptCalls = 0;
  const ev = new Event('beforeinstallprompt');
  ev.prompt = async () => { window.__promptCalls++; };
  ev.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.__adsnlInstall = ev;`;
const STANDALONE = `
  const _mm = window.matchMedia.bind(window);
  window.matchMedia = (q) => /display-mode:\\s*standalone/.test(q)
    ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent() { return false; } }
    : _mm(q);`;
const THROW_STORAGE = `
  if (window.name === 'throwstore') {
    Storage.prototype.getItem = function () { throw new Error('storage blocked'); };
    Storage.prototype.setItem = function () { throw new Error('storage blocked'); };
  }`;

const logs = [];
let n = 0;
const ACC = { vi: '/tai-khoan/', en: '/en/account/' };
const HASH = { vi: { ov: 'tong-quan', pr: 'ho-so' }, en: { ov: 'overview', pr: 'profile' } };

async function open(browser, { lang = 'vi', width = 1440, ua, init = '', wait = true } = {}) {
  const ctx = await setupContext(browser, { viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 2, ...(ua ? { userAgent: ua } : {}) });
  if (init) await ctx.addInitScript(init);
  const now = new Date();
  const u = ctx.fake.addUser({ email: `k${++n}@example.com`, password: 'look-pass-12', displayName: 'Master Eva Truong', emailVerified: true });
  await emu.set(`users/${u.uid}`, { displayName: 'Master Eva Truong', email: u.email, createdAt: now, updatedAt: now });
  await emu.set('wallets/' + u.uid, { uid: u.uid, balance: 1500000, updatedAt: now, lastTx: 'x' });
  await emu.set('orders/o' + n, { uid: u.uid, email: u.email, type: 'product', productId: 'ai-starter-setup', name: 'AI Agent', qty: 1, unitPrice: 4900000, total: 4900000, status: 'paid', note: '', createdAt: now, updatedAt: now });
  const page = await ctx.newPage();
  watchConsole(page, logs);
  await signIn(page, u.email, 'look-pass-12', ACC[lang]);
  await page.waitForSelector('#acc-app:not([hidden])');
  if (wait) await page.waitForSelector('#ov-hello');
  await page.waitForTimeout(700);
  return { ctx, page, u };
}
const cards = (page) => page.$$eval('.install-card', (els) => els.map((e) => ({ mode: e.dataset.install, inView: e.closest('[data-view]')?.dataset.view, text: e.textContent.replace(/\s+/g, ' ').trim(), pos: getComputedStyle(e).position })));
const goto = async (page, lang, which) => { await page.evaluate((x) => (location.hash = x), HASH[lang][which]); await page.waitForTimeout(900); };

(async () => {
  await emu.clear();
  await seedGlobal();
  const browser = await chromium.launch();

  await step('(a) __adsnlInstall có sẵn trước khi nạp → thẻ prompt; bấm Cài → .prompt() gọi 1 lần, thẻ ẩn', async () => {
    const { ctx, page } = await open(browser, { init: FAKE_PROMPT });
    const c = await cards(page);
    eq(c.length, 2, 'thẻ Tổng quan + khối Hồ sơ');
    const ov = c.find((x) => x.inView === 'overview');
    eq(ov.mode, 'prompt', 'dạng thẻ'); has(ov.text, 'Cài ứng dụng ADS-Nolimit', 'tiêu đề'); has(ov.text, 'Để sau', 'nút Để sau');
    eq(ov.pos, 'static', 'không fixed/sticky');
    // thẻ ngay dưới hàng số liệu
    eq(await page.$eval('#ov-stats', (e) => e.nextElementSibling.classList.contains('install-card')), true, 'liền sau #ov-stats');
    await page.click('[data-view="overview"] .install-card .btn-primary');
    await page.waitForTimeout(500);
    eq(await page.evaluate(() => window.__promptCalls), 1, 'số lần .prompt()');
    eq((await cards(page)).length, 0, 'thẻ ẩn sau khi cài');
    eq(await page.$('.install-card'), null, 'không còn trong DOM');
    await ctx.close();
  });

  await step('(a2) sự kiện đến SAU khi mã nạp → thẻ hiện nhờ adsnl-install-ready', async () => {
    const { ctx, page } = await open(browser);
    eq(await page.$('[data-view="overview"] .install-card'), null, 'ban đầu hidden → không chèn gì vào Tổng quan');
    eq((await cards(page)).map((x) => x.mode).join(), 'manual', 'Hồ sơ chỉ có khối hướng dẫn thủ công');
    await page.evaluate(`${FAKE_PROMPT}; window.dispatchEvent(new Event('adsnl-install-ready'));`);
    await page.waitForTimeout(300);
    eq((await cards(page)).find((x) => x.inView === 'overview')?.mode, 'prompt', 'thẻ hiện');
    await ctx.close();
  });

  await step('(b) UA iPhone Safari → thẻ ios với 2 bước + biểu tượng Chia sẻ', async () => {
    const { ctx, page } = await open(browser, { ua: IPHONE, width: 390 });
    const ov = (await cards(page)).find((x) => x.inView === 'overview');
    eq(ov.mode, 'ios', 'dạng ios');
    has(ov.text, 'Thêm vào Màn hình chính', 'bước 2'); has(ov.text, 'Để sau', 'nút');
    eq(await page.$$eval('[data-view="overview"] .install-card .install-steps li', (l) => l.length), 2, '2 bước');
    eq(await page.$$eval('[data-view="overview"] .install-card svg.install-share', (l) => l.length), 1, 'biểu tượng Chia sẻ');
    eq((await cards(page)).find((x) => x.inView === 'profile').mode, 'ios', 'Hồ sơ cũng ios');
    await ctx.close();
  });

  await step('(c) Để sau → ẩn, tải lại không còn thẻ; Hồ sơ vẫn còn khối', async () => {
    const { ctx, page } = await open(browser, { init: FAKE_PROMPT });
    await page.click('[data-view="overview"] .install-card .btn-ghost');
    await page.waitForTimeout(300);
    eq((await cards(page)).find((x) => x.inView === 'overview'), undefined, 'thẻ ẩn ngay');
    const stored = await page.evaluate(() => Number(localStorage.getItem('adsnl-pwa-snooze')));
    const days = (stored - Date.now()) / 86400000;
    assert(days > 29.9 && days <= 30, `hoãn ~30 ngày, got ${days}`);
    await page.evaluate(() => (location.hash = 'tong-quan'));
    await page.reload();
    await page.waitForSelector('#ov-hello');
    await page.waitForTimeout(800);
    eq((await cards(page)).find((x) => x.inView === 'overview'), undefined, 'sau tải lại: không thẻ');
    const pr = (await cards(page)).find((x) => x.inView === 'profile');
    eq(pr?.mode, 'prompt', 'Hồ sơ vẫn có khối');
    eq(pr.text.includes('Để sau'), false, 'khối Hồ sơ không có nút Để sau');
    await goto(page, 'vi', 'pr');
    eq(await page.isVisible('.install-card--profile'), true, 'khối hiện khi mở Hồ sơ');
    // hết hạn hoãn → thẻ lại hiện
    await page.evaluate(() => { localStorage.setItem('adsnl-pwa-snooze', String(Date.now() - 1000)); location.hash = 'tong-quan'; });
    await page.reload();
    await page.waitForSelector('#ov-hello');
    await page.waitForTimeout(800);
    eq((await cards(page)).some((x) => x.inView === 'overview'), true, 'hết hạn → thẻ hiện lại');
    await ctx.close();
  });

  await step('(d) chế độ ứng dụng (standalone) → không thẻ, không khối', async () => {
    const { ctx, page } = await open(browser, { init: STANDALONE + FAKE_PROMPT });
    eq(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches), true, 'giả lập standalone hoạt động');
    eq(await page.$('.install-card'), null, 'không có thẻ nào trong DOM');
    await goto(page, 'vi', 'pr');
    eq(await page.$('.install-card'), null, 'Hồ sơ không có khối');
    await ctx.close();
    const iosApp = await open(browser, { init: STANDALONE, ua: IPHONE, width: 390 });
    eq(await iosApp.page.$('.install-card'), null, 'iOS standalone cũng không có');
    await iosApp.ctx.close();
  });

  await step('(e) localStorage ném lỗi → Tổng quan + Hồ sơ vẫn vẽ đủ', async () => {
    const { ctx, page } = await open(browser, { init: THROW_STORAGE + FAKE_PROMPT });
    await page.evaluate(() => { window.name = 'throwstore'; location.hash = 'tong-quan'; });
    await page.reload();
    await page.waitForSelector('#ov-hello');
    await page.waitForTimeout(1200);
    eq(await page.evaluate(() => { try { localStorage.getItem('x'); return 'ok'; } catch { return 'throws'; } }), 'throws', 'storage thật sự ném lỗi');
    assert((await page.textContent('#ov-hello')).includes('Master Eva'), 'lời chào vẽ');
    eq(await page.$$eval('.stats--3 .stat', (l) => l.length), 3, '3 ô số liệu');
    assert((await page.$$('#ov-tx li')).length >= 0 && (await page.textContent('#ov-balance')).trim() !== '—', 'số dư vẽ');
    eq((await cards(page)).find((x) => x.inView === 'overview')?.mode, 'prompt', 'thẻ vẫn hiện (đọc hoãn lỗi → coi như chưa hoãn)');
    await page.click('[data-view="overview"] .install-card .btn-ghost'); // ghi lỗi → chỉ ẩn trong phiên
    await page.waitForTimeout(300);
    eq((await cards(page)).some((x) => x.inView === 'overview'), false, 'Để sau vẫn ẩn thẻ (trong bộ nhớ)');
    await goto(page, 'vi', 'pr');
    assert((await page.inputValue('#p-name')).includes('Master Eva'), 'Hồ sơ nạp tên');
    eq(await page.isVisible('.install-card--profile'), true, 'khối Hồ sơ vẫn hiện');
    await ctx.close();
  });

  await step('ảnh xem trước: Tổng quan + Hồ sơ × prompt/ios × vi/en × 390/1440', async () => {
    for (const mode of ['prompt', 'ios']) {
      for (const lang of ['vi', 'en']) {
        for (const width of [390, 1440]) {
          const opts = mode === 'ios' ? { ua: IPHONE, lang, width } : { init: FAKE_PROMPT, lang, width };
          const { ctx, page } = await open(browser, opts);
          const tag = `${mode}-${lang}-${width}`;
          await page.screenshot({ path: path.join(SHOTS, `overview-${tag}.png`), fullPage: true });
          const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          eq(over, 0, `không tràn ngang ${tag} (tổng quan)`);
          await goto(page, lang, 'pr');
          await page.screenshot({ path: path.join(SHOTS, `profile-${tag}.png`), fullPage: true });
          eq(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, `không tràn ngang ${tag} (hồ sơ)`);
          await ctx.close();
        }
      }
    }
  });

  console.log(logs.join('\n') || 'no console errors');
  await browser.close();
  if (results.some((r) => !r.ok)) process.exit(1);
})();
