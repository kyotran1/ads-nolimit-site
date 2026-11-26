// Đăng nhập / tạo tài khoản bằng Facebook (kế hoạch docs/superpowers/plans/2026-11-26-dang-nhap-facebook.md).
// Cần BA bản build: cờ BẬT (PUBLIC_FB_LOGIN=on) phục vụ ở WEB_PORT, cờ TẮT (build thường) phục vụ ở OFF_PORT, chế độ THỬ (PUBLIC_FB_LOGIN=test) ở TEST_PORT,
// và emulator Firestore (trang Tài khoản). Facebook/Firebase đều là bản giả (e2e/dang-nhap-fb/fb-harness.cjs), không gọi mạng thật. Chạy:
//   bash e2e/pwa/serve.sh 4380 <dist-fb>; bash e2e/pwa/serve.sh 4381 <dist>; bash e2e/pwa/serve.sh 4382 <dist-fbtest>
//   cd firebase && npx firebase --config ../e2e/dang-nhap-fb/firebase.8097.json emulators:exec --only firestore --project demo-ads-nolimit \
//     "WEB_PORT=4380 OFF_PORT=4381 TEST_PORT=4382 EMU_PORT=8097 SHOTS_DIR=<thư mục ảnh> node ../e2e/dang-nhap-fb/e2e-dang-nhap-fb.cjs"
const path = require('path');
const { SHOTS, setupContext, chromium, emu, watchConsole, step: stepAll, assert, eq, has, results, BASE, FakeAuth } = require('../pwa/harness.cjs');
const { auditPage } = require('../sang-toi/tuong-phan.cjs');
const { installFacebookPopup, lastOpen, finishPopup } = require('./fb-harness.cjs');

// ONLY=<biểu thức chính quy>: chỉ chạy các bước có tên khớp (để dò lỗi)
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const step = (name, fn) => (!ONLY || ONLY.test(name) ? stepAll(name, fn) : Promise.resolve());
const OFF = 'http://127.0.0.1:' + (process.env.OFF_PORT || '4381');
const TEST = 'http://127.0.0.1:' + (process.env.TEST_PORT || '4382');

const UA = {
  chromeDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  iphone26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  fbIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 [FBAN/FBIOS;FBAV/530.0.0.40.98;FBBV/123;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.6;FBSS/3;FBID/phone;FBLC/vi_VN;FBOP/5]',
  fbAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.38.108;]',
  zaloIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo/24.5.1',
};
const LIGHT = `try { localStorage.setItem('adsnl-theme', 'light'); } catch (e) {}`;
const SKIP_ONBOARD = `try { sessionStorage.setItem('adsnl-ob-skip', '1'); } catch (e) {}`;
const PAGES = [
  ['/dang-nhap/', 'vi', 'signin', 'Tiếp tục với Facebook'],
  ['/dang-ky/', 'vi', 'signup', 'Tiếp tục với Facebook'],
  ['/en/sign-in/', 'en', 'signin', 'Continue with Facebook'],
  ['/en/sign-up/', 'en', 'signup', 'Continue with Facebook'],
];

const logs = [];
let seq = 0;
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(SHOTS, name + '.png'), ...opts });

