// E2E: tài khoản CHÍNH chưa xác minh email vẫn phải thấy TKQC + báo cáo (lỗi thật 25/11/2026).
const H = '/home/claude/ads-nolimit-v4/e2e/pwa/';
const { SHOTS, setupContext, chromium, emu, signIn, watchConsole, step, eq, assert, results, FakeAuth } = require(H + 'harness.cjs');
const { seedGlobal } = require(H + 'seed.cjs');
const path = require('path');
const now = new Date();
const VERIFIED = process.env.VERIFIED === '1';
(async () => {
  await emu.clear();
  await seedGlobal();
  const logs = [];
  const browser = await chromium.launch();
  const fake = new FakeAuth();
  const ctx = await setupContext(browser, { fake, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const A = fake.addUser({ email: 'chinh@example.com', password: 'pass-12345', displayName: 'Chủ Chính', emailVerified: VERIFIED });
  const B = fake.addUser({ email: 'xem1@example.com', password: 'pass-12345', displayName: 'Cổ Đông', emailVerified: true });
  await emu.set(`users/${A.uid}`, { displayName: 'Chủ Chính', email: A.email, createdAt: now, updatedAt: now });
  await emu.set('adAccounts/act_11111', { uid: A.uid, customerEmail: A.email, accountName: 'TK (51323)', label: 'Asian Beauty', service: 'ads', tabPattern: 'BC ADS T11 (x)', lowVnd: 2000000, lowDays: 2, emailAlerts: true, active: true, updatedAt: now, updatedBy: B.uid, viewerUids: [B.uid], viewerEmails: [B.email], memberUids: [A.uid, B.uid], latest: { month: '2026-11', balance: 12131527, totalTopup: 50000000, totalSpend: 37868473, spendYesterday: 2336205, spendToday: 940881, avg7: 2126522, daysLeft: 5, low: false, updatedAt: now } });
  await emu.set('adReports/act_11111_2026-11', { uid: A.uid, memberUids: [A.uid, B.uid], actId: 'act_11111', month: '2026-11', tab: 'BC ADS T11', accountName: 'TK', note: '', topups: [], days: [], totals: { topup: 0, spend: 0, balance: 0, comment: 0, inbox: 0, data: 0, cpd: 0 }, updatedAt: now });
  const page = await ctx.newPage();
  watchConsole(page, logs);
  page.on('requestfailed', (r) => logs.push('REQFAILED ' + r.url().slice(0, 120)));
  page.on('response', async (r) => { if (r.url().includes('runQuery') || r.url().includes('batchGet')) { let b = ''; try { b = (await r.text()).slice(0, 160); } catch {} logs.push(`RESP ${r.status()} ${r.request().postData()?.slice(0, 200)} => ${b.replace(/\s+/g, ' ')}`); } });
  await signIn(page, A.email, 'pass-12345', '/tai-khoan/');
  await page.waitForSelector('#acc-app:not([hidden])');
  await page.evaluate(() => (location.hash = 'bao-cao-ads'));
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(SHOTS, `chinh-${VERIFIED ? 'da' : 'chua'}-xac-minh.png`) });
  await step(`tài khoản chính (${VERIFIED ? 'đã' : 'CHƯA'} xác minh email): thấy 1 thẻ TKQC`, async () => { eq(await page.locator('.rpt-card').count(), 1, 'số thẻ'); });
  await step('mở báo cáo: không báo lỗi', async () => {
    await page.evaluate(() => (location.hash = 'bao-cao-ads/act_11111'));
    await page.waitForTimeout(2500);
    const t = await page.locator('#rpt-box').innerText();
    assert(t.includes('Asian Beauty'), 'không thấy tên TKQC: ' + t.slice(0, 120));
  });
  console.log(logs.join('\n'));
  await browser.close();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
