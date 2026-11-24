// E2E: nhiều người xem TKQC. Chạy trong emulators:exec (xem rules/README trong báo cáo).
const H = '/home/claude/ads-nolimit-v4/e2e/pwa/';
const { BASE, SHOTS, setupContext, chromium, emu, signIn, watchConsole, step, assert, eq, has, results } = require(H + 'harness.cjs');
const { seedGlobal } = require(H + 'seed.cjs');
const path = require('path');

const days = Array.from({ length: 12 }, (_, k) => { const c = 5 + k, i = 40 + k * 3, s = 1200000 + k * 90000; const data = c + i; return { date: `2026-11-${String(k + 1).padStart(2, '0')}`, comment: c, inbox: i, data, cpd: Math.round(s / data), spend: s }; });
const topups = [{ date: '', label: 'SỐ DƯ T10', amount: 8048472 }, { date: '2026-11-05', label: '', amount: 10000000 }, { date: '2026-11-10', label: '', amount: 10000000 }];
const sp = days.reduce((a, x) => a + x.spend, 0), tp = topups.reduce((a, x) => a + x.amount, 0);
const totals = { topup: tp, spend: sp, balance: tp - sp, comment: 0, inbox: 0, data: 0, cpd: 0 };
const note = 'CHUYỂN KHOẢN TOPUP NGÂN SÁCH CHẠY ADS + 10% PHÍ\n\nCẢM ƠN QUÝ KHÁCH HÀNG ĐỐI TÁC';
const now = new Date();
const acct = (uid, email, label, extra = {}) => ({ uid, customerEmail: email, accountName: label + ' (TK)', label, service: 'ads', tabPattern: 'x - ' + label, lowVnd: 3000000, lowDays: 3, emailAlerts: true, active: true, updatedAt: now, updatedBy: 'x', latest: { month: '2026-11', balance: totals.balance, totalTopup: tp, totalSpend: sp, spendYesterday: 1500000, spendToday: 100000, avg7: 1500000, daysLeft: 5, low: false, updatedAt: now }, ...extra });
const report = (actId, uid, extra = {}) => ({ uid, actId, month: '2026-11', tab: 'BC ADS T11', accountName: actId, note, topups, days, totals, updatedAt: now, ...extra });
const bannerMsg = 'Chưa có báo cáo';

