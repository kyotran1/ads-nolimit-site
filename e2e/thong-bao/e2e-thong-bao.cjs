// E2E "Thông báo ngân sách thấp": mục Thông báo (khách) + Nhắc qua Zalo (quản trị), giả lập như các e2e cũ
// (đăng nhập giả, Firestore emulator chạy luật thật, không gọi mạng thật, Apps Script giả bằng cách ghi thẳng vào emulator).
// Biến môi trường: WEB_PORT, EMU_PORT, W (độ rộng, mặc định 390), THEME=toi|sang, SHOTS_DIR, CONTRAST=1
const H = '../pwa/';
const { SHOTS, setupContext, chromium, emu, signIn, watchConsole, FakeAuth, BASE } = require(H + 'harness.cjs');
const { seedGlobal, seedCustomer } = require(H + 'seed.cjs');
const { auditPage } = require('../sang-toi/tuong-phan.cjs');
const path = require('path');

const W = Number(process.env.W || 390);
const THEME = process.env.THEME || 'toi';
const CONTRAST = process.env.CONTRAST === '1';
const NO_ANIM = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail);
};
const DAY = 864e5;
const STUB = `window.__opened = []; window.open = function (u, t) { window.__opened.push([String(u), String(t)]); return {}; };`;
const lightInit = THEME === 'sang' ? "try{ localStorage.setItem('adsnl-theme','light'); }catch(e){}" : '';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await emu.clear();
  await seedGlobal();
  const browser = await chromium.launch();
  const fake = new FakeAuth();
  const owner = fake.addUser({ email: 'owner@example.com', password: 'owner-pass-1234', displayName: 'Chủ ADS', emailVerified: true });
  const lan = fake.addUser({ email: 'lan@example.com', password: 'pass-12345', displayName: 'Lan Nguyễn', emailVerified: true });
  const nam = fake.addUser({ email: 'nam@example.com', password: 'pass-12345', displayName: 'Nam Trần', emailVerified: true });
  await emu.set(`admins/${owner.uid}`, { name: 'Chủ' });
  await seedCustomer(lan.uid, lan.email); // hồ sơ có điện thoại "0912 345 678"
  await seedCustomer(nam.uid, nam.email, { rich: false });
  const logs = [];
  const mkCtx = async () => {
    const ctx = await setupContext(browser, { fake, viewport: { width: W, height: W > 600 ? 900 : 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await ctx.addInitScript(STUB + lightInit);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    await ctx.route('**/script.google.com/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }));
    return ctx;
  };
  const tag = `${W}-${THEME}`;
  const shot = async (page, name, full = true) => {
    await page.addStyleTag({ content: NO_ANIM }).catch(() => {});
    await page.waitForTimeout(350);
    // Chụp riêng khối nội dung (chụp cả trang sẽ có thanh dính đè giữa ảnh)
    const box = page.locator('[data-view="notify"]:not([hidden]), #adm-view').first();
    await box.screenshot({ path: path.join(SHOTS, `${name}-${tag}.png`) });
  };
  const audit = async (page, name) => {
    if (!CONTRAST) return;
    const loi = await auditPage(page);
    check(`${name}: tương phản chữ ≥ 4,5 (hoặc ≥ 3 với chữ lớn) — ${loi.length} lỗi`, loi.length === 0, JSON.stringify(loi.slice(0, 4)));
  };
  const noOverflow = async (page, name) => {
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    check(`${name}: không tràn ngang (${o.sw} ≤ ${o.iw})`, o.sw <= o.iw);
  };
  const minHeights = async (page, sel, min, name) => {
    const bad = await page.evaluate(([s, m]) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null).map((e) => [e.id || e.className, Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < m), [sel, min]);
    check(`${name}: mọi nút cao ≥ ${min}px`, bad.length === 0, JSON.stringify(bad));
  };
  const loaded = (page) => page.waitForSelector('#nt-grid[aria-busy="false"]', { timeout: 15000 });
  const openNotify = async (page) => {
    await page.goto(`${BASE}/tai-khoan/#thong-bao`);
    await page.waitForSelector('#acc-app:not([hidden])');
    await page.waitForSelector('[data-view="notify"]:not([hidden])');
    await loaded(page);
  };
  const notifyOf = async (uid) => (await emu.obj(`users/${uid}`))?.notify ?? null;
  const rest = (page, p, token) =>
    page.evaluate(async ([path, tk]) => {
      const r = await fetch(`https://firestore.googleapis.com/v1/projects/ads-nolimit-web/databases/(default)/documents/${path}`, { headers: { authorization: `Bearer ${tk}` } });
      return r.status;
    }, [p, token]);

  /* ======================== KHÁCH ======================== */
  console.log(`\n=== KHÁCH ${tag} ===`);
  const ctx = await mkCtx();
  const page = await ctx.newPage();
  watchConsole(page, logs);
  await signIn(page, lan.email, 'pass-12345', '/tai-khoan/');
  await page.waitForSelector('#acc-app:not([hidden])');
  await openNotify(page);

  const link = page.locator('a[data-route="notify"]');
  check('1a. menu có mục "Thông báo" và đang được chọn', (await link.count()) === 1 && (await link.getAttribute('aria-current')) === 'page' && /Thông báo/.test(await link.innerText()));
  check('1b. tiêu đề trang là "Thông báo"', (await page.locator('#dash-title').innerText()) === 'Thông báo');
  check('1c. mặc định: email bật, Messenger "chưa nối", Zalo tắt', (await page.locator('#nt-email').isChecked()) && (await page.locator('#nt-msg').getAttribute('data-state')) === 'off' && !(await page.locator('#nt-zalo').isChecked()));
  check('1d. ô số Zalo được gợi ý sẵn từ hồ sơ (0912345678), chưa lưu gì', (await page.inputValue('#nt-zalo-phone')) === '0912345678' && (await notifyOf(lan.uid)) === null);
  check('1e. có câu đồng ý + ghi chú số Zalo 0888 88 2823', /đồng ý nhận thông báo về tài khoản/.test(await page.locator('.nt-consent').innerText()) && /0888 88 2823/.test(await page.locator('[data-view="notify"]').innerText()));
  await noOverflow(page, 'Thông báo (chưa nối)');
  await minHeights(page, '[data-view="notify"] .btn, .nt-switch', 44, 'Thông báo (chưa nối)');
  await shot(page, 'thong-bao-chua-noi');
  await audit(page, 'Thông báo (chưa nối)');

  // --- Email bật/tắt, lưu đúng ---
  await page.locator('#nt-email').uncheck();
  await page.waitForFunction(() => document.getElementById('nt-status')?.textContent?.includes('Đã lưu'));
  let n = await notifyOf(lan.uid);
  check('2a. tắt email → users.notify = {email:false, messenger:true, zalo:false, zaloPhone:""}', n && n.email === false && n.messenger === true && n.zalo === false && n.zaloPhone === '', JSON.stringify(n));
  await page.reload();
  await page.waitForSelector('#acc-app:not([hidden])');
  await loaded(page);
  check('2b. tải lại trang: email vẫn tắt (đã lưu thật)', !(await page.locator('#nt-email').isChecked()));
  await page.locator('#nt-email').check();
  await page.waitForFunction(() => document.getElementById('nt-status')?.textContent?.includes('Đã lưu'));
  check('2c. bật lại email → đã lưu', (await notifyOf(lan.uid))?.email === true);

  // --- Zalo ---
  await page.fill('#nt-zalo-phone', '12345');
  await page.click('#nt-zalo-save');
  await page.waitForFunction(() => document.getElementById('nt-zalo-phone-error')?.textContent?.trim());
  check('3a. số Zalo sai → báo lỗi dưới ô, không lưu', /Số Zalo chưa đúng/.test(await page.locator('#nt-zalo-phone-error').innerText()) && (await page.getAttribute('#nt-zalo-phone', 'aria-invalid')) === 'true' && (await notifyOf(lan.uid))?.zaloPhone === '');
  await shot(page, 'thong-bao-zalo-loi');
  await page.fill('#nt-zalo-phone', '');
  await page.locator('#nt-zalo').click();
  await page.waitForTimeout(400);
  check('3b. bật công tắc Zalo khi chưa có số → báo cần nhập số, công tắc tự tắt', !(await page.locator('#nt-zalo').isChecked()) && /Nhập số Zalo/.test(await page.locator('#nt-zalo-phone-error').innerText()) && (await notifyOf(lan.uid))?.zalo === false);
  await page.fill('#nt-zalo-phone', '+84 912 345 678');
  await page.click('#nt-zalo-save');
  await page.waitForFunction(() => document.getElementById('nt-status')?.textContent?.includes('Đã lưu'));
  n = await notifyOf(lan.uid);
  check('3c. "+84 912 345 678" → chuẩn hóa 0912345678, lưu số, Zalo vẫn tắt', n.zaloPhone === '0912345678' && n.zalo === false && (await page.inputValue('#nt-zalo-phone')) === '0912345678', JSON.stringify(n));
  await page.locator('#nt-zalo').check();
  await page.waitForFunction(() => document.getElementById('nt-status')?.textContent?.includes('Đã lưu') && document.getElementById('nt-zalo').checked);
  n = await notifyOf(lan.uid);
  check('3d. bật công tắc Zalo → lưu zalo:true kèm số', n.zalo === true && n.zaloPhone === '0912345678', JSON.stringify(n));
  await page.fill('#nt-zalo-phone', '0912 345 679');
  await page.locator('#nt-email').uncheck(); // đang gõ dở số: đổi công tắc khác không được xóa chữ đang gõ
  await page.waitForFunction(() => document.getElementById('nt-status')?.textContent?.includes('Đã lưu'));
  check('3e. đang gõ dở số mới mà đổi công tắc khác → chữ đang gõ không bị ghi đè', (await page.inputValue('#nt-zalo-phone')) === '0912 345 679' || (await page.inputValue('#nt-zalo-phone')) === '0912345679');
  await page.locator('#nt-email').check();
  await page.waitForFunction(() => document.getElementById('nt-status')?.textContent?.includes('Đã lưu'));
  await page.fill('#nt-zalo-phone', '0912345678');
  await page.click('#nt-zalo-save');
  await page.waitForTimeout(500);
  await page.locator('#nt-zalo').uncheck();
  await page.waitForFunction(() => document.getElementById('nt-status')?.textContent?.includes('Đã tắt nhắc qua Zalo'));
  check('3f. tắt công tắc Zalo → zalo:false, số được giữ', (await notifyOf(lan.uid)).zalo === false && (await notifyOf(lan.uid)).zaloPhone === '0912345678');
  await page.locator('#nt-zalo').check();
  await page.waitForFunction(() => document.getElementById('nt-zalo').checked && document.getElementById('nt-status')?.textContent?.includes('Đã lưu'));

  // --- Nối Messenger: tạo mã + mở link ---
  await page.click('#nt-connect');
  await page.waitForSelector('#nt-msg[data-state="wait"]');
  const codes = await emu.all('notifyCodes');
  const code = codes[0]?.id ?? '';
  check('4a. bấm "Nối Messenger" → tạo đúng 1 notifyCodes/{10 ký tự A-Z0-9} của khách', codes.length === 1 && /^[A-Z0-9]{10}$/.test(code) && codes[0].uid === lan.uid && codes[0].createdAt instanceof Date, JSON.stringify(codes));
  const opened = await page.evaluate(() => window.__opened);
  check('4b. mở đúng link m.me/adsnolimit.agency2610?ref=NOI-<mã>', opened.length === 1 && opened[0][0] === `https://m.me/adsnolimit.agency2610?ref=NOI-${code}` && opened[0][1] === '_blank', JSON.stringify(opened));
  check('4c. giao diện chuyển sang "đang chờ", hiện tin mẫu "Nối thông báo NOI-<mã>" và link "Mở lại Messenger"', (await page.locator('#nt-code-text').innerText()) === `Nối thông báo NOI-${code}` && (await page.getAttribute('#nt-reopen', 'href')) === `https://m.me/adsnolimit.agency2610?ref=NOI-${code}`);
  await noOverflow(page, 'Thông báo (đang chờ)');
  await minHeights(page, '[data-view="notify"] .btn, .nt-switch', 44, 'Thông báo (đang chờ)');
  await shot(page, 'thong-bao-dang-cho');
  await audit(page, 'Thông báo (đang chờ)');
  await page.click('#nt-check');
  await page.waitForFunction(() => /Chưa thấy tin/.test(document.getElementById('nt-status')?.textContent ?? ''));
  check('4d. "Tôi đã gửi" khi chưa có tin → báo "chưa thấy tin", vẫn ở trạng thái chờ', (await page.locator('#nt-msg').getAttribute('data-state')) === 'wait');
  await page.reload();
  await page.waitForSelector('#acc-app:not([hidden])');
  await loaded(page);
  check('4e. tải lại trang giữa chừng → vẫn ở trạng thái chờ (nhớ mã ở máy này)', (await page.locator('#nt-msg').getAttribute('data-state')) === 'wait' && (await page.locator('#nt-code-text').innerText()).includes(code));

  // --- Hủy chờ rồi nối lại (mã cũ bị xóa) ---
  await page.click('#nt-cancel');
  await page.waitForSelector('#nt-msg[data-state="off"]');
  await page.waitForTimeout(500);
  check('5a. Hủy → quay về "chưa nối" và xóa notifyCodes của mình', (await emu.all('notifyCodes')).length === 0);
  await page.click('#nt-connect');
  await page.waitForSelector('#nt-msg[data-state="wait"]');
  const code2 = (await emu.all('notifyCodes'))[0].id;
  check('5b. nối lại → mã mới khác mã cũ', code2 !== code && /^[A-Z0-9]{10}$/.test(code2));

  // --- Giả lập Apps Script: webhook nối thành công (ghi bằng quyền chủ vào emulator) ---
  const PSID = '7364920185736402';
  await emu.set(`notifyPrivate/${lan.uid}`, { psid: PSID, linkedAt: new Date() });
  await emu.set(`notifyLinks/${lan.uid}`, { messenger: { linked: true, linkedAt: new Date(), name: 'Lan Nguyễn' } });
  await emu.del(`notifyCodes/${code2}`);
  const t0 = Date.now();
  await page.waitForSelector('#nt-msg[data-state="on"]', { timeout: 12000 });
  check(`6a. Apps Script ghi notifyLinks → giao diện tự chuyển "Đã nối ✓" sau ${Math.round((Date.now() - t0) / 100) / 10}s (không cần tải lại)`, /Đã nối/.test(await page.locator('#nt-msg .nt-state--on').innerText()));
  check('6b. công tắc Messenger hiện, mặc định bật', await page.locator('#nt-messenger').isChecked());
  const seen = ctx.external.filter((e) => /notifyPrivate/.test(e.url));
  const html = await page.content();
  check('6c. PSID không bao giờ tới trình duyệt: không có yêu cầu nào tới notifyPrivate, không có PSID trong trang', seen.length === 0 && !html.includes(PSID));
  await noOverflow(page, 'Thông báo (đã nối)');
  await minHeights(page, '[data-view="notify"] .btn, .nt-switch', 44, 'Thông báo (đã nối)');
  await shot(page, 'thong-bao-da-noi');
  await audit(page, 'Thông báo (đã nối)');
  await page.locator('#nt-messenger').uncheck();
  await page.waitForFunction(() => document.getElementById('nt-status')?.textContent?.includes('Đã lưu'));
  check('6d. tắt "Nhận thông báo qua Messenger" → users.notify.messenger = false', (await notifyOf(lan.uid)).messenger === false);
  await page.locator('#nt-messenger').check();
  await page.waitForFunction(() => document.getElementById('nt-status')?.textContent?.includes('Đã lưu'));
  await page.reload();
  await page.waitForSelector('#acc-app:not([hidden])');
  await loaded(page);
  check('6e. tải lại: vẫn "Đã nối" (đọc từ notifyLinks)', (await page.locator('#nt-msg').getAttribute('data-state')) === 'on' && (await page.locator('#nt-messenger').isChecked()));

  // --- Bỏ nối ---
  await page.click('#nt-unlink');
  await page.waitForSelector('dialog.confirm-dialog[open]');
  await page.click('dialog.confirm-dialog button:has-text("Bỏ nối")');
  await page.waitForSelector('#nt-msg[data-state="off"]');
  const nl = await emu.obj(`notifyLinks/${lan.uid}`);
  check('7a. bỏ nối → notifyLinks.messenger = { linked: false } (đúng như luật cho phép)', nl && nl.messenger && nl.messenger.linked === false && Object.keys(nl.messenger).length === 1, JSON.stringify(nl));
  check('7b. giao diện về "chưa nối", nút "Nối Messenger" dùng lại được', await page.locator('#nt-connect').isEnabled());

  // --- Quyền: khách thường không đọc được các bộ sưu tập nội bộ ---
  const tkLan = fake.token(lan).idToken;
  await emu.set('zaloQueue/act_11111_lan_2026-11-26', { uid: lan.uid, actId: 'act_11111', name: 'Lan Nguyễn', accountName: 'K-Aura', phone: '0912345678', text: 'ADS-Nolimit thông báo: TKQC K-Aura còn khoảng 2.500.000 đ, đủ chạy khoảng 1 ngày. Bạn xem báo cáo và nạp thêm tại www.ads-nolimit.agency/tai-khoan/#bao-cao-ads', createdAt: new Date(Date.now() - 3600e3), status: 'cho' });
  await emu.set('zaloQueue/act_22222_nam_2026-11-26', { uid: nam.uid, actId: 'act_22222', name: 'Nam Trần', accountName: 'Spa Nam', phone: '0988777666', text: 'ADS-Nolimit thông báo: TKQC Spa Nam còn khoảng 900.000 đ, đủ chạy khoảng 0 ngày. Bạn xem báo cáo và nạp thêm tại www.ads-nolimit.agency/tai-khoan/#bao-cao-ads', createdAt: new Date(Date.now() - 1800e3), status: 'cho' });
  await emu.set('zaloQueue/act_33333_nam_2026-11-25', { uid: nam.uid, actId: 'act_33333', name: 'Nam Trần', accountName: 'Cũ', phone: '0988777666', text: 'Tin hôm qua', createdAt: new Date(Date.now() - DAY), status: 'da-gui', doneAt: new Date(Date.now() - 80000e3) });
  await emu.set(`notifyCodes/ZZZZZZZZZZ`, { uid: nam.uid, createdAt: new Date() });
  const st = {
    zaloQueue: await rest(page, `zaloQueue/act_11111_lan_2026-11-26`, tkLan),
    zaloList: await rest(page, `zaloQueue`, tkLan),
    codeOther: await rest(page, `notifyCodes/ZZZZZZZZZZ`, tkLan),
    privateOwn: await rest(page, `notifyPrivate/${lan.uid}`, tkLan),
    linksOther: await rest(page, `notifyLinks/${nam.uid}`, tkLan),
  };
  check('8. khách thường bị từ chối (403) khi đọc zaloQueue, mã của người khác, notifyPrivate (kể cả của mình), notifyLinks của người khác', Object.values(st).every((s) => s === 403), JSON.stringify(st));
  check('9. không có lỗi JS ở trang khách', !logs.some((l) => /pageerror|Uncaught|insufficient permissions/i.test(l)), logs.slice(0, 3).join(' | '));
  await ctx.close();

  /* ======================== QUẢN TRỊ ======================== */
  console.log(`\n=== QUẢN TRỊ ${tag} ===`);
  const ctx2 = await mkCtx();
  const adm = await ctx2.newPage();
  const admLogs = [];
  watchConsole(adm, admLogs);
  await signIn(adm, owner.email, 'owner-pass-1234', '/tai-khoan/');
  await adm.goto(`${BASE}/quan-tri/#nhac-zalo`);
  await adm.waitForSelector('#adm-app:not([hidden])', { timeout: 15000 });
  await adm.waitForSelector('.zq-item');
  const navItem = adm.locator('a[data-tab="nhac-zalo"]');
  check('10a. menu quản trị có "Nhắc qua Zalo", đang chọn', (await navItem.count()) === 1 && (await navItem.getAttribute('aria-current')) === 'page' && (await adm.locator('#dash-title').innerText()) === 'Nhắc qua Zalo');
  const items = adm.locator('.zq-item');
  check('10b. tab "Cần gửi" chỉ có 2 tin đang chờ, tin mới nhất trước (Nam 30 phút trước đứng trên Lan)', (await items.count()) === 2 && /Nam Trần/.test(await items.nth(0).innerText()) && /Lan Nguyễn/.test(await items.nth(1).innerText()));
  const first = items.nth(1); // Lan
  const txt = await first.locator('.zq-text').innerText();
  check('10c. mỗi tin có tên khách, TKQC, số Zalo và nội dung soạn sẵn', /Lan Nguyễn/.test(await first.innerText()) && /K-Aura/.test(await first.innerText()) && (await first.locator('.zq-phone').innerText()) === '0912345678' && txt.startsWith('ADS-Nolimit thông báo: TKQC K-Aura'));
  await noOverflow(adm, 'Nhắc qua Zalo');
  await minHeights(adm, '.zq-item .btn', 48, 'Nhắc qua Zalo');
  await shot(adm, 'nhac-qua-zalo');
  await audit(adm, 'Nhắc qua Zalo');
  await first.locator('[data-act="copy-open"]').click();
  await adm.waitForFunction(() => document.querySelector('.zq-item:nth-child(2) .zq-note')?.textContent?.trim());
  const clip = await adm.evaluate(() => navigator.clipboard.readText());
  const op = await adm.evaluate(() => window.__opened);
  check('11a. "Chép tin & mở Zalo" → bộ nhớ tạm đúng nội dung tin', clip === txt, JSON.stringify(clip));
  check('11b. mở đúng https://zalo.me/0912345678 ở thẻ mới', op.length === 1 && op[0][0] === 'https://zalo.me/0912345678' && op[0][1] === '_blank', JSON.stringify(op));
  check('11c. hiện "Đã chép tin. Dán vào Zalo rồi bấm Gửi." và tin chưa bị đánh dấu', /Đã chép tin/.test(await first.locator('.zq-note').innerText()) && (await emu.obj('zaloQueue/act_11111_lan_2026-11-26')).status === 'cho');
  await shot(adm, 'nhac-qua-zalo-da-chep');
  await first.locator('[data-act="sent"]').click();
  await adm.waitForFunction(() => document.querySelectorAll('.zq-item').length === 1);
  const dq = await emu.obj('zaloQueue/act_11111_lan_2026-11-26');
  check('12a. "Đã gửi" → status "da-gui" + doneAt, tin biến khỏi tab Cần gửi', dq.status === 'da-gui' && dq.doneAt instanceof Date && Date.now() - +dq.doneAt < 60000, JSON.stringify(dq));
  await adm.locator('.zq-item [data-act="skip"]').click();
  await adm.waitForSelector('.adm-empty');
  const dn = await emu.obj('zaloQueue/act_22222_nam_2026-11-26');
  check('12b. "Bỏ qua" → status "bo-qua" + doneAt; tab trống hiện thông báo', dn.status === 'bo-qua' && dn.doneAt instanceof Date && /Chưa có tin nào cần gửi/.test(await adm.locator('.adm-empty').innerText()));
  await adm.click('[data-zq-tab="xong"]');
  await adm.waitForSelector('.zq-item');
  check('12c. tab "Đã xử lý" có 3 tin (đã gửi, bỏ qua, hôm qua)', (await adm.locator('.zq-item').count()) === 3);
  await shot(adm, 'nhac-qua-zalo-da-xu-ly');
  await adm.locator('.zq-item[data-status="bo-qua"] [data-act="undo"]').click();
  await adm.waitForFunction(() => document.querySelectorAll('.zq-item').length === 2);
  const un = await emu.obj('zaloQueue/act_22222_nam_2026-11-26');
  check('12d. "Đưa lại vào hàng chờ" → status "cho", bỏ doneAt', un.status === 'cho' && !('doneAt' in un), JSON.stringify(un));
  check('13. không có lỗi JS ở trang quản trị', !admLogs.some((l) => /pageerror|Uncaught/i.test(l)), admLogs.slice(0, 3).join(' | '));
  const tkOwner = fake.token(owner).idToken;
  check('14. quản trị đọc được zaloQueue (200) nhưng vẫn không đọc được notifyPrivate/notifyCodes (403)', (await rest(adm, 'zaloQueue/act_22222_nam_2026-11-26', tkOwner)) === 200 && (await rest(adm, `notifyPrivate/${lan.uid}`, tkOwner)) === 403 && (await rest(adm, 'notifyCodes/ZZZZZZZZZZ', tkOwner)) === 403);
  await ctx2.close();
  await browser.close();

  const pass = results.filter(Boolean).length;
  console.log(`\nTONG ${tag}: ${pass}/${results.length} đạt`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => {
  console.error('LOI KICH BAN', e);
  process.exit(2);
});
