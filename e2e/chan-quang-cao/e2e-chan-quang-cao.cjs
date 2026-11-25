// E2E: trang không được có phần tử bị trình chặn quảng cáo ẩn (Cốc Cốc, Brave, uBlock, AdGuard…).
// Lỗi thật 25/11/2026: class "rpt-card" nằm trong danh sách EasyList (##.rpt-card) → khách dùng Cốc Cốc thấy trang Báo cáo quảng cáo trống.
// Chạy trong emulators:exec (từ thư mục firebase/), cần bản build đang được phục vụ:
//   ADBLOCK_LISTS=<tệp1>,<tệp2>  DIST_DIR=<đường dẫn dist>  WEB_PORT=4330 EMU_PORT=8080 SHOTS_DIR=<thư mục ảnh> node ../e2e/chan-quang-cao/e2e-chan-quang-cao.cjs
// Tệp danh sách tải về máy trước (không để trong kho mã): easylist_general_hide.txt của EasyList, abpvn.txt của ABPVN… (xem README.md cùng thư mục).
const H = __dirname + '/../pwa/';
const { BASE, SHOTS, setupContext, chromium, emu, signIn, FakeAuth } = require(H + 'harness.cjs');
const { seedGlobal } = require(H + 'seed.cjs');
const fs = require('fs');
const path = require('path');

const lists = (process.env.ADBLOCK_LISTS || '').split(',').filter(Boolean);
if (!lists.length) { console.error('Thiếu ADBLOCK_LISTS'); process.exit(2); }
const DIST = process.env.DIST_DIR || path.join(__dirname, '../../dist');
// Chỉ lấy luật ẩn phần tử áp cho MỌI trang web ("##bộ-chọn"), bỏ luật riêng từng tên miền và luật không phải CSS thuần.
const selectors = [...new Set(lists.flatMap((f) => fs.readFileSync(f, 'utf8').split(/\r?\n/))
  .filter((l) => l.startsWith('##') && !/:(has-text|-abp-|xpath|matches-css|upward|remove|style|contains)\b|\+js\(/.test(l))
  .map((l) => l.slice(2).trim()).filter(Boolean))];

const now = new Date();
const htmlPages = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? htmlPages(path.join(dir, e.name), `${base}/${e.name}`) : e.name === 'index.html' ? [`${base}/`] : e.name.endsWith('.html') ? [`${base}/${e.name}`] : []);

/** Chạy mọi bộ chọn trong trang; trả về các phần tử bị khớp (bỏ phần tử trong <head>). */
const scan = (page) => page.evaluate((sels) => {
  const out = [];
  for (const s of sels) {
    let els;
    try { els = document.querySelectorAll(s); } catch { continue; }
    for (const el of els) {
      if (el.closest('head')) continue;
      out.push(`${s}  →  <${el.tagName.toLowerCase()}${el.id ? ` id="${el.id}"` : ''}${el.className && typeof el.className === 'string' ? ` class="${el.className}"` : ''}>`);
    }
  }
  return [...new Set(out)];
}, selectors);
/** Giả trình chặn quảng cáo: ẩn mọi phần tử khớp danh sách (để chụp ảnh và kiểm tra hiển thị). */
const block = (page) => page.evaluate((sels) => {
  const sheet = new CSSStyleSheet();
  for (const s of sels) { try { sheet.insertRule(`${s}{display:none!important}`); } catch { /* bộ chọn trình duyệt không hiểu */ } }
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}, selectors);

const found = new Map();
const note = (where, hits) => hits.forEach((h) => found.set(h, [...(found.get(h) || []), where]));

