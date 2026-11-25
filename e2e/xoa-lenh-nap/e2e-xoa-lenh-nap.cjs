// E2E: nút xóa lệnh nạp trong Quản trị (25/11/2026) — lệnh nạp ngân sách (adTopups) và lệnh nạp ví (topups).
// Chạy trong emulators:exec (từ firebase/): WEB_PORT=4330 EMU_PORT=8080 SHOTS_DIR=<thư mục ảnh> node ../e2e/xoa-lenh-nap/e2e-xoa-lenh-nap.cjs [1440|390]
const H = __dirname + '/../pwa/';
const { BASE, SHOTS, setupContext, chromium, emu, signIn, FakeAuth, watchConsole } = require(H + 'harness.cjs');
const { seedGlobal } = require(H + 'seed.cjs');
const path = require('path');
const width = Number(process.argv[2] || 1440);
const now = new Date();
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? '  ✔' : '  ✗ KHÔNG ĐẠT'} ${name}${ok || !extra ? '' : ' — ' + extra}`); };
const has = async (p) => (await emu.obj(p).catch(() => null)) != null;

(async () => {
  await emu.clear();
  await seedGlobal();
  const browser = await chromium.launch();
  const fake = new FakeAuth();
  const ctx = await setupContext(browser, { fake, viewport: width < 600 ? { width, height: 844 } : { width, height: 900 }, deviceScaleFactor: 1 });
  await ctx.route('**/script.google.com/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"ok":true,"soTk":1,"ghiNap":0}' }));
  const A = fake.addUser({ email: 'khach@example.com', password: 'pass-12345', displayName: 'Khách Thật', emailVerified: true });
  const owner = fake.addUser({ email: 'owner@example.com', password: 'owner-pass-1234', displayName: 'Chủ ADS', emailVerified: true });
  await emu.set(`admins/${owner.uid}`, { name: 'Chủ' });
  for (const u of [A, owner]) await emu.set(`users/${u.uid}`, { displayName: u.displayName, email: u.email, createdAt: now, updatedAt: now });
  await emu.set(`wallets/${A.uid}`, { uid: A.uid, balance: 750000, updatedAt: now, lastTx: 'x' });
  await emu.set('adAccounts/act_11111', { uid: A.uid, customerEmail: A.email, accountName: 'TK (51323)', label: 'Asian Beauty', service: 'ads', tabPattern: 'BC', lowVnd: 1, lowDays: 1, emailAlerts: true, active: true, updatedAt: now, updatedBy: owner.uid, viewerUids: [], viewerEmails: [], memberUids: [A.uid], latest: { month: '2026-11', balance: 12131527, totalTopup: 1, totalSpend: 1, spendYesterday: 1, spendToday: 1, avg7: 1, daysLeft: 5, low: false, updatedAt: now } });
  await emu.set('adReports/act_11111_2026-11', { uid: A.uid, memberUids: [A.uid], actId: 'act_11111', month: '2026-11', tab: 'BC', accountName: 'TK', note: '', topups: [], days: [], totals: { topup: 0, spend: 0, balance: 0, comment: 0, inbox: 0, data: 0, cpd: 0 }, updatedAt: now });
  const adTop = (code, extra) => emu.set(`adTopups/${code}`, { uid: A.uid, email: A.email, name: 'Khách Thật', actId: 'act_11111', accountLabel: 'Asian Beauty', amount: 11000000, budget: 10000000, feePercent: 10, day: '2026-11-25', code, status: 'pending', lang: 'vi', createdAt: now, ...extra });
  await adTop('ADSBCHO111', {});
  await adTop('ADSBHUY111', { status: 'cancelled', cancelledAt: now });
  await adTop('ADSBTUCH11', { status: 'rejected', reason: 'thử 1', decidedAt: now, decidedBy: owner.uid });
  await adTop('ADSBTUCH22', { status: 'rejected', reason: 'thử 2', decidedAt: now, decidedBy: owner.uid });
  await adTop('ADSBDUYET1', { status: 'approved', decidedAt: now, decidedBy: owner.uid, written: true, writtenAt: now, sheetTab: 'BC' });
  await adTop('ADSBCOTIEN', { status: 'pending', sepayId: '999', paidAmount: 5000000, sepayNote: 'SePay: đã nhận 5.000.000đ, thiếu 6.000.000đ' });
  const top = (code, extra) => emu.set(`topups/${code}`, { uid: A.uid, email: A.email, name: 'Khách Thật', amount: 500000, code, status: 'pending', lang: 'vi', createdAt: now, ...extra });
  await top('ADSNCHO111', {});
  await top('ADSNHUY111', { status: 'cancelled', cancelledAt: now });
  await top('ADSNTUCH11', { status: 'rejected', reason: 'thử', decidedAt: now, decidedBy: owner.uid });
  await top('ADSNDUYET1', { status: 'approved', decidedAt: now, decidedBy: owner.uid, txId: 'topup_ADSNDUYET1' });

  const logs = [];
  const page = await ctx.newPage();
  watchConsole(page, logs);
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  await signIn(page, owner.email, 'owner-pass-1234', '/tai-khoan/');
  await page.goto(BASE + '/quan-tri/#tai-khoan-quang-cao');
  await page.waitForSelector('[data-clear-topups="ad"]', { state: 'attached' });
  await page.waitForTimeout(1500);
  const delBtn = (code) => page.locator(`[data-del-topup="${code}"]`);
  const confirm = async (yes) => { const d = page.locator('dialog.confirm-dialog'); await d.waitFor(); const text = await d.innerText(); await d.locator(yes ? 'button[type=submit]' : 'button.btn-ghost').click(); await page.waitForTimeout(1400); return text; };

  console.log(`\n== Lệnh nạp ngân sách (rộng ${width}) ==`);
  for (const c of ['ADSBCHO111', 'ADSBHUY111', 'ADSBTUCH11', 'ADSBTUCH22']) check(`1. có nút Xóa cho ${c}`, (await delBtn(c).count()) === 1);
  check('2. KHÔNG có nút Xóa cho lệnh đã nhận tiền', (await delBtn('ADSBDUYET1').count()) === 0);
  check('3. KHÔNG có nút Xóa cho lệnh hệ thống đã thấy tiền về', (await delBtn('ADSBCOTIEN').count()) === 0);
  const bulk = page.locator('[data-clear-topups="ad"]');
  check('4. nút dọn ghi đúng số lệnh đã từ chối + đã hủy (3)', (await bulk.innerText()).includes('(3)'), await bulk.innerText());
  await bulk.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, `xoa-${width}-danh-sach-ngan-sach.png`) });

  await delBtn('ADSBCHO111').click();
  let text = await page.locator('dialog.confirm-dialog').innerText();
  await page.screenshot({ path: path.join(SHOTS, `xoa-${width}-hop-xac-nhan-dang-cho.png`) });
  check('5. lệnh đang chờ: hộp xác nhận có cảnh báo khách chuyển khoản', text.includes('đang chờ chuyển khoản') && text.includes('Từ chối'));
  await confirm(false);
  check('6. bấm "Giữ lại" → lệnh vẫn còn', await has('adTopups/ADSBCHO111'));

  await delBtn('ADSBTUCH11').click();
  text = await confirm(true);
  check('7. lệnh đã từ chối: hộp xác nhận không có cảnh báo chuyển khoản', !text.includes('đang chờ chuyển khoản') && text.includes('Không khôi phục được'));
  check('8. xác nhận → lệnh bị xóa hẳn', !(await has('adTopups/ADSBTUCH11')));
  await page.waitForTimeout(800);
  check('9. danh sách vẽ lại, nút dọn còn (2)', (await delBtn('ADSBTUCH11').count()) === 0 && (await bulk.innerText()).includes('(2)'), await bulk.innerText());

  await bulk.click();
  text = await confirm(true);
  check('10. dọn cả loạt: hộp xác nhận nêu 2 lệnh', text.includes('2 lệnh'));
  check('11. đã xóa lệnh đã hủy + đã từ chối', !(await has('adTopups/ADSBHUY111')) && !(await has('adTopups/ADSBTUCH22')));
  check('12. GIỮ lệnh đang chờ, lệnh đã nhận tiền, lệnh có tiền về', (await has('adTopups/ADSBCHO111')) && (await has('adTopups/ADSBDUYET1')) && (await has('adTopups/ADSBCOTIEN')));
  await page.waitForTimeout(800);
  check('13. hết lệnh để dọn → nút dọn ẩn', !(await bulk.isVisible()));
  await delBtn('ADSBCHO111').click();
  await confirm(true);
  check('14. xóa được lệnh đang chờ khi đã xác nhận', !(await has('adTopups/ADSBCHO111')));

  console.log(`\n== Lệnh nạp ví (rộng ${width}) ==`);
  await page.goto(BASE + '/quan-tri/#nap-tien');
  await page.waitForSelector('[data-clear-topups="wallet"]');
  await page.locator('.adm-toolbar button:has-text("Tất cả"), .adm-toolbar [role=tab]:has-text("Tất cả"), .adm-toolbar .chip:has-text("Tất cả")').first().click();
  await page.waitForTimeout(1500);
  for (const c of ['ADSNCHO111', 'ADSNHUY111', 'ADSNTUCH11']) check(`15. có nút Xóa cho ${c}`, (await delBtn(c).count()) === 1);
  check('16. KHÔNG có nút Xóa cho lệnh đã duyệt', (await delBtn('ADSNDUYET1').count()) === 0);
  await page.screenshot({ path: path.join(SHOTS, `xoa-${width}-danh-sach-nap-vi.png`) });
  await delBtn('ADSNTUCH11').click();
  await confirm(true);
  check('17. xóa lệnh nạp ví đã từ chối', !(await has('topups/ADSNTUCH11')));
  await page.locator('[data-clear-topups="wallet"]').click();
  text = await confirm(true);
  check('18. dọn cả loạt: chỉ còn 1 lệnh đã hủy để xóa', text.includes('1 lệnh'));
  check('19. đã xóa lệnh đã hủy; giữ lệnh đang chờ và lệnh đã duyệt', !(await has('topups/ADSNHUY111')) && (await has('topups/ADSNCHO111')) && (await has('topups/ADSNDUYET1')));
  check('20. số dư ví của khách không đổi', (await emu.obj(`wallets/${A.uid}`)).balance === 750000);
  await page.locator('[data-clear-topups="wallet"]').click();
  await page.waitForTimeout(1200);
  check('21. không còn gì để dọn → báo "Không có lệnh…", không mở hộp xác nhận', (await page.locator('dialog.confirm-dialog').count()) === 0);

  console.log(`\n== Phía khách sau khi xóa ==`);
  await ctx.clearCookies();
  const kh = await ctx.newPage();
  watchConsole(kh, logs);
  kh.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  await signIn(kh, A.email, 'pass-12345', '/tai-khoan/');
  await kh.waitForSelector('#acc-app:not([hidden])');
  await kh.evaluate(() => (location.hash = 'bao-cao-ads/act_11111'));
  await kh.waitForTimeout(2500);
  const body = await kh.locator('main').innerText();
  check('22. trang báo cáo của khách mở bình thường, không còn mã lệnh đã xóa', body.includes('Asian Beauty') && !body.includes('ADSBTUCH11') && !body.includes('ADSBHUY111'));
  await kh.evaluate(() => (location.hash = 'nap-tien'));
  await kh.waitForTimeout(2000);
  const nap = await kh.locator('main').innerText();
  check('23. trang Nạp tiền của khách mở bình thường, không còn mã lệnh đã xóa', nap.includes('Nạp tiền') && !nap.includes('ADSNTUCH11') && !nap.includes('ADSNHUY111'));
  const errs = logs.filter((l) => /PAGEERROR|\[error\]/.test(l) && !/403|favicon/.test(l));
  check('24. không có lỗi trang nào', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\nKẾT QUẢ (rộng ${width}): ${pass}/${pass + fail} ĐẠT`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