(async () => {
  await emu.clear();
  await seedGlobal();
  const logs = [];
  const browser = await chromium.launch();
  const fake = new (require(H + 'harness.cjs').FakeAuth)();
  const mk = async (email, name, width = 1440) => {
    const ctx = await setupContext(browser, { fake, viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 2 });
    const u = fake.byEmail(email) || fake.addUser({ email, password: 'pass-12345', displayName: name, emailVerified: true });
    await emu.set(`users/${u.uid}`, { displayName: name, email, createdAt: new Date(), updatedAt: new Date() });
    const page = await ctx.newPage();
    watchConsole(page, logs);
    return { ctx, u, page };
  };
  // người dùng giả
  const A = await mk('chinh@example.com', 'Chủ Chính');
  const B = await mk('xem1@example.com', 'Cổ Đông Một');
  const C = await mk('ngoai@example.com', 'Người Ngoài');
  // act_11111: mới (có memberUids) · act_22222: tài liệu cũ chỉ của chính · act_33333: của người ngoài
  await emu.set('adAccounts/act_11111', acct(A.u.uid, A.u.email, 'K-Aura', { viewerUids: [B.u.uid], viewerEmails: [B.u.email], memberUids: [A.u.uid, B.u.uid] }));
  await emu.set('adAccounts/act_22222', acct(A.u.uid, A.u.email, 'Spa Cũ'));
  await emu.set('adAccounts/act_33333', acct(C.u.uid, C.u.email, 'Riêng Ngoài', { viewerUids: [], viewerEmails: [], memberUids: [C.u.uid] }));
  await emu.set('adReports/act_11111_2026-11', report('act_11111', A.u.uid, { memberUids: [A.u.uid, B.u.uid] }));
  await emu.set('adReports/act_22222_2026-11', report('act_22222', A.u.uid));
  await emu.set('adReports/act_33333_2026-11', report('act_33333', C.u.uid, { memberUids: [C.u.uid] }));

  const open = async (X, hash = '') => { await signIn(X.page, X.u.email, 'pass-12345', '/tai-khoan/'); await X.page.waitForSelector('#acc-app:not([hidden])'); if (hash) { await X.page.evaluate((h) => (location.hash = h), hash); await X.page.waitForTimeout(1800); } };
  const cardCount = (p) => p.locator('.ad-card').count();
  const pageText = (p) => p.locator('main, body').first().innerText();

  console.log('— Người xem thêm —');
  await open(B, 'bao-cao-ads');
  await step('xem thêm: thấy đúng 1 thẻ TKQC (K-Aura), không thấy TKQC khác', async () => {
    eq(await cardCount(B.page), 1, 'số thẻ');
    has(await B.page.locator('.ad-card').first().innerText(), 'K-Aura', 'thẻ');
    const t = await pageText(B.page);
    assert(!t.includes('Spa Cũ') && !t.includes('Riêng Ngoài'), 'lộ TKQC khác');
  });
  await step('xem thêm: mở báo cáo → thấy bảng báo cáo, không phải "Chưa có báo cáo"', async () => {
    await B.page.evaluate(() => (location.hash = 'bao-cao-ads/act_11111'));
    await B.page.waitForSelector('.xv', { timeout: 8000 });
    const t = await pageText(B.page);
    assert(!t.includes(bannerMsg), 'hiện "Chưa có báo cáo"');
    assert((await B.page.locator('.xv-view').count()) > 0, 'không có bảng .xv-view');
  });
  await step('xem thêm: mục Báo cáo quảng cáo không bị khóa', async () => {
    eq(await B.page.locator('[data-locked="ads"]').count(), 0, 'locked-view');
  });
  await step('xem thêm: Tổng quan có thẻ dịch vụ tự động (K-Aura)', async () => {
    await B.page.evaluate(() => (location.hash = 'overview'));
    await B.page.waitForTimeout(1500);
    const t = await B.page.locator('#ov-services').innerText();
    has(t, 'K-Aura', 'thẻ dịch vụ');
    eq(await B.page.locator('#ov-ads').innerText(), '1', 'số TKQC ở Tổng quan');
  });
  await B.page.screenshot({ path: path.join(SHOTS, 'xem-them-1440-overview.png'), fullPage: true });
  await B.page.evaluate(() => (location.hash = 'bao-cao-ads/act_11111'));
  await B.page.waitForTimeout(1500);
  await B.page.screenshot({ path: path.join(SHOTS, 'xem-them-1440-bao-cao.png'), fullPage: true });

  await step('xem thêm: tạo được lệnh "Nạp thêm ngân sách" (adTopups.uid = xem thêm)', async () => {
    const btn = B.page.locator('button:has-text("Nạp thêm ngân sách")').first();
    await btn.scrollIntoViewIfNeeded();
    await btn.click({ timeout: 8000 });
    await B.page.waitForSelector('.at-form');
    await B.page.fill('#at-custom', '15000000');
    await B.page.waitForTimeout(200);
    await B.page.click('.at-form button[type=submit]');
    await B.page.waitForSelector('.at-qr svg', { timeout: 8000 });
    const docs = await emu.all('adTopups');
    eq(docs.length, 1, 'số lệnh nạp');
    eq(docs[0].uid, B.u.uid, 'uid lệnh nạp');
    eq(docs[0].actId, 'act_11111', 'actId');
    await B.page.screenshot({ path: path.join(SHOTS, 'xem-them-1440-nap.png') });
  });

  console.log('— Tài khoản chính —');
  await open(A, 'bao-cao-ads');
  await step('chính: thấy đúng 2 thẻ (act_11111 khớp cả hai truy vấn không bị trùng + act_22222 tài liệu cũ)', async () => {
    eq(await cardCount(A.page), 2, 'số thẻ');
    const t = await pageText(A.page);
    eq(t.split('K-Aura').length - 1 >= 1, true, 'có K-Aura');
    has(t, 'Spa Cũ', 'TKQC cũ');
    assert(!t.includes('Riêng Ngoài'), 'lộ TKQC người ngoài');
  });
  await step('chính: báo cáo không bị nhân đôi (đúng 2 tab: mỗi TKQC một báo cáo)', async () => {
    await A.page.evaluate(() => (location.hash = 'bao-cao-ads/act_11111'));
    await A.page.waitForSelector('.xv', { timeout: 8000 });
    eq(await A.page.locator('.xv-tab').count(), 2, 'số tab báo cáo');
  });
  await step('chính: không thấy lệnh nạp của người xem thêm (mỗi người chỉ thấy lệnh của mình)', async () => {
    const t = await pageText(A.page);
    assert(!t.includes('ADSB'), 'thấy mã lệnh nạp của người khác');
  });

  console.log('— Người ngoài —');
  await open(C, 'bao-cao-ads');
  await step('ngoài: chỉ thấy TKQC của chính mình, không thấy K-Aura / Spa Cũ', async () => {
    eq(await cardCount(C.page), 1, 'số thẻ');
    const t = await pageText(C.page);
    assert(!t.includes('K-Aura') && !t.includes('Spa Cũ'), 'lộ TKQC');
  });
  const D = await mk('khongco@example.com', 'Không Có');
  await open(D, 'bao-cao-ads');
  await step('khách không liên quan gì: 0 thẻ, không lỗi tải', async () => {
    eq(await cardCount(D.page), 0, 'số thẻ');
  });

  console.log('— Gỡ người xem thêm —');
  await emu.set('adAccounts/act_11111', acct(A.u.uid, A.u.email, 'K-Aura', { viewerUids: [], viewerEmails: [], memberUids: [A.u.uid] }));
  await emu.set('adReports/act_11111_2026-11', report('act_11111', A.u.uid, { memberUids: [A.u.uid] }));
  await B.page.reload();
  await B.page.waitForSelector('#acc-app:not([hidden])');
  await B.page.evaluate(() => (location.hash = 'bao-cao-ads'));
  await B.page.waitForTimeout(2000);
  await step('bị gỡ: hết thẻ TKQC và không có lỗi tải', async () => {
    eq(await cardCount(B.page), 0, 'số thẻ');
    const t = await pageText(B.page);
    assert(!t.includes('K-Aura'), 'còn thấy K-Aura');
  });
  await B.page.screenshot({ path: path.join(SHOTS, 'bi-go-1440.png'), fullPage: true });

  // ảnh 390 cho người xem thêm (trả lại quyền)
  await emu.set('adAccounts/act_11111', acct(A.u.uid, A.u.email, 'K-Aura', { viewerUids: [B.u.uid], viewerEmails: [B.u.email], memberUids: [A.u.uid, B.u.uid] }));
  await emu.set('adReports/act_11111_2026-11', report('act_11111', A.u.uid, { memberUids: [A.u.uid, B.u.uid] }));
  const B2 = await mk('xem1@example.com', 'Cổ Đông Một', 390);
  await open(B2, 'bao-cao-ads');
  await B2.page.screenshot({ path: path.join(SHOTS, 'xem-them-390-danh-sach.png'), fullPage: true });
  await B2.page.evaluate(() => (location.hash = 'bao-cao-ads/act_11111'));
  await B2.page.waitForSelector('.xv');
  await B2.page.waitForTimeout(1200);
  await B2.page.screenshot({ path: path.join(SHOTS, 'xem-them-390-bao-cao.png'), fullPage: true });
  await B2.page.evaluate(() => (location.hash = 'overview'));
  await B2.page.waitForTimeout(1500);
  await B2.page.screenshot({ path: path.join(SHOTS, 'xem-them-390-overview.png'), fullPage: true });
  const ov = await B2.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await step('390px: không tràn ngang', async () => eq(ov <= 0, true, 'tràn ' + ov + 'px'));

  const bad = logs.filter((l) => !/favicon|manifest|Failed to load resource.*(404|net::)/.test(l));
  console.log('console:', bad.join('\n') || 'sạch');
  console.log(`KẾT QUẢ: ${results.filter((r) => r.ok).length}/${results.length} PASS`);
  await browser.close();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
