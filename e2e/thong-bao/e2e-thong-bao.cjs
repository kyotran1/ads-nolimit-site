// E2E "Thông báo ngân sách thấp": mục Thông báo (khách) + Nhắc qua Zalo (quản trị), giả lập như các e2e cũ
// (đăng nhập giả, Firestore emulator chạy luật thật, không gọi mạng thật, Apps Script giả bằng cách ghi thẳng vào emulator).
// Biến môi trường: WEB_PORT, EMU_PORT, W (độ rộng, mặc định 390), THEME=toi|sang, SHOTS_DIR, CONTRAST=1,
// MODE=on|test|off (bản build phải dựng với PUBLIC_MESSENGER_NOTIFY cùng giá trị; mặc định on = chạy đủ luồng Messenger)
const H = '../pwa/';
const { SHOTS, setupContext, chromium, emu, signIn, watchConsole, FakeAuth, BASE } = require(H + 'harness.cjs');
const { seedGlobal, seedCustomer } = require(H + 'seed.cjs');
const { auditPage } = require('../sang-toi/tuong-phan.cjs');
const path = require('path');

const W = Number(process.env.W || 390);
const THEME = process.env.THEME || 'toi';
const CONTRAST = process.env.CONTRAST === '1';
const MODE = process.env.MODE || 'on';
const NO_ANIM = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail);
};
const DAY = 864e5;
// window.open giả: ghi lại lần mở (url, target) và các lần đổi location.href của cửa sổ đó; __blockPopup = true thì trả null như trình duyệt chặn cửa sổ
const STUB = `window.__opened = []; window.__navigated = []; window.__blockPopup = false; window.__closed = 0;
window.open = function (u, t) { window.__opened.push([String(u), String(t)]); if (window.__blockPopup) return null; var w = { opener: {}, close: function () { window.__closed++; } }; Object.defineProperty(w, 'location', { value: { set href(v) { window.__navigated.push(String(v)); } } }); return w; };
window.__zaloClicks = []; document.addEventListener('click', function (e) { var a = e.target && e.target.closest && e.target.closest('a[data-act="open-zalo"]'); if (a) { window.__zaloClicks.push([a.href, a.target]); e.preventDefault(); } }, true);`;
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

  /* ======================== CỜ MESSENGER: off / test ======================== */
  if (MODE !== 'on') {
    console.log(`\n=== CỜ ${MODE} ${tag} ===`);
    const c0 = await mkCtx();
    const p0 = await c0.newPage();
    watchConsole(p0, logs);
    await signIn(p0, lan.email, 'pass-12345', '/tai-khoan/');
    await p0.waitForSelector('#acc-app:not([hidden])');
    const card = () => p0.locator('#nt-msg-card');
    const visible = async () => (await card().count()) === 1 && (await card().isVisible());
    const text = () => p0.locator('[data-view="notify"]').innerText();
    const base = async (name) => {
      check(`${name}: Email và Zalo luôn hiện`, (await p0.locator('#nt-email').isVisible()) && (await p0.locator('#nt-zalo-form').isVisible()) && (await p0.locator('#nt-zalo-phone').isEnabled()));
      check(`${name}: không có chữ "Sắp có" / "Soon" trong mục Thông báo`, !/Sắp có|Coming soon|Soon/i.test(await text()));
      await noOverflow(p0, name);
    };
    const stored = () => p0.evaluate(() => localStorage.getItem('adsnl-tbtest'));
    await openNotify(p0);
    if (MODE === 'off') {
      check('M1. off: thẻ Messenger không có trong trang (cả HTML lẫn giao diện)', (await card().count()) === 0 && (await p0.locator('#nt-connect').count()) === 0 && !/Messenger/.test(await text()));
      await base('off');
      await shot(p0, 'thong-bao-messenger-tat');
      await audit(p0, 'Thông báo (Messenger tắt)');
      await p0.goto(`${BASE}/tai-khoan/?tbtest=1#thong-bao`);
      await p0.waitForSelector('[data-view="notify"]:not([hidden])');
      await loaded(p0);
      check('M2. off: ?tbtest=1 không làm thẻ hiện ra, không ghi khóa thử', (await card().count()) === 0 && (await stored()) === null);
      await p0.evaluate(() => localStorage.setItem('adsnl-tbtest', '1'));
      await p0.reload();
      await p0.waitForSelector('[data-view="notify"]:not([hidden])');
      await loaded(p0);
      check('M3. off: dù khóa thử đã ghi trong trình duyệt, thẻ vẫn không hiện', (await card().count()) === 0);
      check('M4. off: không đọc notifyLinks (không gọi Messenger)', !c0.external.some((e) => /notifyLinks/.test(e.url)));
    } else {
      check('M1. test: chưa bật chế độ thử → thẻ Messenger bị ẩn hoàn toàn (không "Sắp có")', !(await visible()) && !/Messenger/.test(await text()));
      await base('test chưa bật');
      await shot(p0, 'thong-bao-messenger-test-chua-bat');
      await p0.goto(`${BASE}/tai-khoan/?tbtest=1#thong-bao`);
      await p0.waitForSelector('[data-view="notify"]:not([hidden])');
      await loaded(p0);
      check('M2. test: mở ?tbtest=1 → thẻ Messenger hiện, khóa adsnl-tbtest = "1"', (await visible()) && (await stored()) === '1');
      await base('test đã bật');
      await shot(p0, 'thong-bao-messenger-test-da-bat');
      await audit(p0, 'Thông báo (Messenger chế độ thử)');
      await p0.goto(`${BASE}/tai-khoan/#thong-bao`);
      await p0.waitForSelector('[data-view="notify"]:not([hidden])');
      await loaded(p0);
      check('M3. test: bỏ tham số (mở lần sau) → thẻ vẫn hiện nhờ khóa đã ghi', await visible());
      await p0.goto(`${BASE}/tai-khoan/?tbtest=0#thong-bao`);
      await p0.waitForSelector('[data-view="notify"]:not([hidden])');
      await loaded(p0);
      check('M4. test: ?tbtest=0 → thẻ ẩn lại, khóa bị xóa', !(await visible()) && (await stored()) === null);
      await p0.goto(`${BASE}/tai-khoan/#thong-bao`);
      await p0.waitForSelector('[data-view="notify"]:not([hidden])');
      await loaded(p0);
      check('M5. test: sau ?tbtest=0, mở lại không tham số vẫn ẩn', !(await visible()));
      // Máy khác (ngữ cảnh mới, chưa bật): khách thường không thấy
      const c1 = await mkCtx();
      const p1 = await c1.newPage();
      await signIn(p1, nam.email, 'pass-12345', '/tai-khoan/');
      await openNotify(p1);
      check('M6. test: khách khác chưa bật chế độ thử không thấy thẻ Messenger', !(await p1.locator('#nt-msg-card').isVisible()));
      await c1.close();
    }
    check('M9. không có lỗi JS', !logs.some((l) => /pageerror|Uncaught|insufficient permissions/i.test(l)), logs.slice(0, 3).join(' | '));
    await c0.close();
    await browser.close();
    const pass0 = results.filter(Boolean).length;
    console.log(`\nTONG ${MODE} ${tag}: ${pass0}/${results.length} đạt`);
    process.exit(pass0 === results.length ? 0 : 1);
  }

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
  check('1b2. V2: trước khi nối, câu hướng dẫn nằm dưới nút "Nối Messenger"', /Bạn bấm Bắt đầu \/ Get started, hoặc dán dòng mã đã chép rồi gửi/.test(await page.locator('[data-when="off"]').innerText()));
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
  const opened = await page.evaluate(() => ({ o: window.__opened, n: window.__navigated }));
  check('4b. V1: cửa sổ mở NGAY lúc bấm (window.open("", "_blank")), rồi đổi sang m.me/adsnolimit.agency2610?ref=NOI-<mã> sau khi lưu mã', opened.o.length === 1 && opened.o[0][0] === '' && opened.o[0][1] === '_blank' && opened.n.length === 1 && opened.n[0] === `https://m.me/adsnolimit.agency2610?ref=NOI-${code}`, JSON.stringify(opened));
  check('4b2. V1: dòng "Nối thông báo NOI-<mã>" đã được chép vào bộ nhớ tạm ngay lúc bấm', (await page.evaluate(() => navigator.clipboard.readText())) === `Nối thông báo NOI-${code}`);
  check('4b3. V2: hướng dẫn mới "Bấm Bắt đầu / Get started, hoặc dán dòng mã đã chép rồi gửi"', /Messenger sẽ mở cuộc trò chuyện với page ADS-Nolimit\. Bạn bấm Bắt đầu \/ Get started, hoặc dán dòng mã đã chép rồi gửi\./.test(await page.locator('[data-when="wait"]').innerText()));
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
  // N3: còn mã cũ của máy này thì xóa trước khi tạo mã mới (mã cũ được cấy vào localStorage + emulator)
  await emu.set('notifyCodes/OLDCODE001', { uid: lan.uid, createdAt: new Date(Date.now() - 3600e3) });
  await page.evaluate((u) => localStorage.setItem('nolimit.notify.pending', JSON.stringify({ code: 'OLDCODE001', uid: u, at: Date.now() - 3600e3 })), lan.uid);
  await page.reload();
  await page.waitForSelector('#acc-app:not([hidden])');
  await loaded(page);
  await page.evaluate(() => document.getElementById('nt-connect').click());
  await page.waitForFunction(() => document.getElementById('nt-code-text')?.textContent && !document.getElementById('nt-code-text').textContent.includes('OLDCODE001'));
  await page.waitForTimeout(400);
  const left = await emu.all('notifyCodes');
  check('5c. N3: nối lại khi còn mã cũ → mã cũ bị xóa, chỉ còn đúng 1 mã mới của khách', left.length === 1 && left[0].id !== 'OLDCODE001' && /^[A-Z0-9]{10}$/.test(left[0].id), JSON.stringify(left.map((x) => x.id)));
  await page.click('#nt-cancel');
  await page.waitForSelector('#nt-msg[data-state="off"]');
  await page.waitForTimeout(400);
  // V1: trình duyệt chặn cửa sổ (window.open trả null) → dùng nút "Mở lại Messenger", vẫn chép dòng mã
  await page.evaluate(() => { window.__blockPopup = true; window.__navigated = []; navigator.clipboard.writeText('xoa'); });
  await page.click('#nt-connect');
  await page.waitForSelector('#nt-msg[data-state="wait"]');
  const blockedCode = (await emu.all('notifyCodes'))[0].id;
  check('5d. V1: cửa sổ bị chặn → báo "Mở lại Messenger", nút đó trỏ đúng link, dòng mã vẫn được chép', /Messenger chưa tự mở/.test(await page.locator('#nt-status').innerText()) && (await page.getAttribute('#nt-reopen', 'href')) === `https://m.me/adsnolimit.agency2610?ref=NOI-${blockedCode}` && (await page.evaluate(() => navigator.clipboard.readText())) === `Nối thông báo NOI-${blockedCode}`, JSON.stringify([await page.locator('#nt-status').innerText(), await page.getAttribute('#nt-reopen', 'href'), blockedCode, await page.evaluate(() => navigator.clipboard.readText())]));
  await page.evaluate(() => { window.__blockPopup = false; });
  await page.click('#nt-cancel');
  await page.waitForSelector('#nt-msg[data-state="off"]');
  await page.waitForTimeout(400);
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

  /* ======================== V4: khách chưa có hồ sơ users/{uid} ======================== */
  {
    const kim = fake.addUser({ email: 'kim@example.com', password: 'pass-12345', displayName: 'Kim Lê', emailVerified: true });
    const ctxK = await mkCtx();
    const pk = await ctxK.newPage();
    const kLogs = [];
    watchConsole(pk, kLogs);
    await signIn(pk, kim.email, 'pass-12345', '/tai-khoan/');
    await pk.waitForSelector('#acc-app:not([hidden])');
    // Mở trang tự tạo hồ sơ khi đăng nhập: xóa đi rồi chuyển sang mục Thông báo bằng menu (không tải lại trang) để mô phỏng khách chưa có hồ sơ
    for (let i = 0; i < 40 && !(await emu.obj(`users/${kim.uid}`)); i++) await wait(250); // chờ hồ sơ tự tạo xong rồi mới xóa
    await wait(500);
    await emu.del(`users/${kim.uid}`);
    await pk.click('a[data-route="notify"]');
    await pk.waitForSelector('[data-view="notify"]:not([hidden])');
    await loaded(pk);
    check('15a. V4: khách mới chưa có users/{uid} (đã xóa, trang không tự tạo lại khi chuyển mục)', (await emu.obj(`users/${kim.uid}`)) === null, JSON.stringify(await emu.obj(`users/${kim.uid}`)));
    await pk.locator('#nt-email').uncheck();
    await pk.waitForFunction(() => document.getElementById('nt-status')?.textContent?.includes('Đã lưu'));
    const u1 = await emu.obj(`users/${kim.uid}`);
    check('15b. V4: tắt email lần đầu → tạo hồ sơ tối thiểu kèm notify (setDoc merge, không lỗi not-found)', u1 && u1.notify && u1.notify.email === false && u1.displayName === 'Kim Lê' && u1.email === kim.email && u1.createdAt instanceof Date, JSON.stringify(u1));
    check('15c. V4: không hiện lỗi, không lỗi JS trong lúc lưu', !(await pk.locator('#nt-alert').innerText()).trim() && !kLogs.some((l) => /pageerror|Uncaught/i.test(l)), kLogs.slice(0, 2).join(' | '));
    await pk.locator('#nt-email').check();
    await pk.waitForTimeout(800);
    const u2 = await emu.obj(`users/${kim.uid}`);
    check('15d. V4: lưu lần sau dùng updateDoc: giữ createdAt cũ, notify.email = true', u2.notify.email === true && +u2.createdAt === +u1.createdAt, JSON.stringify(u2));
    await ctxK.close();
  }

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
  const copyBtn = first.locator('[data-act="copy-open"]');
  const zaloA = first.locator('[data-act="open-zalo"]');
  check('11-. V5: trước khi chép, chỉ có nút "Chép tin & mở Zalo" (liên kết Mở Zalo còn ẩn)', (await copyBtn.isVisible()) && !(await zaloA.isVisible()));
  await copyBtn.click();
  await zaloA.waitFor({ state: 'visible' });
  const clip = await adm.evaluate(() => navigator.clipboard.readText());
  const op = await adm.evaluate(() => ({ o: window.__opened, c: window.__zaloClicks }));
  check('11a. V5: bấm lần 1 → bộ nhớ tạm đúng nội dung tin (chờ chép xong rồi mới đổi nút)', clip === txt, JSON.stringify(clip));
  const ah = await zaloA.evaluate((a) => ({ href: a.href, target: a.target, rel: a.rel, tag: a.tagName, h: Math.round(a.getBoundingClientRect().height) }));
  check('11b. V5: nút đổi thành liên kết thật <a href="https://zalo.me/0912345678" target="_blank" rel="noopener"> cao ≥ 48px, không dùng window.open', ah.tag === 'A' && ah.href === 'https://zalo.me/0912345678' && ah.target === '_blank' && /noopener/.test(ah.rel) && ah.h >= 48 && op.o.length === 0, JSON.stringify({ ah, op }));
  check('11c. hiện "Đã chép — bấm Mở Zalo" và tin chưa bị đánh dấu', /Đã chép — bấm Mở Zalo/.test(await first.locator('.zq-note').innerText()) && !(await copyBtn.isVisible()) && (await emu.obj('zaloQueue/act_11111_lan_2026-11-26')).status === 'cho');
  await zaloA.click();
  const clicks = await adm.evaluate(() => window.__zaloClicks);
  check('11d. V5: bấm lần 2 vào liên kết là một cú bấm thật vào <a target=_blank> tới zalo.me/0912345678', clicks.length === 1 && clicks[0][0] === 'https://zalo.me/0912345678' && clicks[0][1] === '_blank', JSON.stringify(clicks));
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
  // N6: tab "Đã xử lý" chỉ lấy 100 tin mới nhất theo createdAt giảm dần (status in [da-gui, bo-qua] + orderBy + limit)
  for (let i = 0; i < 104; i++) await emu.set(`zaloQueue/old_${String(i).padStart(3, '0')}`, { uid: nam.uid, actId: 'act_' + i, name: 'Cũ ' + i, accountName: 'TK ' + i, phone: '0988777666', text: 'Tin cũ ' + i, createdAt: new Date(Date.now() - (10 + i) * DAY), status: i % 2 ? 'da-gui' : 'bo-qua', doneAt: new Date(Date.now() - (9 + i) * DAY) });
  await adm.click('[data-zq-tab="xong"]');
  await adm.waitForFunction(() => document.querySelectorAll('.zq-item').length >= 100);
  const names = await adm.locator('.zq-item .zq-who').allInnerTexts();
  const ts = await adm.locator('.zq-item').evaluateAll((els) => els.length);
  check('12e. N6: tab "Đã xử lý" hiện đúng 100 tin (có 106 tin đã xử lý), mới nhất trước, tin cũ nhất bị cắt', ts === 100 && /Nam Trần|Lan Nguyễn/.test(names[0]) && names.includes('Cũ 0') && !names.includes('Cũ 103'), JSON.stringify({ ts, first: names.slice(0, 3), last: names.slice(-2) }));
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
