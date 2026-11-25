// Chụp trang Tài khoản (khách) hoặc Quản trị (chủ) khi đã đăng nhập (đăng nhập giả + emulator Firestore).
// Biến môi trường: WEB_PORT, EMU_PORT, SHOTS_DIR, THEME=toi|sang, ROLE=khach|quan-tri
// Chạy trong: firebase emulators:exec --only firestore --project demo-ads-nolimit "node e2e/sang-toi/e2e-chup-tai-khoan.cjs"
const H = '../pwa/';
const { SHOTS, setupContext, chromium, emu, signIn, watchConsole } = require(H + 'harness.cjs');
const { seedGlobal, seedCustomer } = require(H + 'seed.cjs');
const path = require('path');
const { auditPage } = require('./tuong-phan.cjs');
const CONTRAST = process.env.CONTRAST === '1';
const groups = new Map();

const THEME = process.env.THEME || 'toi';
const ROLE = process.env.ROLE || 'khach';
const NO_ANIM = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
const INSTALL = `window.__adsnlInstall = Object.assign(new Event('beforeinstallprompt'), { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) });`;

const days = Array.from({ length: 12 }, (_, k) => { const c = 5 + k, i = 40 + k * 3, s = 1200000 + k * 90000; const data = c + i; return { date: `2026-11-${String(k + 1).padStart(2, '0')}`, comment: c, inbox: i, data, cpd: Math.round(s / data), spend: s }; });
const topups = [{ date: '', label: 'SỐ DƯ T10', amount: 8048472 }, { date: '2026-11-05', label: '', amount: 10000000 }, { date: '2026-11-10', label: '', amount: 10000000 }];
const sp = days.reduce((a, x) => a + x.spend, 0), tp = topups.reduce((a, x) => a + x.amount, 0);
const totals = { topup: tp, spend: sp, balance: tp - sp, comment: 0, inbox: 0, data: 0, cpd: 0 };
const note = 'CHUYỂN KHOẢN TOPUP NGÂN SÁCH CHẠY ADS + 10% PHÍ\n\nCẢM ƠN QUÝ KHÁCH HÀNG ĐỐI TÁC';
const now = new Date();
const acct = (uid, email, label, extra = {}) => ({ uid, customerEmail: email, accountName: label + ' (TK)', label, service: 'ads', tabPattern: 'x - ' + label, lowVnd: 3000000, lowDays: 3, emailAlerts: true, active: true, updatedAt: now, updatedBy: 'x', latest: { month: '2026-11', balance: totals.balance, totalTopup: tp, totalSpend: sp, spendYesterday: 1500000, spendToday: 100000, avg7: 1500000, daysLeft: 5, low: false, updatedAt: now }, ...extra });
const report = (actId, uid, extra = {}) => ({ uid, actId, month: '2026-11', tab: 'BC ADS T11', accountName: actId, note, topups, days, totals, updatedAt: now, ...extra });

const KHACH = ['tong-quan', 'nap-tien', 'don-hang', 'bao-cao-ads', 'bao-cao-ads/act_11111', 'dich-vu', 'khoa-hoc', 'khoa-hoc/ai-co-ban', 'huong-dan', 'huong-dan/nap-tien', 'key-may', 'ho-so', 'bao-mat'];
const QUAN_TRI = ['tong-quan', 'nap-tien', 'don-hang', 'yeu-cau', 'khach-hang', 'tai-khoan-quang-cao', 'key-may', 'noi-dung', 'cai-dat'];

