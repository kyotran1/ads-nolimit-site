const { setupContext, chromium, emu, signIn, watchConsole, step, results } = require('/home/claude/ads-nolimit-v4/e2e/pwa/harness.cjs');
const { seedGlobal } = require('/home/claude/ads-nolimit-v4/e2e/pwa/seed.cjs');
const logs = [];
(async () => {
  await emu.clear(); await seedGlobal();
  const browser = await chromium.launch();
  for (const w of [390, 1440]) {
    const ctx = await setupContext(browser, { viewport: { width: w, height: 844 }, deviceScaleFactor: 2 });
    const now = new Date();
    const u = ctx.fake.addUser({ email: `lm${w}@example.com`, password: 'look-pass-12', displayName: 'Khach Thu', emailVerified: true });
    await emu.set(`users/${u.uid}`, { displayName: 'Khach Thu', email: u.email, createdAt: now, updatedAt: now });
    await emu.set('wallets/' + u.uid, { uid: u.uid, balance: 1500000, updatedAt: now, lastTx: 'x' });
    const page = await ctx.newPage(); watchConsole(page, logs);
    await signIn(page, u.email, 'look-pass-12', '/tai-khoan/');
    await page.waitForSelector('#ov-hello'); await page.waitForTimeout(800);
    const bal = () => page.$eval('#ov-stats', (e) => e.textContent.replace(/\s+/g, ' '));
    await step(`${w}: nút Làm mới có biểu tượng + chữ, không tràn ngang`, async () => {
      const i = await page.$eval('#acc-refresh', (b) => ({ text: b.textContent.trim(), svg: !!b.querySelector('svg'), overflow: document.documentElement.scrollWidth - window.innerWidth }));
      if (i.text !== 'Làm mới' || !i.svg || i.overflow > 0) throw new Error(JSON.stringify(i));
    });
    await page.locator('.dash-top').screenshot({ path: `${process.env.SHOTS_DIR}/dau-trang-${w}.png` });
    await emu.set('wallets/' + u.uid, { uid: u.uid, balance: 2750000, updatedAt: new Date(), lastTx: 'y' });
    await step(`${w}: bấm Làm mới → số dư 2.750.000đ + thông báo "Đã cập nhật lúc"`, async () => {
      await page.click('#acc-refresh');
      await page.waitForFunction(() => document.body.textContent.includes('Đã cập nhật lúc'), null, { timeout: 8000 });
      if (!(await bal()).includes('2.750.000')) throw new Error(await bal());
      if (await page.$eval('#acc-refresh', (b) => b.disabled)) throw new Error('nút còn bị khóa');
    });
    await step(`${w}: mất mạng → báo "Không có mạng", số liệu giữ nguyên`, async () => {
      await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
      await page.click('#acc-refresh');
      await page.waitForFunction(() => document.body.textContent.includes('Không có mạng'), null, { timeout: 5000 });
      if (!(await bal()).includes('2.750.000')) throw new Error(await bal());
    });
    await ctx.close();
  }
  const errs = logs.filter((l) => /error/i.test(l.type || ''));
  console.log(errs.length ? 'console: ' + JSON.stringify(errs).slice(0, 300) : 'no console errors');
  await browser.close();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