(async () => {
  console.log(`${selectors.length} luật ẩn phần tử từ ${lists.length} danh sách`);
  // 0) Tên tệp trong bản build: một số trình chặn quảng cáo chặn cả tệp có tên như ads.js, ad-*.js, banner.png
  const walk = (d, b = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), `${b}/${e.name}`) : [`${b}/${e.name}`]));
  const badFiles = walk(DIST).filter((f) => !f.endsWith('.html') && /(^|[\/._-])(ads?|advert\w*|sponsor\w*|banner)([._-]|$)/i.test(f.split('/').pop()));
  badFiles.forEach((f) => found.set(`tên tệp trông giống quảng cáo: ${f}`, ['bản build']));
  await emu.clear();
  await seedGlobal();
  const browser = await chromium.launch();
  const fake = new FakeAuth();
  const ctx = await setupContext(browser, { fake, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.route('**/script.google.com/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"ok":true,"soTk":1}' }));
  const page = await ctx.newPage();

  // 1) Mọi trang tĩnh (chưa đăng nhập)
  const pages = htmlPages(DIST);
  for (const p of pages) {
    try { await page.goto(BASE + p, { waitUntil: 'load', timeout: 20000 }); } catch { /* trang tự chuyển hướng */ }
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(250);
    note(p, await scan(page).catch(() => []));
  }
  console.log(`đã quét ${pages.length} trang tĩnh`);

  // 2) Khách đã đăng nhập, có TKQC + báo cáo + lệnh nạp
  const A = fake.addUser({ email: 'chinh@example.com', password: 'pass-12345', displayName: 'Chủ Chính', emailVerified: true });
  const owner = fake.addUser({ email: 'owner@example.com', password: 'owner-pass-1234', displayName: 'Chủ ADS', emailVerified: true });
  await emu.set(`admins/${owner.uid}`, { name: 'Chủ' });
  await emu.set(`users/${A.uid}`, { displayName: 'Chủ Chính', email: A.email, createdAt: now, updatedAt: now });
  await emu.set(`users/${owner.uid}`, { displayName: 'Chủ ADS', email: owner.email, createdAt: now, updatedAt: now });
  const days = Array.from({ length: 12 }, (_, k) => ({ date: `2026-11-${String(k + 1).padStart(2, '0')}`, comment: 5 + k, inbox: 40 + k, data: 45 + 2 * k, cpd: 30000, spend: 1200000 + k * 90000 }));
  await emu.set('adAccounts/act_11111', { uid: A.uid, customerEmail: A.email, accountName: 'TK (51323)', label: 'Asian Beauty', service: 'ads', tabPattern: 'BC ADS T11 (x)', lowVnd: 20000000, lowDays: 2, emailAlerts: true, active: true, updatedAt: now, updatedBy: owner.uid, viewerUids: [], viewerEmails: [], memberUids: [A.uid], latest: { month: '2026-11', balance: 1213152, totalTopup: 50000000, totalSpend: 37868473, spendYesterday: 2336205, spendToday: 940881, avg7: 2126522, daysLeft: 1, low: true, updatedAt: now } });
  await emu.set('adReports/act_11111_2026-11', { uid: A.uid, memberUids: [A.uid], actId: 'act_11111', month: '2026-11', tab: 'BC ADS T11', accountName: 'TK', note: 'GHI CHÚ', topups: [{ date: '2026-11-05', label: '', amount: 10000000 }], days, totals: { topup: 10000000, spend: 5000000, balance: 5000000, comment: 10, inbox: 100, data: 110, cpd: 30000 }, updatedAt: now });
  await signIn(page, A.email, 'pass-12345', '/tai-khoan/');
  await page.waitForSelector('#acc-app:not([hidden])');
  for (const hash of ['tong-quan', 'nap-tien', 'don-hang', 'bao-cao-ads', 'bao-cao-ads/act_11111', 'dich-vu', 'khoa-hoc', 'huong-dan', 'key-may', 'ho-so', 'bao-mat']) {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(1500);
    note(`/tai-khoan/#${hash}`, await scan(page));
  }
  // hộp "Nạp thêm ngân sách"
  const add = page.locator('button:has-text("Nạp thêm ngân sách")').first();
  if (await add.count()) { await add.click().catch(() => {}); await page.waitForTimeout(1500); note('/tai-khoan/ hộp nạp ngân sách', await scan(page)); await page.keyboard.press('Escape'); }

  // Kiểm tra hiển thị khi có trình chặn quảng cáo: thẻ TKQC và bảng báo cáo phải còn nhìn thấy
  const visible = async (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length > 0).length, sel);
  await page.evaluate(() => (location.hash = 'bao-cao-ads'));
  await page.waitForTimeout(1500);
  const cardSel = '#rpt-list-view li a, #bc-list-view li a';
  const cardsBefore = await visible(cardSel);
  await block(page);
  await page.waitForTimeout(300);
  const cardsAfter = await visible(cardSel);
  await page.screenshot({ path: path.join(SHOTS, 'chan-qc-danh-sach.png') });
  await page.evaluate(() => (location.hash = 'bao-cao-ads/act_11111'));
  await page.waitForTimeout(1800);
  await block(page);
  const tableAfter = await visible('.xv-view');
  await page.screenshot({ path: path.join(SHOTS, 'chan-qc-bao-cao.png') });
  await page.evaluate(() => (location.hash = 'tong-quan'));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SHOTS, 'chan-qc-tong-quan.png') });

  // 3) Quản trị
  await ctx.clearCookies();
  const adm = await ctx.newPage();
  await signIn(adm, owner.email, 'owner-pass-1234', '/tai-khoan/');
  for (const hash of ['tong-quan', 'tai-khoan-quang-cao', 'khach-hang', `khach-hang/${A.uid}`, `khach-hang/${A.uid}/tkqc`, 'don-hang', 'nap-tien']) {
    await adm.goto(BASE + '/quan-tri/#' + hash).catch(() => {});
    await adm.waitForTimeout(1600);
    note(`/quan-tri/#${hash}`, await scan(adm).catch(() => []));
  }

  await browser.close();
  console.log(`\nThẻ TKQC nhìn thấy: trước khi chặn ${cardsBefore}, sau khi chặn ${cardsAfter}; bảng báo cáo sau khi chặn: ${tableAfter}`);
  if (found.size) {
    console.log(`\nKHÔNG ĐẠT — ${found.size} phần tử bị trình chặn quảng cáo ẩn:`);
    for (const [h, where] of found) console.log(`  ${h}\n      ở: ${[...new Set(where)].slice(0, 4).join(', ')}${new Set(where).size > 4 ? ` … (+${new Set(where).size - 4})` : ''}`);
  } else console.log('\nĐẠT — không phần tử nào khớp danh sách chặn.');
  const ok = !found.size && cardsBefore === 1 && cardsAfter === 1 && tableAfter >= 1;
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