// Ảnh vùng đăng nhập: cuộn tới khung nút rồi chụp đúng khung nhìn (ảnh cả trang bị thanh liên hệ nổi cố định che giữa trang).
const shotLogin = async (page, name) => {
  await page.evaluate(() => { const el = document.querySelector('.auth-providers'); if (el) window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 260); });
  await page.waitForTimeout(250);
  await shot(page, name);
};
async function newCtx(browser, { ua = UA.chromeDesktop, width = 1440, light = false, fake } = {}) {
  const mobile = width < 1080 && ua !== UA.chromeDesktop;
  const ctx = await setupContext(browser, {
    ...(fake ? { fake } : {}),
    viewport: { width, height: width < 600 ? 844 : 900 },
    deviceScaleFactor: 2,
    userAgent: ua,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  await installFacebookPopup(ctx);
  await ctx.addInitScript(SKIP_ONBOARD);
  if (light) await ctx.addInitScript(LIGHT);
  // Bản build cờ TẮT chạy ở cổng khác: cho đi qua như máy chủ chính (đăng ký sau → được xử lý trước route chung).
  await ctx.route((u) => u.origin === OFF || u.origin === TEST, (r) => r.continue());
  return ctx;
}
async function open(browser, p, o = {}) {
  const ctx = await newCtx(browser, o);
  const page = await ctx.newPage();
  watchConsole(page, logs);
  await page.goto((o.base || BASE) + p, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  return { ctx, page };
}
const waitPopup = (page, count = 1) => page.waitForFunction((n) => window.__opens.length >= n, count, { timeout: 8000 });
const alertText = (page, id) => page.$eval(id, (e) => e.innerText.replace(/\s+/g, ' ').trim());
const visible = (page, sel) => page.$$eval(sel, (els) => els.filter((e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0).length);
const box = (page, sel) => page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
const facebookRequests = (ctx) => ctx.external.filter((x) => /facebook|fbcdn|fb\.com/i.test(x.url));

/** Đăng nhập Facebook bằng cách bấm nút ở trang đăng nhập, hoàn tất cửa sổ giả, chờ sang trang Tài khoản. */
async function facebookSignIn(browser, fake, token, { lang = 'vi', width = 1440, ua, light } = {}) {
  const ctx = await newCtx(browser, { ua, width, light, fake });
  const page = await ctx.newPage();
  watchConsole(page, logs);
  await page.goto(BASE + (lang === 'en' ? '/en/sign-in/' : '/dang-nhap/'));
  await page.click('#signin-facebook');
  await waitPopup(page);
  await finishPopup(page, { token });
  await page.waitForURL(/\/(en\/account|tai-khoan)\//, { timeout: 10000 });
  await page.waitForSelector('#acc-app:not([hidden])');
  await page.waitForTimeout(600);
  return { ctx, page };
}
const hashTo = async (page, h) => { await page.evaluate((x) => (location.hash = x), h); await page.waitForTimeout(500); };

(async () => {
  await emu.clear();
  const browser = await chromium.launch();

  // ---------- 1. Cờ TẮT: không có nút, không nạp mã Facebook ----------
  for (const [p, lang, key] of PAGES) {
    await step(`(1) cờ tắt ${p}: không có nút Facebook, không khung xếp nút, không nạp mã/mạng Facebook`, async () => {
      const { ctx, page } = await open(browser, p, { base: OFF });
      const urls = [];
      page.on('request', (r) => urls.push(r.url()));
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(400);
      eq(await page.$(`#${key}-facebook`), null, 'không có nút Facebook');
      eq(await page.$('.auth-providers'), null, 'không có khung xếp nút');
      eq(await visible(page, `#${key}-google`), 1, 'nút Google vẫn còn');
      const html = await page.content();
      assert(!/Tiếp tục với Facebook|Continue with Facebook/.test(html), 'không còn chữ nút Facebook trong trang');
      eq(urls.filter((u) => /facebook-flow|facebook/i.test(u)).length, 0, 'không tải tệp nào có chữ facebook: ' + urls.filter((u) => /facebook/i.test(u)).join(','));
      eq(facebookRequests(ctx).length, 0, 'không có yêu cầu mạng tới Facebook');
      // Ghi chú dưới nút Google giữ nguyên chữ cũ (chỉ nhắc Google)
      has(await page.$eval('.auth-note, .auth-switch', (e) => e.textContent), '', 'ok');
      await ctx.close();
    });
  }
  await step('(1) cờ tắt: UA trong app Facebook cũng không đổi gì (không dòng nhắc, không nút)', async () => {
    const { ctx, page } = await open(browser, '/dang-nhap/', { base: OFF, ua: UA.fbIos, width: 430 });
    eq(await page.$('#signin-facebook'), null, 'không nút');
    eq(await page.$('[data-google-note]'), null, 'không dòng nhắc');
    await ctx.close();
  });
  await step('(1) cờ tắt: trang Tài khoản không có nút Nối Facebook (bản tĩnh)', async () => {
    const html = await (await fetch(OFF + '/tai-khoan/')).text();
    assert(!/id="fb-link"/.test(html), 'không có #fb-link');
    assert(/id="fb-unlink"/.test(html), 'vẫn có chỗ bỏ nối (khách đã nối từ trước)');
  });

  // ---------- 2. Cờ BẬT: nút có ở cả 4 trang, đúng chữ, ≥ 44px, 390/430/1440 sáng + tối ----------
  for (const [p, lang, key, label] of PAGES) {
    await step(`(2) cờ bật ${p}: nút "${label}" dưới nút Google, ≥ 44px, 390/430/1440 × sáng/tối, không tràn ngang, tương phản`, async () => {
      for (const width of [390, 430, 1440]) for (const light of [false, true]) {
        const { ctx, page } = await open(browser, p, { width, light, ua: width < 1080 ? UA.iphone26 : UA.chromeDesktop });
        const tag = `${p}@${width}${light ? ' sáng' : ' tối'}`;
        eq(await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'light'), light, tag + ' giao diện');
        eq((await page.$eval(`#${key}-facebook`, (e) => e.textContent.trim())), label, tag + ' chữ nút');
        const g = await box(page, `#${key}-google`), f = await box(page, `#${key}-facebook`);
        assert(f.h >= 44 && f.w >= 44, `${tag}: nút ${f.w}×${f.h}`);
        assert(f.y > g.y, `${tag}: nút Facebook phải nằm DƯỚI nút Google (${f.y} > ${g.y})`);
        assert(Math.abs(f.w - g.w) < 1, `${tag}: bằng chiều rộng nút Google`);
        eq(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, tag + ' không tràn ngang');
        eq(await visible(page, '[data-google-note]'), 0, tag + ' trình duyệt thường không có dòng nhắc Google');
        eq((await page.$eval(`#${key}-facebook .fb-mark path`, (e) => e.getAttribute('fill'))), '#1877F2', tag + ' logo giữ màu Facebook');
        const loi = (await auditPage(page)).filter((l) => /auth-|btn-facebook|btn-google|auth-card/.test(l.sel));
        assert(loi.length === 0, `${tag} tương phản: ${JSON.stringify(loi.slice(0, 3))}`);
        if (p === '/dang-nhap/' && ((width === 430) || (width === 1440 && !light))) await shotLogin(page, `dang-nhap-${width}-${light ? 'sang' : 'toi'}`);
        if (p === '/dang-nhap/' && width === 1440 && light) await shotLogin(page, 'dang-nhap-1440-sang');
        await ctx.close();
      }
    });
  }

  // ---------- 3. Bấm → gọi đúng popup Facebook NGAY trong lúc bấm ----------
  for (const [p, lang, key] of PAGES) {
    await step(`(3) ${p}: bấm → cửa sổ Facebook mở ngay trong lúc bấm (userActivation.isActive), đúng nhà cung cấp, không mạng Facebook`, async () => {
      const { ctx, page } = await open(browser, p);
      if (key === 'signup') await page.check('#signup-consent');
      await page.click(`#${key}-facebook`);
      await waitPopup(page);
      const o = await lastOpen(page);
      eq(o.active, true, 'userActivation.isActive lúc window.open');
      eq(o.host, 'ads-nolimit-web.firebaseapp.com', 'host đăng nhập Firebase');
      eq(o.path, '/__/auth/handler', 'đường dẫn handler');
      eq(o.providerId, 'facebook.com', 'providerId');
      assert(o.scopes.includes('email') && o.scopes.includes('public_profile'), 'scope email + public_profile: ' + o.scopes);
      eq(o.custom.display, 'popup', 'máy tính: display=popup');
      eq(o.authType, 'signInViaPopup', 'authType');
      eq(await page.$eval(`#${key}-facebook`, (b) => b.getAttribute('aria-busy')), 'true', 'nút báo đang xử lý');
      has(await page.$eval(`#${key}-facebook`, (b) => b.textContent), lang === 'en' ? 'Opening Facebook' : 'Đang mở Facebook', 'chữ đang mở');
      // Khách tự đóng cửa sổ → im lặng, nút trả lại
      await finishPopup(page, { error: { code: 'auth/popup-closed-by-user', message: 'x' } });
      await page.waitForFunction((id) => !document.getElementById(id).hasAttribute('aria-busy'), `${key}-facebook`);
      eq(await alertText(page, `#${key}-alert`), '', 'đóng cửa sổ: không báo lỗi');
      eq(facebookRequests(ctx).length, 0, 'không có yêu cầu mạng trực tiếp tới Facebook (chỉ Firebase)');
      await ctx.close();
    });
  }
  await step('(3) trang Đăng ký: chưa tick đồng ý → không mở cửa sổ, báo ở ô đồng ý; tick xong mới mở', async () => {
    const { ctx, page } = await open(browser, '/dang-ky/');
    await page.click('#signup-facebook');
    await page.waitForTimeout(400);
    eq(await page.evaluate(() => window.__opens.length), 0, 'chưa mở cửa sổ');
    has(await page.$eval('#signup-consent-error', (e) => e.textContent), 'đồng ý', 'báo cần đồng ý');
    await page.check('#signup-consent');
    await page.click('#signup-facebook');
    await waitPopup(page);
    await ctx.close();
  });
  await step('(3) popup bị chặn → báo cho phép cửa sổ bật lên (vi + en); Facebook chưa bật ở Firebase → nhắn dùng Google/email', async () => {
    for (const [p, lang, key] of [['/dang-nhap/', 'vi', 'signin'], ['/en/sign-in/', 'en', 'signin']]) {
      const { ctx, page } = await open(browser, p);
      await page.evaluate(() => (window.__blockPopups = true));
      await page.click(`#${key}-facebook`);
      await page.waitForFunction(() => document.getElementById('signin-alert').innerText.length > 0);
      has(await alertText(page, '#signin-alert'), lang === 'en' ? 'Allow pop-ups' : 'cửa sổ bật lên', 'popup-blocked');
      assert(!(await page.$eval('#signin-facebook', (b) => b.disabled)), 'nút mở lại');
      await page.evaluate(() => (window.__blockPopups = false));
      ctx.fake.nextError['accounts:signInWithIdp'] = 'OPERATION_NOT_ALLOWED';
      ctx.fake.addFacebookProfile('FB-OFF', { email: 'x@example.com' });
      await page.click(`#${key}-facebook`);
      await waitPopup(page, 2);
      await finishPopup(page, { token: 'FB-OFF' });
      await page.waitForFunction(() => /Google/.test(document.getElementById('signin-alert').innerText));
      has(await alertText(page, '#signin-alert'), lang === 'en' ? 'Google or your email for now' : 'Google hoặc email tạm thời', 'operation-not-allowed');
      await ctx.close();
    }
  });

  // ---------- 4. Facebook CÓ email (chưa xác minh) → vào Tài khoản, lời nhắc + nút gửi email xác minh ----------
  await step('(4) Facebook có email → vào Tài khoản; lời nhắc xác minh + nút "Gửi email xác minh"; Bảo mật hiện "Facebook"', async () => {
    const fake = new FakeAuth();
    fake.addFacebookProfile('FB-MAIL', { email: 'lan.fb@example.com', displayName: 'Lan Facebook', emailVerified: false });
    const { ctx, page } = await facebookSignIn(browser, fake, 'FB-MAIL');
    eq(new URL(page.url()).pathname, '/tai-khoan/', 'vào trang Tài khoản');
    const u = fake.facebookUser('FB-MAIL');
    assert(u, 'khách được tạo');
    has(await alertText(page, '#acc-notice'), 'lan.fb@example.com', 'lời chào nêu email');
    has(await alertText(page, '#acc-notice'), 'chưa được xác minh', 'nhắc xác minh');
    eq(await visible(page, '#mailgap'), 1, 'khối xác minh hiện');
    has(await alertText(page, '#mailgap-title-verify'), 'Xác minh email', 'tiêu đề');
    eq(await page.$eval('#mailgap', (e) => e.getAttribute('aria-labelledby')), 'mailgap-title-verify', 'aria-labelledby trỏ đúng tiêu đề đang hiện');
    eq(await visible(page, '#mailgap-form'), 0, 'không có ô nhập email (đã có email)');
    eq(await visible(page, '#mailgap-send'), 1, 'nút gửi hiện');
    eq(await page.$eval('#mailgap-send', (b) => b.textContent.trim()), 'Gửi email xác minh', 'chữ nút');
    assert((await box(page, '#mailgap-send')).h >= 44, 'nút ≥ 44px');
    // không chặn xem: menu và nội dung chính vẫn dùng được
    await page.click('a[data-route="orders"]'); await page.waitForTimeout(300);
    eq(await visible(page, '[data-view="orders"]'), 1, 'vẫn mở được mục Đơn hàng');
    await page.click('#mailgap-send');
    await page.waitForFunction(() => document.getElementById('mailgap-status').innerText.length > 0);
    has(await alertText(page, '#mailgap-status'), 'lan.fb@example.com', 'báo đã gửi');
    assert(fake.calls.some((c) => c.endpoint === 'accounts:sendOobCode' && c.body.requestType === 'VERIFY_EMAIL'), 'Firebase được gọi gửi email xác minh');
    await hashTo(page, 'bao-mat');
    eq(await alertText(page, '#acc-provider'), 'Facebook', 'Đăng nhập bằng: Facebook');
    has(await alertText(page, '#acc-email'), 'lan.fb@example.com', 'email');
    eq(await visible(page, '#acc-verify'), 1, 'nút gửi lại email xác minh ở Bảo mật cũng hiện (như khách email chưa xác minh)');
    eq(await visible(page, '#pw-section'), 0, 'không có đổi mật khẩu');
    has(await alertText(page, '#google-only'), 'Facebook', 'câu "không có mật khẩu riêng" nêu Facebook');
    await shot(page, 'bao-mat-facebook-toi', { fullPage: true });
    // khách bấm link xác minh rồi bấm "Tôi đã xác minh"
    u.emailVerified = true;
    await hashTo(page, 'tong-quan');
    await page.click('#mailgap-done');
    await page.waitForFunction(() => document.getElementById('mailgap').hidden);
    await ctx.close();
  });
  await step('(4) khách email & mật khẩu chưa xác minh: KHÔNG hiện khối mới (cách cũ giữ nguyên) và vẫn thấy nút Gửi lại email xác minh', async () => {
    const fake = new FakeAuth();
    const pu = fake.addUser({ email: 'cu@example.com', password: 'Mk-12345678', displayName: 'Khách cũ', emailVerified: false });
    const ctx = await newCtx(browser, { fake });
    const page = await ctx.newPage();
    await page.goto(BASE + '/dang-nhap/?next=%2Ftai-khoan%2F%23bao-mat');
    await page.fill('#signin-email', pu.email); await page.fill('#signin-password', 'Mk-12345678');
    await page.click('#signin-form button[type=submit]');
    await page.waitForURL(/\/tai-khoan\//); await page.waitForSelector('#acc-app:not([hidden])'); await page.waitForTimeout(500);
    eq(await visible(page, '#mailgap'), 0, 'khối mới ẩn');
    eq(await visible(page, '#acc-verify'), 1, 'nút gửi lại email xác minh hiện');
    eq(await alertText(page, '#acc-provider'), 'Email & mật khẩu', 'cách đăng nhập');
    eq(await visible(page, '#fb-box'), 1, 'cờ bật: có hộp Facebook');
    eq(await visible(page, '#fb-link'), 1, 'có nút Nối Facebook');
    eq(await visible(page, '#fb-unlink'), 0, 'chưa nối thì không có nút bỏ nối');
    await ctx.close();
  });

  // ---------- 5. Facebook KHÔNG email → khối "Thêm email" ----------
  await step('(5) Facebook không email → khối "Thêm email…" hiện; xem mục khác bình thường; "Chưa có email"; nạp tiền nhắc thêm email', async () => {
    const fake = new FakeAuth();
    fake.addFacebookProfile('FB-NOMAIL', { email: '', displayName: 'Minh Điện Thoại' });
    const { ctx, page } = await facebookSignIn(browser, fake, 'FB-NOMAIL', { width: 430, ua: UA.iphone26 });
    const u = fake.facebookUser('FB-NOMAIL');
    eq(!!u.email, false, 'khách không có email');
    has(await alertText(page, '#acc-notice'), 'không chia sẻ email', 'lời chào');
    eq(await visible(page, '#mailgap'), 1, 'khối hiện');
    eq(await alertText(page, '#mailgap-title-add'), 'Thêm email để nhận thông báo và được cấp quyền xem báo cáo', 'đúng tiêu đề trong kế hoạch');
    eq(await visible(page, '#mailgap-form'), 1, 'có ô nhập email');
    assert((await box(page, '#mailgap-form button[type=submit]')).h >= 44 && (await box(page, '#mailgap-email')).h >= 44, 'nút và ô ≥ 44px');
    eq(await alertText(page, '#side-email'), 'Chưa có email', 'menu: Chưa có email');
    await shot(page, 'them-email-430-toi', { fullPage: true });
    // lỗi nhập
    await page.click('#mailgap-form button[type=submit]');
    has(await page.$eval('#mailgap-email-error', (e) => e.textContent), 'Vui lòng nhập email', 'trống');
    await page.fill('#mailgap-email', 'khach@'); await page.click('#mailgap-form button[type=submit]');
    has(await page.$eval('#mailgap-email-error', (e) => e.textContent), 'chưa đúng định dạng', 'sai định dạng');
    eq(fake.calls.filter((c) => c.body && c.body.requestType === 'VERIFY_AND_CHANGE_EMAIL').length, 0, 'chưa gọi Firebase');
    // nạp tiền khi chưa có email: không im lặng
    await hashTo(page, 'nap-tien');
    await page.evaluate(() => document.getElementById('tp-form').requestSubmit());
    await page.waitForFunction(() => document.getElementById('tp-alert').innerText.length > 0);
    has(await alertText(page, '#tp-alert'), 'chưa có email', 'nhắc thêm email khi nạp');
    // Bảo mật: Chưa có email, không có nút xác minh
    await hashTo(page, 'bao-mat');
    eq(await alertText(page, '#acc-email'), 'Chưa có email', 'Bảo mật: Chưa có email');
    eq(await visible(page, '#acc-verified'), 0, 'không có huy hiệu xác minh');
    eq(await visible(page, '#acc-verify'), 0, 'không có nút gửi lại xác minh');
    // thêm email hợp lệ
    await hashTo(page, 'tong-quan');
    await page.fill('#mailgap-email', 'minh@example.com');
    await page.click('#mailgap-form button[type=submit]');
    await page.waitForFunction(() => document.getElementById('mailgap-status').innerText.length > 0);
    const call = fake.calls.find((c) => c.body && c.body.requestType === 'VERIFY_AND_CHANGE_EMAIL');
    assert(call, 'Firebase được gọi verifyBeforeUpdateEmail'); eq(call.body.newEmail, 'minh@example.com', 'email mới');
    has(await alertText(page, '#mailgap-status'), 'minh@example.com', 'báo đã gửi');
    eq(await visible(page, '#mailgap-done'), 1, 'nút Tôi đã xác minh hiện');
    // chưa bấm link → báo chưa
    await page.click('#mailgap-done');
    await page.waitForFunction(() => document.getElementById('mailgap-alert').innerText.length > 0);
    has(await alertText(page, '#mailgap-alert'), 'chưa được thêm', 'chưa xác minh');
    // khách bấm link trong thư
    fake.confirmPendingEmail(u);
    await page.click('#mailgap-done');
    await page.waitForFunction(() => document.getElementById('mailgap').hidden, null, { timeout: 8000 });
    eq(await alertText(page, '#side-email'), 'minh@example.com', 'menu có email mới');
    has(await alertText(page, '#acc-notice'), 'Đã thêm và xác minh email', 'thông báo xong');
    let prof = null;
    for (let i = 0; i < 20 && !(prof && prof.email); i++) { await page.waitForTimeout(250); prof = await emu.obj(`users/${u.uid}`); }
    eq(prof && prof.email, 'minh@example.com', 'email được ghi vào hồ sơ (Firestore, qua luật thật)');
    await ctx.close();
  });
  await step('(5) bản tiếng Anh: khối Thêm email + chữ báo', async () => {
    const fake = new FakeAuth();
    fake.addFacebookProfile('FB-NOMAIL-EN', { email: '', displayName: 'Mai Phone' });
    const { ctx, page } = await facebookSignIn(browser, fake, 'FB-NOMAIL-EN', { lang: 'en', width: 390, ua: UA.iphone26 });
    eq(new URL(page.url()).pathname, '/en/account/', 'trang Account tiếng Anh');
    eq(await alertText(page, '#mailgap-title-add'), 'Add an email to get notifications and report access', 'tiêu đề en');
    has(await alertText(page, '#acc-notice'), 'did not share an email', 'lời chào en');
    eq(await alertText(page, '#side-email'), 'No email yet', 'No email yet');
    await ctx.close();
  });

  // ---------- 6. Email trùng → thông báo đúng; đăng nhập cách cũ → nối Facebook ----------
  await step('(6) Facebook báo email trùng tài khoản email & mật khẩu → thông báo đúng; đăng nhập cách cũ → linkWithCredential; chứng nhận không nằm trong localStorage', async () => {
    const fake = new FakeAuth();
    const old = fake.addUser({ email: 'trung@example.com', password: 'Mk-12345678', displayName: 'Trung', emailVerified: true });
    fake.addFacebookProfile('FB-DUP', { email: 'trung@example.com', displayName: 'Trung FB' });
    const ctx = await newCtx(browser, { width: 430, ua: UA.iphone26, fake });
    const page = await ctx.newPage();
    watchConsole(page, logs);
    await page.goto(BASE + '/dang-nhap/');
    await page.click('#signin-facebook');
    await waitPopup(page);
    await finishPopup(page, { token: 'FB-DUP' });
    await page.waitForFunction(() => document.getElementById('signin-alert').innerText.length > 0);
    const msg = await alertText(page, '#signin-alert');
    has(msg, 'Email trung@example.com đã có tài khoản ADS-Nolimit', 'nêu email');
    has(msg, 'Google hoặc email & mật khẩu', 'hướng dẫn cách cũ');
    has(msg, 'tự nối Facebook', 'sẽ tự nối');
    assert(!(await page.$eval('#signin-facebook', (b) => b.disabled)) && !(await page.$eval('#signin-form button[type=submit]', (b) => b.disabled)), 'các nút mở lại');
    await shotLogin(page, 'email-trung-430-toi');
    const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));
    assert(!/FB-DUP/.test(stored), 'chứng nhận Facebook không được lưu ở localStorage/sessionStorage/cookie');
    const before = fake.calls.length;
    await page.fill('#signin-email', 'trung@example.com'); await page.fill('#signin-password', 'Mk-12345678');
    await page.click('#signin-form button[type=submit]');
    await page.waitForFunction(() => /Facebook/.test(document.getElementById('signin-alert').innerText) && document.getElementById('signin-alert').dataset.kind === 'success');
    has(await alertText(page, '#signin-alert'), 'Đã nối Facebook', 'báo đã nối');
    const after = fake.calls.slice(before).map((c) => c.endpoint + (c.body.idToken ? '+idToken' : ''));
    assert(after.indexOf('accounts:signInWithPassword') >= 0 && after.indexOf('accounts:signInWithIdp+idToken') > after.indexOf('accounts:signInWithPassword'), 'sau khi đăng nhập mật khẩu có gọi linkWithCredential (signInWithIdp kèm idToken): ' + after.join(' > '));
    assert(old.providers.some((p) => p.providerId === 'facebook.com') && old.providers.some((p) => p.providerId === 'password'), 'tài khoản cũ giờ có cả password lẫn facebook.com');
    await page.waitForURL(/\/tai-khoan\//, { timeout: 8000 });
    await page.waitForSelector('#acc-app:not([hidden])'); await page.waitForTimeout(500);
    await hashTo(page, 'bao-mat');
    eq(await alertText(page, '#acc-provider'), 'Email & mật khẩu và Facebook', 'Bảo mật hiện cả hai cách');
    eq(await visible(page, '#fb-unlink'), 1, 'có nút Bỏ nối Facebook (còn cách khác)');
    eq(await visible(page, '#fb-link'), 0, 'không còn nút Nối');
    await ctx.close();
  });
  await step('(6) email trùng tài khoản Google → đăng nhập Google ngay trên trang → tự nối Facebook; đăng nhập tài khoản có email KHÁC thì KHÔNG nối nhầm', async () => {
    for (const [name, expectLink] of [['cùng email', true], ['email khác', false]]) {
      const fake = new FakeAuth();
      const g = fake.addUser({ email: 'gg@example.com', password: '', displayName: 'GG', provider: 'google.com', emailVerified: true });
      const other = fake.addUser({ email: 'khac@example.com', password: '', displayName: 'Khác', provider: 'google.com', emailVerified: true });
      fake.addFacebookProfile('FB-GG', { email: 'gg@example.com' });
      fake.addGoogleProfile('G-TOK', expectLink ? g : other);
      const target = expectLink ? g : other;
      const ctx = await newCtx(browser, { fake });
      const page = await ctx.newPage();
      await page.goto(BASE + '/dang-nhap/');
      await page.click('#signin-facebook'); await waitPopup(page);
      await finishPopup(page, { token: 'FB-GG' });
      await page.waitForFunction(() => document.getElementById('signin-alert').innerText.includes('gg@example.com'));
      await page.click('#signin-google'); await waitPopup(page, 2);
      await finishPopup(page, { token: 'G-TOK', providerId: 'google.com' });
      if (expectLink) {
        await page.waitForFunction(() => { const a = document.getElementById('signin-alert'); return !a || (a.dataset.kind === 'success' && /Facebook/.test(a.innerText)); });
        eq(await page.evaluate(() => !!document.getElementById('signin-alert')), true, `${name}: phải thấy thông báo nối ở trang đăng nhập`);
        assert(target.providers.some((p) => p.providerId === 'facebook.com') && target.providers.some((p) => p.providerId === 'google.com'), `${name}: Google user được nối Facebook`);
      } else {
        await page.waitForURL(/\/tai-khoan\//, { timeout: 8000 });
        assert(!target.providers.some((p) => p.providerId === 'facebook.com') && !g.providers?.some?.((p) => p.providerId === 'facebook.com'), `${name}: không nối Facebook vào tài khoản nào`);
      }
      await ctx.close();
    }
  });
  await step('(6) email trùng ở trang Đăng ký: chữ dành riêng (không bảo "đăng nhập ngay bên dưới")', async () => {
    const fake = new FakeAuth();
    fake.addUser({ email: 'dk@example.com', password: 'Mk-12345678', displayName: 'DK', emailVerified: true });
    fake.addFacebookProfile('FB-DK', { email: 'dk@example.com' });
    const ctx = await newCtx(browser, { fake });
    const page = await ctx.newPage();
    await page.goto(BASE + '/en/sign-up/');
    await page.check('#signup-consent'); await page.click('#signup-facebook'); await waitPopup(page);
    await finishPopup(page, { token: 'FB-DK' });
    await page.waitForFunction(() => document.getElementById('signup-alert').innerText.includes('dk@example.com'));
    has(await alertText(page, '#signup-alert'), 'Sign up with Google', 'chữ trang đăng ký (en)');
    has(await alertText(page, '#signup-alert'), 'Account → Security', 'hướng dẫn nối sau');
    await ctx.close();
  });

  // ---------- 7. Trình duyệt trong app ----------
  await step('(7) UA trong app Facebook iOS/Android: Google GIỮ vị trí cũ, Facebook ngay dưới (tạm chưa đưa lên đầu) + dòng nhắc Google; Zalo: cũng vậy; Safari: không dòng nhắc', async () => {
    for (const [key, ua] of [['fbIos', UA.fbIos], ['fbAndroid', UA.fbAndroid]]) for (const [p, lang, k] of [['/dang-nhap/', 'vi', 'signin'], ['/dang-ky/', 'vi', 'signup'], ['/en/sign-in/', 'en', 'signin'], ['/en/sign-up/', 'en', 'signup']]) {
      const { ctx, page } = await open(browser, p, { ua, width: 430 });
      const g = await box(page, `#${k}-google`), f = await box(page, `#${k}-facebook`);
      assert(g.y < f.y, `${key} ${p}: Google (${g.y}) vẫn ở trên, Facebook (${f.y}) ngay dưới`);
      eq(await page.$eval(`#${k}-providers`, (e) => e.dataset.first || ''), '', `${key} ${p}: không đặt data-first (hằng FACEBOOK_FIRST_IN_APP đang tắt)`);
      eq(await visible(page, '[data-google-note]'), 1, `${key} ${p}: có dòng nhắc`);
      const note = await alertText(page, '[data-google-note]');
      has(note, lang === 'en' ? 'Google does not allow sign-in inside this app' : 'Google không cho đăng nhập trong app này', 'dòng nhắc');
      has(note, 'Safari/Chrome', 'gợi ý mở bằng Safari/Chrome');
      assert(!/mở (ứng dụng|app) Facebook|open the Facebook app/i.test(note), 'không hứa mở app Facebook');
      const gb = await box(page, `#${k}-google`), nb = await box(page, '[data-google-note]');
      assert(nb.y >= gb.y + gb.h - 1 && nb.y - (gb.y + gb.h) < 40, 'dòng nhắc nằm ngay dưới nút Google');
      assert(nb.y + nb.h <= f.y + 1, 'dòng nhắc nằm giữa Google và Facebook');
      assert(f.h >= 44 && gb.h >= 44, 'nút ≥ 44px');
      eq(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, 'không tràn ngang');
      if (key === 'fbIos' && p === '/dang-nhap/') { await shotLogin(page, 'dang-nhap-trong-app-facebook-ios-430-toi'); }
      await ctx.close();
    }
    const light = await open(browser, '/dang-nhap/', { ua: UA.fbIos, width: 430, light: true });
    const loi = (await auditPage(light.page)).filter((l) => /auth-|btn-|auth-card/.test(l.sel));
    assert(loi.length === 0, 'tương phản (sáng, trong app Facebook): ' + JSON.stringify(loi.slice(0, 3)));
    await shotLogin(light.page, 'dang-nhap-trong-app-facebook-ios-430-sang');
    await light.ctx.close();
    const zalo = await open(browser, '/dang-nhap/', { ua: UA.zaloIos, width: 430 });
    assert((await box(zalo.page, '#signin-google')).y < (await box(zalo.page, '#signin-facebook')).y, 'Zalo: Google vẫn trên');
    eq(await visible(zalo.page, '[data-google-note]'), 1, 'Zalo: có dòng nhắc');
    await zalo.ctx.close();
    const safari = await open(browser, '/dang-nhap/', { ua: UA.iphone26, width: 430 });
    assert((await box(safari.page, '#signin-google')).y < (await box(safari.page, '#signin-facebook')).y, 'Safari: Google trên');
    eq(await visible(safari.page, '[data-google-note]'), 0, 'Safari: không dòng nhắc');
    await safari.ctx.close();
  });
  await step('(7) trong app Facebook: bấm Facebook vẫn mở cửa sổ ngay lúc bấm', async () => {
    const { ctx, page } = await open(browser, '/dang-nhap/', { ua: UA.fbIos, width: 430 });
    await page.click('#signin-facebook'); await waitPopup(page);
    eq((await lastOpen(page)).active, true, 'userActivation.isActive');
    await ctx.close();
  });

  // ---------- 8. Bảo mật: nối / bỏ nối ----------
  await step('(8) Bảo mật: khách Facebook-only → không bỏ nối được (còn 1 cách); nối Google không có sẵn nên chỉ có chú thích', async () => {
    const fake = new FakeAuth();
    fake.addFacebookProfile('FB-ONLY', { email: 'only@example.com', displayName: 'Only FB', emailVerified: true });
    const { ctx, page } = await facebookSignIn(browser, fake, 'FB-ONLY', { width: 430, ua: UA.iphone26 });
    await hashTo(page, 'bao-mat');
    eq(await alertText(page, '#acc-provider'), 'Facebook', 'Đăng nhập bằng: Facebook');
    eq(await visible(page, '#fb-unlink'), 0, 'không có nút Bỏ nối');
    eq(await visible(page, '#fb-link'), 0, 'đã nối thì không có nút Nối');
    eq(await visible(page, '#fb-only'), 1, 'có chú thích vì sao');
    has(await alertText(page, '#fb-only'), 'Để bỏ nối Facebook, bạn cần thêm một cách đăng nhập khác — liên hệ ADS-Nolimit qua Zalo 0888 88 2823 để được hỗ trợ.', 'chữ hướng dẫn làm được (mục 5)');
    eq(await visible(page, '#mailgap'), 0, 'email đã xác minh: không còn khối nhắc');
    await shot(page, 'bao-mat-facebook-430-sang', { fullPage: true });
    await ctx.close();
  });
  await step('(8) Bảo mật: nối Facebook (linkWithPopup) rồi bỏ nối (unlink) với khách email & mật khẩu', async () => {
    const fake = new FakeAuth();
    const pu = fake.addUser({ email: 'noi@example.com', password: 'Mk-12345678', displayName: 'Nối', emailVerified: true });
    fake.addFacebookProfile('FB-LINK', { email: 'noi@example.com', displayName: 'Nối FB' });
    const ctx = await newCtx(browser, { light: true, fake });
    const page = await ctx.newPage();
    await page.goto(BASE + '/dang-nhap/?next=%2Ftai-khoan%2F%23bao-mat');
    await page.fill('#signin-email', pu.email); await page.fill('#signin-password', 'Mk-12345678');
    await page.click('#signin-form button[type=submit]');
    await page.waitForURL(/\/tai-khoan\//); await page.waitForSelector('#acc-app:not([hidden])'); await page.waitForTimeout(700);
    await hashTo(page, 'bao-mat');
    eq(await alertText(page, '#acc-provider'), 'Email & mật khẩu', 'trước khi nối');
    await shot(page, 'bao-mat-email-co-nut-noi-sang', { fullPage: true });
    await page.click('#fb-link'); await waitPopup(page);
    const o = await lastOpen(page);
    eq(o.active, true, 'userActivation.isActive'); eq(o.authType, 'linkViaPopup', 'là nối, không phải đăng nhập mới'); eq(o.providerId, 'facebook.com', 'provider');
    await finishPopup(page, { token: 'FB-LINK' });
    await page.waitForFunction(() => document.getElementById('security-status').innerText.length > 0);
    has(await alertText(page, '#security-status'), 'Đã nối Facebook', 'báo đã nối');
    eq(await alertText(page, '#acc-provider'), 'Email & mật khẩu và Facebook', 'sau khi nối');
    eq(await visible(page, '#fb-link'), 0, 'ẩn nút Nối'); eq(await visible(page, '#fb-unlink'), 1, 'hiện nút Bỏ nối');
    await shot(page, 'bao-mat-da-noi-facebook-sang', { fullPage: true });
    await page.click('#fb-unlink');
    await page.waitForFunction(() => /Đã bỏ nối/.test(document.getElementById('security-status').innerText));
    assert(fake.calls.some((c) => c.endpoint === 'accounts:update' && Array.isArray(c.body.deleteProvider) && c.body.deleteProvider.includes('facebook.com')), 'Firebase được gọi bỏ nối facebook.com');
    eq(await alertText(page, '#acc-provider'), 'Email & mật khẩu', 'sau khi bỏ nối');
    eq(await visible(page, '#fb-link'), 1, 'hiện lại nút Nối');
    // Nối khi Facebook đó đã thuộc tài khoản khác → báo lỗi dễ hiểu
    const other = fake.addUser({ email: 'khac2@example.com', password: 'x', displayName: 'K' });
    fake.addFacebookProfile('FB-TAKEN', { email: 'khac2@example.com' });
    other.providers = [...(other.providers || []), { providerId: 'facebook.com', rawId: 'fb-FB-TAKEN', email: 'khac2@example.com' }];
    await page.click('#fb-link'); await waitPopup(page, 2);
    await finishPopup(page, { token: 'FB-TAKEN' });
    await page.waitForFunction(() => document.getElementById('security-alert').innerText.length > 0);
    has(await alertText(page, '#security-alert'), 'đã gắn với một tài khoản ADS-Nolimit khác', 'credential-already-in-use');
    await ctx.close();
  });
  await step('(8) xóa tài khoản của khách Facebook: xác nhận lại bằng cửa sổ FACEBOOK (không phải Google)', async () => {
    const fake = new FakeAuth();
    fake.addFacebookProfile('FB-DEL', { email: 'del@example.com', emailVerified: true });
    const { ctx, page } = await facebookSignIn(browser, fake, 'FB-DEL');
    await hashTo(page, 'bao-mat');
    await page.click('#delete-section summary');
    has(await alertText(page, '#delete-google-note'), 'Facebook', 'ghi chú xóa nêu Facebook');
    await page.fill('#del-confirm', 'XÓA');
    await page.click('#delete-form button[type=submit]');
    await waitPopup(page);
    const o = await lastOpen(page);
    eq(o.providerId, 'facebook.com', 'cửa sổ xác nhận là Facebook'); eq(o.authType, 'reauthViaPopup', 'là xác nhận lại'); eq(o.active, true, 'userActivation.isActive');
    await finishPopup(page, { token: 'FB-DEL' });
    await page.waitForSelector('#acc-deleted:not([hidden])', { timeout: 10000 });
    await ctx.close();
  });

  // ---------- 9. Trang xóa dữ liệu ----------
  for (const [p, lang, must, titleRe] of [
    ['/xoa-du-lieu/', 'vi', ['Cách 1: Tự xóa tài khoản', 'Cách 2: Gửi email yêu cầu xóa', 'contact-support@ads-nolimit.agency', '30 ngày', 'Ứng dụng và trang web', 'tên, email, ảnh đại diện và mã định danh Facebook dành riêng cho ứng dụng (app-scoped ID)', 'Không đăng bài, không đọc bạn bè'], /Hướng dẫn xóa dữ liệu/],
    ['/en/data-deletion/', 'en', ['Option 1: Delete your account yourself', 'Option 2: Email us a deletion request', 'contact-support@ads-nolimit.agency', '30 days', 'Apps and websites', 'name, email, profile picture and the app-scoped Facebook ID', 'do not post, read your friends list'], /Data deletion instructions/],
  ]) {
    await step(`(9) ${p}: đủ nội dung, có liên kết tới Tài khoản → Bảo mật, đọc rõ sáng + tối, chân trang/Chính sách bảo mật có liên kết`, async () => {
      for (const light of [false, true]) {
        const { ctx, page } = await open(browser, p, { width: 430, ua: UA.iphone26, light });
        const text = await page.$eval('main, body', (e) => e.innerText.replace(/\s+/g, ' '));
        for (const t of must) has(text, t, `${p} có "${t}"`);
        assert(titleRe.test(await page.title()) || titleRe.test(text), 'tiêu đề');
        eq(await page.$eval('html', (e) => e.lang), lang, 'html lang');
        const sec = await page.$eval('a[href*="bao-mat"], a[href*="#security"]', (a) => a.getAttribute('href'));
        has(sec, lang === 'en' ? '/en/account/#security' : '/tai-khoan/#bao-mat', 'liên kết Bảo mật');
        eq(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, 'không tràn ngang');
        const loi = await auditPage(page);
        assert(loi.length === 0, `${p} ${light ? 'sáng' : 'tối'} tương phản: ${JSON.stringify(loi.slice(0, 3))}`);
        if (!light || p === '/xoa-du-lieu/') await shot(page, `xoa-du-lieu-${lang}-430-${light ? 'sang' : 'toi'}`, { fullPage: true });
        await ctx.close();
      }
      const { ctx, page } = await open(browser, lang === 'en' ? '/en/privacy/' : '/chinh-sach-bao-mat/');
      const href = await page.$eval('a[href$="xoa-du-lieu/"], a[href$="data-deletion/"]', (a) => a.getAttribute('href'));
      eq(href, p, 'Chính sách bảo mật có liên kết tới trang này');
      const fbSection = await page.$eval('#facebook', (e) => e.textContent);
      has(fbSection, lang === 'en' ? 'Facebook' : 'Facebook', 'có mục Facebook');
      await ctx.close();
    });
  }
  await step('(9) sitemap.xml liệt kê cả hai trang kèm hreflang vi/en; trang xóa dữ liệu không noindex', async () => {
    const xml = await (await fetch(BASE + '/sitemap.xml')).text();
    for (const u of ['https://www.ads-nolimit.agency/xoa-du-lieu/', 'https://www.ads-nolimit.agency/en/data-deletion/']) assert(xml.includes(`<loc>${u}</loc>`), 'sitemap thiếu ' + u);
    assert(/hreflang="en" href="https:\/\/www\.ads-nolimit\.agency\/en\/data-deletion\/"/.test(xml), 'hreflang en');
    const html = await (await fetch(BASE + '/xoa-du-lieu/')).text();
    assert(!/name="robots"[^>]*noindex/.test(html), 'trang công khai, không noindex (Meta cần truy cập được)');
  });

  // ---------- 10. Không Facebook SDK ----------
  await step('(10) mọi trang đã mở: không có yêu cầu tới connect.facebook.net hay máy chủ Facebook nào', async () => {
    const { ctx, page } = await open(browser, '/dang-nhap/');
    const urls = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.click('#signin-facebook'); await waitPopup(page);
    await page.waitForTimeout(500);
    eq(urls.filter((u) => /facebook|fbcdn|fb\.com/i.test(u)).length, 0, 'không yêu cầu Facebook: ' + urls.filter((u) => /facebook/i.test(u)).join(','));
    eq(await page.evaluate(() => typeof window.FB), 'undefined', 'không có window.FB');
    await ctx.close();
  });

  // ======================================================================================================
  // Đợt sửa theo kiểm tra độc lập (mục 1-11)
  // ======================================================================================================
  const IN_APP_VI = 'Trình duyệt trong app này chặn cửa sổ đăng nhập. Bạn bấm ⋯ (góc trên) → Mở bằng trình duyệt (Safari/Chrome) rồi thử lại.';
  const busy = (page, id) => page.$eval(id, (b) => b.getAttribute('aria-busy') === 'true');

  // ---------- 12. (mục 1) Trong app: cửa sổ không trả kết quả → mở khóa nút ----------
  await step('(12) trong app Facebook: cửa sổ không trả kết quả → khách quay lại trang (focus) thì nút được mở khóa sau thời gian chờ ngắn + chữ hướng dẫn; bấm tiếp mở cửa sổ MỚI và đăng nhập được', async () => {
    const { ctx, page } = await open(browser, '/dang-nhap/', { ua: UA.fbIos, width: 430 });
    await page.click('#signin-facebook'); await waitPopup(page);
    eq(await busy(page, '#signin-facebook'), true, 'nút đang bận');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(1200);
    eq(await busy(page, '#signin-facebook'), true, 'còn trong thời gian chờ (cửa sổ vừa đóng có thể sắp trả kết quả)');
    await page.waitForFunction(() => !document.getElementById('signin-facebook').hasAttribute('aria-busy'), null, { timeout: 6000 });
    assert(!(await page.$eval('#signin-google', (b) => b.disabled)) && !(await page.$eval('#signin-form button[type=submit]', (b) => b.disabled)), 'các nút khác cũng mở lại');
    eq(await alertText(page, '#signin-alert'), IN_APP_VI, 'chữ hướng dẫn mở bằng Safari/Chrome');
    await page.evaluate(() => { const el = document.getElementById('signin-alert'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 420); });
    await page.waitForTimeout(250);
    await shot(page, 'loi-trong-app-430-toi');
    ctx.fake.addFacebookProfile('FB-STALL', { email: 'stall@example.com', emailVerified: true });
    await page.click('#signin-facebook'); await waitPopup(page, 2);
    eq(await page.evaluate(() => window.__opens.length), 2, 'cú bấm tiếp theo mở cửa sổ mới');
    await finishPopup(page, { token: 'FB-STALL' });
    await page.waitForURL(/\/tai-khoan\//, { timeout: 10000 });
    await ctx.close();
  });
  await step('(12) trong app Facebook: đồng hồ 45 giây mở khóa nút dù khách không quay lại trang (đồng hồ giả của Playwright)', async () => {
    const { ctx, page } = await open(browser, '/dang-nhap/', { ua: UA.fbAndroid, width: 430 });
    await page.clock.install();
    await page.click('#signin-facebook');
    eq(await page.evaluate(() => window.__opens.length), 1, 'đã mở cửa sổ');
    await page.clock.runFor(44000);
    eq(await busy(page, '#signin-facebook'), true, 'sau 44 giây vẫn bận');
    await page.clock.runFor(1500);
    eq(await busy(page, '#signin-facebook'), false, 'sau 45 giây đã mở khóa');
    eq(await alertText(page, '#signin-alert'), IN_APP_VI, 'chữ hướng dẫn');
    await ctx.close();
  });
  await step('(12) ngoài app (Chrome máy tính): quay lại trang KHÔNG mở khóa (cửa sổ vẫn đang chờ khách)', async () => {
    const { ctx, page } = await open(browser, '/dang-nhap/');
    await page.click('#signin-facebook'); await waitPopup(page);
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); });
    await page.waitForTimeout(2600);
    eq(await busy(page, '#signin-facebook'), true, 'vẫn bận');
    eq(await alertText(page, '#signin-alert'), '', 'không có chữ báo');
    await ctx.close();
  });
  await step('(12) trong app: popup bị chặn → chữ hướng dẫn mở bằng Safari/Chrome (vi + en, đăng nhập + đăng ký)', async () => {
    for (const [p, lang, key] of [['/dang-nhap/', 'vi', 'signin'], ['/en/sign-in/', 'en', 'signin'], ['/dang-ky/', 'vi', 'signup'], ['/en/sign-up/', 'en', 'signup']]) {
      const { ctx, page } = await open(browser, p, { ua: UA.fbIos, width: 430 });
      if (key === 'signup') await page.check('#signup-consent');
      await page.evaluate(() => (window.__blockPopups = true));
      await page.click(`#${key}-facebook`);
      await page.waitForFunction((id) => document.getElementById(id).innerText.length > 0, `${key}-alert`);
      const t = await alertText(page, `#${key}-alert`);
      if (lang === 'vi') eq(t, IN_APP_VI, p);
      else eq(t, 'The browser inside this app blocks the sign-in window. Tap ⋯ (top corner) → Open in browser (Safari/Chrome) and try again.', p);
      eq(await busy(page, `#${key}-facebook`), false, p + ' nút mở lại');
      await ctx.close();
    }
  });

  // ---------- 13. (mục 3) Email trùng khi đang ở trong app ----------
  await step('(13) email trùng trong app Facebook → có câu nhắc mở Safari/Chrome để đăng nhập Google (đăng nhập + đăng ký, vi + en); ngoài app không có', async () => {
    for (const [p, key, inApp, re] of [
      ['/dang-nhap/', 'signin', true, /Nếu trước đây bạn dùng Google, hãy mở trang bằng Safari\/Chrome để đăng nhập Google\./],
      ['/en/sign-in/', 'signin', true, /If you used Google before, open this page in Safari\/Chrome to sign in with Google\./],
      ['/dang-ky/', 'signup', true, /Nếu trước đây bạn dùng Google, hãy mở trang bằng Safari\/Chrome để đăng nhập Google\./],
      ['/en/sign-up/', 'signup', true, /open this page in Safari\/Chrome to sign in with Google\./],
      ['/dang-nhap/', 'signin', false, /Safari\/Chrome để đăng nhập Google/],
    ]) {
      const fake = new FakeAuth();
      fake.addUser({ email: 'ap@example.com', password: 'Mk-12345678', displayName: 'Ap', emailVerified: true });
      fake.addFacebookProfile('FB-AP', { email: 'ap@example.com' });
      const ctx = await newCtx(browser, { fake, ua: inApp ? UA.fbIos : UA.iphone26, width: 430 });
      const page = await ctx.newPage();
      await page.goto(BASE + p);
      if (key === 'signup') await page.check('#signup-consent');
      await page.click(`#${key}-facebook`); await waitPopup(page);
      await finishPopup(page, { token: 'FB-AP' });
      await page.waitForFunction((id) => document.getElementById(id).innerText.includes('ap@example.com'), `${key}-alert`);
      const t = await alertText(page, `#${key}-alert`);
      if (inApp) assert(re.test(t), `${p}: ${t}`); else assert(!re.test(t), `${p} ngoài app không có câu nhắc: ${t}`);
      await ctx.close();
    }
  });

  // ---------- 14. (mục 2) Thêm email xong Firebase thu hồi phiên ----------
  await step('(14) thêm email xong, bấm link rồi "Tôi đã xác minh" mà phiên bị thu hồi → về trang Đăng nhập với câu "Email đã được thêm…"; chữ "đã gửi" nói có thể phải đăng nhập lại', async () => {
    for (const err of ['TOKEN_EXPIRED', 'USER_NOT_FOUND']) {
      const fake = new FakeAuth();
      fake.addFacebookProfile('FB-REV', { email: '', displayName: 'Thu Hồi' });
      const { ctx, page } = await facebookSignIn(browser, fake, 'FB-REV', { width: 430, ua: UA.iphone26 });
      await page.fill('#mailgap-email', 'rev@example.com');
      await page.click('#mailgap-form button[type=submit]');
      await page.waitForFunction(() => document.getElementById('mailgap-status').innerText.length > 0);
      has(await alertText(page, '#mailgap-status'), 'Sau khi bấm link, bạn có thể phải đăng nhập lại', 'chữ đã gửi (' + err + ')');
      fake.confirmPendingEmail(fake.facebookUser('FB-REV'));
      fake.nextError['accounts:lookup'] = err;
      await page.click('#mailgap-done');
      // Hai nơi cùng đưa về trang Đăng nhập (trang Tài khoản khi mất phiên, và khối thêm email): chờ trang đích ổn định.
      await page.waitForFunction(() => location.pathname === '/dang-nhap/' && document.readyState === 'complete' && !!document.getElementById('signin-alert') && document.getElementById('signin-alert').innerText.length > 0, null, { timeout: 12000 });
      eq(await alertText(page, '#signin-alert'), 'Email đã được thêm. Vì bảo mật, bạn đăng nhập lại bằng Facebook nhé.', 'câu giải thích (' + err + ')');
      eq(await page.evaluate(() => sessionStorage.getItem('adsnl-email-added')), null, 'cờ được xóa sau khi hiện');
      await page.reload({ waitUntil: 'load' });
      eq(await alertText(page, '#signin-alert'), '', 'tải lại thì không hiện nữa');
      await ctx.close();
    }
    const fake = new FakeAuth();
    fake.addFacebookProfile('FB-REV-EN', { email: '' });
    const { ctx, page } = await facebookSignIn(browser, fake, 'FB-REV-EN', { lang: 'en', width: 390, ua: UA.iphone26 });
    await page.fill('#mailgap-email', 'rev-en@example.com');
    await page.click('#mailgap-form button[type=submit]');
    await page.waitForFunction(() => document.getElementById('mailgap-status').innerText.length > 0);
    has(await alertText(page, '#mailgap-status'), 'you may need to sign in again', 'chữ đã gửi (en)');
    fake.confirmPendingEmail(fake.facebookUser('FB-REV-EN'));
    fake.nextError['accounts:lookup'] = 'TOKEN_EXPIRED';
    await page.click('#mailgap-done');
    await page.waitForFunction(() => location.pathname === '/en/sign-in/' && document.readyState === 'complete' && !!document.getElementById('signin-alert') && document.getElementById('signin-alert').innerText.length > 0, null, { timeout: 12000 });
    eq(await alertText(page, '#signin-alert'), 'Your email has been added. For security, please sign in with Facebook again.', 'en');
    await ctx.close();
  });

  // ---------- 15. (mục 4) Nạp phần Facebook lỗi KHÔNG làm hỏng đăng nhập khác ----------
  await step('(15) tệp facebook-flow không nạp được → đăng nhập mật khẩu vẫn đi tiếp bình thường; đăng nhập Facebook báo lỗi và luôn mở khóa nút', async () => {
    const fake = new FakeAuth();
    const pu = fake.addUser({ email: 'chan@example.com', password: 'Mk-12345678', displayName: 'Chặn', emailVerified: true });
    fake.addFacebookProfile('FB-BLK', { email: 'blk@example.com' });
    const ctx = await newCtx(browser, { fake });
    const failed = [];
    ctx.on('requestfailed', (r) => failed.push(r.url()));
    await ctx.route(/facebook-flow[^/]*\.js/, (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto(BASE + '/dang-nhap/');
    await page.waitForTimeout(400);
    assert(failed.some((u) => /facebook-flow/.test(u)), 'tệp facebook-flow đã bị chặn thật');
    await page.fill('#signin-email', pu.email); await page.fill('#signin-password', 'Mk-12345678');
    await page.click('#signin-form button[type=submit]');
    await page.waitForURL(/\/tai-khoan\//, { timeout: 10000 });
    await page.waitForSelector('#acc-app:not([hidden])');
    // đăng nhập Facebook khi không nạp được phần xử lý lỗi
    const ctx2 = await newCtx(browser, { fake: new FakeAuth() });
    await ctx2.route(/facebook-flow[^/]*\.js/, (r) => r.abort());
    const page2 = await ctx2.newPage();
    await page2.goto(BASE + '/dang-nhap/');
    ctx2.fake.nextError['accounts:signInWithIdp'] = 'USER_DISABLED';
    ctx2.fake.addFacebookProfile('FB-BLK2', { email: 'b2@example.com' });
    await page2.click('#signin-facebook'); await waitPopup(page2);
    await finishPopup(page2, { token: 'FB-BLK2' });
    await page2.waitForFunction(() => document.getElementById('signin-alert').innerText.length > 0);
    has(await alertText(page2, '#signin-alert'), 'bị khóa', 'báo lỗi bằng chữ Facebook dù không nạp được flow');
    eq(await busy(page2, '#signin-facebook'), false, 'nút mở khóa');
    assert(!(await page2.$eval('#signin-google', (b) => b.disabled)), 'Google mở khóa');
    await ctx.close(); await ctx2.close();
  });

  // ---------- 16. (mục 7) Email khác nhau → báo nhẹ, không nối ----------
  await step('(16) Facebook báo email trùng của A, nhưng khách đăng nhập bằng tài khoản B (email khác) → KHÔNG nối, báo "Chưa nối Facebook vì email khác nhau"', async () => {
    const fake = new FakeAuth();
    const a = fake.addUser({ email: 'a-khach@example.com', password: 'Mk-12345678', displayName: 'A', emailVerified: true });
    const b = fake.addUser({ email: 'b-khach@example.com', password: 'Mk-12345678', displayName: 'B', emailVerified: true });
    fake.addFacebookProfile('FB-MM', { email: 'a-khach@example.com' });
    const ctx = await newCtx(browser, { fake });
    const page = await ctx.newPage();
    await page.goto(BASE + '/dang-nhap/');
    await page.click('#signin-facebook'); await waitPopup(page);
    await finishPopup(page, { token: 'FB-MM' });
    await page.waitForFunction(() => document.getElementById('signin-alert').innerText.includes('a-khach@example.com'));
    await page.fill('#signin-email', b.email); await page.fill('#signin-password', 'Mk-12345678');
    await page.click('#signin-form button[type=submit]');
    await page.waitForFunction(() => /Chưa nối Facebook vì email khác nhau/.test(document.getElementById('signin-alert').innerText), null, { timeout: 8000 });
    const linkCalls = fake.calls.filter((c) => c.endpoint === 'accounts:signInWithIdp' && c.body.idToken);
    eq(linkCalls.length, 0, 'không gọi linkWithCredential');
    assert(!(b.providers || []).some((p) => p.providerId === 'facebook.com') && !(a.providers || []).some((p) => p.providerId === 'facebook.com'), 'không tài khoản nào được nối Facebook');
    await page.waitForURL(/\/tai-khoan\//, { timeout: 8000 });
    await ctx.close();
  });

  // ---------- 17. (mục 8) user-mismatch ----------
  await step('(17) xóa tài khoản: chọn một tài khoản Facebook KHÁC với tài khoản đang đăng nhập → câu báo user-mismatch riêng cho Facebook', async () => {
    const fake = new FakeAuth();
    fake.addFacebookProfile('FB-A', { email: 'a-mm@example.com', emailVerified: true });
    fake.addFacebookProfile('FB-B', { email: 'b-mm@example.com', emailVerified: true });
    const { ctx, page } = await facebookSignIn(browser, fake, 'FB-A');
    await hashTo(page, 'bao-mat');
    await page.click('#delete-section summary');
    await page.fill('#del-confirm', 'XÓA');
    await page.click('#delete-form button[type=submit]');
    await waitPopup(page);
    await finishPopup(page, { token: 'FB-B' });
    await page.waitForFunction(() => document.getElementById('delete-alert').innerText.length > 0);
    eq(await alertText(page, '#delete-alert'), 'Bạn đã chọn một tài khoản Facebook khác với tài khoản đang đăng nhập.', 'user-mismatch');
    await ctx.close();
  });

  // ---------- 18. (mục 9) display=popup chỉ trên máy tính ----------
  await step('(18) điện thoại (iPhone, Android): KHÔNG đặt display=popup; máy tính: có', async () => {
    for (const [ua, width, expect] of [[UA.iphone26, 430, undefined], [UA.fbAndroid, 430, undefined], [UA.chromeDesktop, 1440, 'popup']]) {
      const { ctx, page } = await open(browser, '/dang-nhap/', { ua, width });
      await page.click('#signin-facebook'); await waitPopup(page);
      eq((await lastOpen(page)).custom.display, expect, ua.slice(0, 40));
      await ctx.close();
    }
  });

  // ---------- 19. (mục 6) Khách không email: thanh toán / key / nạp ngân sách không im lặng ----------
  await step('(19) quản trị/khách: mã nguồn có câu "chưa có email" thay vì im lặng ở thanh toán, đặt lại máy, nạp ngân sách; trang quản trị hiện "Chưa có email"', async () => {
    const fs = require('fs');
    const root = path.join(__dirname, '../../src/lib');
    for (const f of ['account/pay.ts', 'account/keys.ts', 'account/budget-topup.ts']) {
      const code = fs.readFileSync(path.join(root, f), 'utf8');
      assert(/toast\(m\('needEmail'\), 'error'\)/.test(code), f + ' phải báo needEmail');
      assert(!/if \(!user\?\.email\) return/.test(code), f + ' không còn return im lặng');
    }
    for (const f of ['admin/shared.ts', 'admin/keys.ts', 'admin/customer.ts']) assert(/Chưa có email/.test(fs.readFileSync(path.join(root, f), 'utf8')), f + ' hiện "Chưa có email"');
  });

  // ---------- 20. (mục 10) Chính sách + trang xóa dữ liệu theo cờ ----------
  await step('(20) Chính sách bảo mật: có app-scoped ID; bản cờ tắt và chế độ thử KHÔNG có câu "nối hoặc bỏ nối Facebook ở Bảo mật", bản cờ bật có', async () => {
    for (const [name, base, hasLinkSentence] of [['tắt', OFF, false], ['thử', TEST, false], ['bật', BASE, true]]) {
      for (const [p, lang] of [['/chinh-sach-bao-mat/', 'vi'], ['/en/privacy/', 'en']]) {
        const html = await (await fetch(base + p)).text();
        const sec = html.slice(html.indexOf('id="facebook"'), html.indexOf('id="facebook"') + 4000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        has(sec, lang === 'en' ? 'app-scoped Facebook ID' : 'mã định danh Facebook dành riêng cho ứng dụng (app-scoped ID)', `${name} ${p} có app-scoped ID`);
        const re = lang === 'en' ? /link or unlink Facebook/ : /nối hoặc bỏ nối Facebook/;
        eq(re.test(sec), hasLinkSentence, `${name} ${p}: câu nối/bỏ nối ${hasLinkSentence ? 'phải có' : 'không được có'}`);
        has(sec, lang === 'en' ? 'remove ADS-Nolimit from Facebook' : 'gỡ ADS-Nolimit khỏi Facebook', `${name} ${p} vẫn có hướng dẫn gỡ khỏi Facebook`);
      }
    }
    const html = await (await fetch(OFF + '/xoa-du-lieu/')).text();
    assert(/app-scoped ID/.test(html), 'trang xóa dữ liệu (bản tắt) có app-scoped ID');
  });

  // ---------- 21. (mục 11) Chế độ thử: off / test / on ----------
  await step('(21) chế độ thử: chưa bật thì y như cờ tắt (không nút, không khung, ghi chú chỉ Google); ?fbtest=1 hiện nút + ghi nhớ; ?fbtest=0 tắt và xóa', async () => {
    for (const [p, key] of [['/dang-nhap/', 'signin'], ['/dang-ky/', 'signup'], ['/en/sign-in/', 'signin'], ['/en/sign-up/', 'signup']]) {
      const { ctx, page } = await open(browser, p, { base: TEST, width: 430, ua: UA.iphone26 });
      eq(await visible(page, `#${key}-facebook`), 0, p + ' chưa bật: nút Facebook không hiện');
      eq(await visible(page, '.auth-provider'), 1, p + ' chỉ còn khung nút Google');
      const note = await page.evaluate(() => Array.from(document.querySelectorAll('.auth-note')).filter((e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0).map((e) => e.textContent).join('|'));
      if (key === 'signin') assert(!/Facebook/.test(note) && /Google/.test(note), p + ' ghi chú chỉ nhắc Google: ' + note);
      const urls = [];
      page.on('request', (r) => urls.push(r.url()));
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(300);
      assert(!urls.some((u) => /facebook-flow/.test(u)), p + ' chưa bật: không nạp facebook-flow');
      await page.click(`#${key}-google`, { trial: true });
      await ctx.close();
    }
    // bật
    const { ctx, page } = await open(browser, '/dang-nhap/?fbtest=1', { base: TEST, width: 430, ua: UA.iphone26 });
    eq(await visible(page, '#signin-facebook'), 1, 'bật: nút hiện');
    eq(await page.evaluate(() => localStorage.getItem('adsnl-fbtest')), '1', 'ghi nhớ trong localStorage');
    const note = await page.evaluate(() => Array.from(document.querySelectorAll('.auth-note')).filter((e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0).map((e) => e.textContent).join('|'));
    has(note, 'Google hoặc Facebook', 'ghi chú đổi sang bản có Facebook');
    const g = await box(page, '#signin-google'), f = await box(page, '#signin-facebook');
    assert(g.y < f.y && f.h >= 44, 'Facebook dưới Google, ≥ 44px');
    await page.click('#signin-facebook'); await waitPopup(page);
    eq((await lastOpen(page)).providerId, 'facebook.com', 'bấm mở cửa sổ Facebook');
    await shotLogin(page, 'che-do-thu-bat-430-toi');
    // tải lại không kèm tham số: vẫn hiện (đã ghi nhớ), cả trang đăng ký
    await page.goto(TEST + '/dang-ky/', { waitUntil: 'load' });
    eq(await visible(page, '#signup-facebook'), 1, 'nhớ qua trang khác');
    // tắt
    await page.goto(TEST + '/dang-nhap/?fbtest=0', { waitUntil: 'load' });
    eq(await visible(page, '#signin-facebook'), 0, 'tắt: nút ẩn');
    eq(await page.evaluate(() => localStorage.getItem('adsnl-fbtest')), null, 'đã xóa khỏi localStorage');
    await page.goto(TEST + '/dang-nhap/', { waitUntil: 'load' });
    eq(await visible(page, '#signin-facebook'), 0, 'tắt rồi thì không tự hiện lại');
    await ctx.close();
  });
  await step('(21) chế độ thử: mục Bảo mật (nối/bỏ nối) cũng chỉ hiện khi đã bật; khách đã nối Facebook thấy hộp Facebook khi bật, không thấy khi chưa bật', async () => {
    for (const on of [false, true]) {
      const fake = new FakeAuth();
      const pu = fake.addUser({ email: 'thu@example.com', password: 'Mk-12345678', displayName: 'Thử', emailVerified: true });
      const ctx = await newCtx(browser, { fake, width: 430, ua: UA.iphone26 });
      const page = await ctx.newPage();
      await page.goto(TEST + '/dang-nhap/?next=%2Ftai-khoan%2F%23bao-mat' + (on ? '&fbtest=1' : ''));
      await page.fill('#signin-email', pu.email); await page.fill('#signin-password', 'Mk-12345678');
      await page.click('#signin-form button[type=submit]');
      await page.waitForURL(/\/tai-khoan\//); await page.waitForSelector('#acc-app:not([hidden])'); await page.waitForTimeout(600);
      await hashTo(page, 'bao-mat');
      eq(await visible(page, '#fb-box'), on ? 1 : 0, `hộp Facebook ở Bảo mật (${on ? 'đã bật' : 'chưa bật'})`);
      eq(await visible(page, '#fb-link'), on ? 1 : 0, `nút Nối Facebook (${on ? 'đã bật' : 'chưa bật'})`);
      if (on) await shot(page, 'che-do-thu-bao-mat-430-toi', { fullPage: true });
      await ctx.close();
    }
  });
  await step('(21) chế độ thử: trang Tài khoản của khách Facebook (đăng nhập qua bản thử đã bật) vẫn có khối Thêm email; cờ BẬT hiện cho mọi khách không cần ?fbtest', async () => {
    const { ctx, page } = await open(browser, '/dang-nhap/', { width: 430, ua: UA.iphone26 });
    eq(await visible(page, '#signin-facebook'), 1, 'bản bật: nút hiện, không cần ?fbtest');
    eq(await page.evaluate(() => localStorage.getItem('adsnl-fbtest')), null, 'bản bật không ghi khóa thử');
    await ctx.close();
  });

  console.log(logs.join('\n') || 'không có lỗi console');
  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\nKết quả: ${results.length - fail} đạt, ${fail} không đạt`);
  process.exit(fail ? 1 : 0);
})();