(async () => {
  await emu.clear();
  await seedGlobal();
  const browser = await chromium.launch();
  const fake = new (require(H + 'harness.cjs').FakeAuth)();
  const owner = fake.addUser({ email: 'owner@example.com', password: 'owner-pass-1234', displayName: 'Chủ ADS', emailVerified: true });
  const lan = fake.addUser({ email: 'lan@example.com', password: 'pass-12345', displayName: 'Lan Nguyễn', emailVerified: true });
  await emu.set(`admins/${owner.uid}`, { name: 'Chủ' });
  await seedCustomer(lan.uid, lan.email);
  await emu.set('adAccounts/act_11111', acct(lan.uid, lan.email, 'K-Aura', { memberUids: [lan.uid] }));
  await emu.set('adAccounts/act_22222', acct(lan.uid, lan.email, 'Spa Lan', { memberUids: [lan.uid], latest: { ...acct(lan.uid, lan.email, 'x').latest, low: true, balance: 900000, daysLeft: 1 } }));
  await emu.set('adReports/act_11111_2026-11', report('act_11111', lan.uid, { memberUids: [lan.uid] }));
  await emu.set('adReports/act_22222_2026-11', report('act_22222', lan.uid, { memberUids: [lan.uid] }));
  await emu.set('adTopups/ADSBSEED01', { uid: lan.uid, actId: 'act_11111', amount: 10000000, code: 'ADSBSEED01', status: 'pending', createdAt: now });

  for (const w of [1440, 390]) {
    const ctx = await setupContext(browser, { fake, viewport: { width: w, height: w > 600 ? 900 : 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await ctx.addInitScript(`try{ ${THEME === 'sang' && ROLE === 'khach' ? "localStorage.setItem('adsnl-theme','light');" : ''} ${THEME === 'sang' && ROLE === 'quan-tri' ? "localStorage.setItem('adsnl-theme','light');" : ''} }catch(e){}`);
    await ctx.route('**/script.google.com/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"ok":true,"soTk":0}' }));
    const page = await ctx.newPage();
    const logs = [];
    watchConsole(page, logs);
    const shot = async (name) => {
      await page.addStyleTag({ content: NO_ANIM }).catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SHOTS, `${ROLE}-${name.replace(/[\/]/g, '_')}-${w}.png`), fullPage: true });
      if (CONTRAST) for (const l of await auditPage(page)) { const k = `${l.sel} ${l.fg} on ${l.bg}`; const g = groups.get(k) || { l, pages: new Set() }; g.pages.add(name + '@' + w); groups.set(k, g); }
    };
    const go = async (hash) => { await page.evaluate((h) => (location.hash = h), hash); await page.waitForTimeout(1600); };

    if (ROLE === 'khach') {
      await signIn(page, lan.email, 'pass-12345', '/tai-khoan/');
      await page.waitForSelector('#acc-app:not([hidden])');
      await page.waitForTimeout(1200);
      for (const h of KHACH) { await go(h); await shot(h); }
      // Nạp tiền: tạo lệnh để hiện hộp mã QR
      await go('nap-tien');
      await page.fill('#tp-custom', '500000').catch(() => {});
      await page.click('#tp-create').catch(() => {});
      await page.waitForSelector('#pay-body:not([hidden]) svg', { timeout: 8000 }).catch(() => {});
      await shot('nap-tien-qr');
      // Báo cáo quảng cáo: hộp "Nạp thêm ngân sách"
      await go('bao-cao-ads/act_11111');
      const btn = page.locator('button:has-text("Nạp thêm ngân sách")').first();
      if (await btn.count()) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        await page.waitForSelector('.at-form', { timeout: 6000 }).catch(() => {});
        await page.fill('#at-custom', '15000000').catch(() => {});
        await page.waitForTimeout(300);
        await page.click('.at-form button[type=submit]').catch(() => {});
        await page.waitForSelector('.at-qr svg', { timeout: 8000 }).catch(() => {});
        await page.screenshot({ path: path.join(SHOTS, `${ROLE}-hop-nap-them-${w}.png`) });
        await page.keyboard.press('Escape');
      }
      // Thông báo nổi: lưu hồ sơ
      await go('ho-so');
      await page.click('#profile-form button[type=submit]').catch(() => {});
      await page.waitForSelector('.toasts .toast, .toast', { timeout: 5000 }).catch(() => {});
      await page.screenshot({ path: path.join(SHOTS, `${ROLE}-thong-bao-noi-${w}.png`) });
      await ctx.close();
      // Thẻ mời cài ứng dụng
      const ctx2 = await setupContext(browser, { fake, viewport: { width: w, height: w > 600 ? 900 : 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await ctx2.addInitScript(INSTALL + `try{ ${THEME === 'sang' ? "localStorage.setItem('adsnl-theme','light');" : ''} }catch(e){}`);
      const p2 = await ctx2.newPage();
      await signIn(p2, lan.email, 'pass-12345', '/tai-khoan/');
      await p2.waitForSelector('#acc-app:not([hidden])');
      await p2.waitForTimeout(1500);
      await p2.addStyleTag({ content: NO_ANIM });
      await p2.screenshot({ path: path.join(SHOTS, `${ROLE}-the-cai-ung-dung-${w}.png`), fullPage: true });
      await ctx2.close();
      continue;
    }
    // Quản trị
    await signIn(page, owner.email, 'owner-pass-1234', '/tai-khoan/');
    await page.goto(`http://127.0.0.1:${process.env.WEB_PORT}/quan-tri/`);
    await page.waitForSelector('#adm-app:not([hidden])', { timeout: 15000 });
    await page.waitForTimeout(1500);
    for (const h of QUAN_TRI) { await go(h); await shot(h); }
    if (logs.length) console.log('console:', logs.slice(0, 5));
    await ctx.close();
  }
  await browser.close();
  for (const [, g] of groups) console.log(`TUONG-PHAN ${g.l.ratio}<${g.l.need} ${g.l.fg} on ${g.l.bg} "${g.l.text}" ${g.l.sel} [${[...g.pages].slice(0, 3).join(', ')}]`);
  if (CONTRAST) console.log('TUONG-PHAN tổng nhóm không đạt:', groups.size);
  console.log('xong', ROLE, THEME, SHOTS);
})().catch((e) => { console.error(e); process.exit(1); });
