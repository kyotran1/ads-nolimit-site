// Quay lại trang sau ≥5 phút → số dư tự tải lại; <5 phút → không.
const { setupContext, chromium, emu, signIn, watchConsole, step, eq, results } = require('./harness.cjs');
const { seedGlobal } = require('./seed.cjs');
const logs = [];
const hideShow = (page, ms) => page.evaluate((ms) => {
  let hidden = true;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
  const real = Date.now; const t = real() + ms; Date.now = () => t;
  hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  Date.now = real;
}, ms);
const bal = (page) => page.$eval('#ov-stats', (e) => e.textContent.replace(/\s+/g, ' '));
(async () => {
  await emu.clear(); await seedGlobal();
  const browser = await chromium.launch();
  const ctx = await setupContext(browser, { viewport: { width: 390, height: 844 } });
  const now = new Date();
  const u = ctx.fake.addUser({ email: 'r1@example.com', password: 'look-pass-12', displayName: 'Khach Thu', emailVerified: true });
  await emu.set(`users/${u.uid}`, { displayName: 'Khach Thu', email: u.email, createdAt: now, updatedAt: now });
  await emu.set('wallets/' + u.uid, { uid: u.uid, balance: 1500000, updatedAt: now, lastTx: 'x' });
  const page = await ctx.newPage(); watchConsole(page, logs);
  await signIn(page, u.email, 'look-pass-12', '/tai-khoan/');
  await page.waitForSelector('#ov-hello'); await page.waitForTimeout(900);
  await step('ban đầu 1.500.000đ', async () => { if (!(await bal(page)).includes('1.500.000')) throw new Error(await bal(page)); });
  await emu.set('wallets/' + u.uid, { uid: u.uid, balance: 2750000, updatedAt: new Date(), lastTx: 'y' });
  await step('ẩn 2 phút rồi quay lại → vẫn số cũ (không tải lại)', async () => {
    await hideShow(page, 2 * 60 * 1000); await page.waitForTimeout(1200);
    if (!(await bal(page)).includes('1.500.000')) throw new Error(await bal(page));
  });
  await step('ẩn 6 phút rồi quay lại → số dư mới 2.750.000đ', async () => {
    await hideShow(page, 6 * 60 * 1000); await page.waitForTimeout(1500);
    if (!(await bal(page)).includes('2.750.000')) throw new Error(await bal(page));
  });
  await step('mất mạng: ẩn 6 phút rồi quay lại → giữ số liệu, không báo lỗi', async () => {
    await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
    await hideShow(page, 6 * 60 * 1000); await page.waitForTimeout(1000);
    if (!(await bal(page)).includes('2.750.000')) throw new Error(await bal(page));
  });
  const errs = logs.filter((l) => /error/i.test(l.type || l));
  console.log(errs.length ? 'console: ' + JSON.stringify(errs).slice(0, 400) : 'no console errors');
  await browser.close();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
