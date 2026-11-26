// Nút "Tải app" dễ thấy + bấm là có kết quả trên mọi máy (kế hoạch docs/superpowers/plans/2026-11-26-nut-tai-app.md).
// Cần máy chủ tĩnh (bash e2e/pwa/serve.sh <cổng> <dist>) và emulator Firestore (đăng nhập giả ở trang Tài khoản). Chạy:
//   cd firebase && npx firebase --config ../e2e/tai-app/firebase.8095.json emulators:exec --only firestore --project demo-ads-nolimit \
//     "WEB_PORT=4370 EMU_PORT=8095 SHOTS_DIR=<thư mục ảnh> node ../e2e/tai-app/e2e-tai-app.cjs"
const path = require('path');
const { SHOTS, setupContext, chromium, emu, signIn, watchConsole, step, assert, eq, has, results, BASE } = require('../pwa/harness.cjs');
const { seedGlobal } = require('../pwa/seed.cjs');
const { auditPage } = require('../sang-toi/tuong-phan.cjs');

const UA = {
  iphone26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iphone17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  cocCocIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 coc_coc_browser/120.0.250 Mobile',
  fbIos430: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 [FBAN/FBIOS;FBAV/530.0.0.40.98;FBBV/123;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.6;FBSS/3;FBID/phone;FBLC/vi_VN;FBOP/5]',
  fbIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.38.108;FBBV/564431005;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/vi_VN]',
  zaloIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo/24.5.1',
  fbAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.38.108;]',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  cocCocAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 coc_coc_browser/120.0.250',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  chromeDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  firefoxDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
};
const isDesktopUa = (ua) => ua === UA.chromeDesktop || ua === UA.safariMac || ua === UA.firefoxDesktop;

const FAKE_PROMPT = (outcome = 'accepted', throws = false) => `
  window.__promptCalls = 0; window.__gesture = null;
  const ev = new Event('beforeinstallprompt');
  ev.prompt = async () => { window.__promptCalls++; window.__gesture = navigator.userActivation ? navigator.userActivation.isActive : 'n/a'; ${throws ? "throw new Error('không mở được');" : ''} };
  ev.userChoice = Promise.resolve({ outcome: '${outcome}' });
  window.__adsnlInstall = ev;`;
const STANDALONE = `
  const _mm = window.matchMedia.bind(window);
  window.matchMedia = (q) => /display-mode:\\s*standalone/.test(q)
    ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent() { return false; } }
    : _mm(q);`;
const IOS_STANDALONE = `Object.defineProperty(navigator, 'standalone', { value: true });`;
const LIGHT = `try { localStorage.setItem('adsnl-theme', 'light'); } catch (e) {}`;

const logs = [];
let n = 0;
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(SHOTS, name + '.png'), ...opts });

async function ctxFor(browser, { ua, width = 390, init = '', signedIn = false, motion = true } = {}) {
  const mobile = width < 1080 && !isDesktopUa(ua);
  const ctx = await setupContext(browser, {
    viewport: { width, height: width < 600 ? 844 : 900 },
    deviceScaleFactor: 2,
    ...(ua ? { userAgent: ua } : {}),
    isMobile: mobile && width < 1080,
    hasTouch: mobile,
    reducedMotion: motion ? 'no-preference' : 'reduce',
    serviceWorkers: 'block',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  if (init) await ctx.addInitScript(init);
  if (signedIn) await ctx.addInitScript(() => localStorage.setItem('adsnl-user', JSON.stringify({ name: 'Nguyễn Văn Khách', initial: 'N' })));
  return ctx;
}
async function pub(browser, path0, o = {}) {
  const ctx = await ctxFor(browser, o);
  const page = await ctx.newPage();
  watchConsole(page, logs);
  await page.goto(BASE + path0, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page };
}
const visible = (page, sel) => page.$$eval(sel, (els) => els.filter((e) => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0).length);
const dialogText = (page) => page.$eval('dialog.isheet', (d) => d.innerText.replace(/\s+/g, ' ').trim());

// Nút bấm để mở theo nền tảng: hàng dưới thanh đầu trang (điện thoại) hoặc chân trang (máy tính)
const entry = (ua, width) => (width < 1080 && !isDesktopUa(ua) ? '.row2-app' : '.footer-app');

async function openAccount(browser, { lang = 'vi', width = 390, ua, init = '', motion = true } = {}) {
  const ctx = await ctxFor(browser, { ua, width, init, motion });
  const now = new Date();
  const u = ctx.fake.addUser({ email: `t${++n}@example.com`, password: 'look-pass-12', displayName: 'Master Eva Truong', emailVerified: true });
  await emu.set(`users/${u.uid}`, { displayName: 'Master Eva Truong', email: u.email, createdAt: now, updatedAt: now });
  await emu.set('wallets/' + u.uid, { uid: u.uid, balance: 1500000, updatedAt: now, lastTx: 'x' });
  const page = await ctx.newPage();
  watchConsole(page, logs);
  await signIn(page, u.email, 'look-pass-12', lang === 'en' ? '/en/account/' : '/tai-khoan/');
  await page.waitForSelector('#acc-app:not([hidden])');
  await page.waitForSelector('#ov-hello');
  await page.waitForTimeout(700);
  return { ctx, page };
}

(async () => {
  await emu.clear();
  await seedGlobal();
  const browser = await chromium.launch();

  // ---------- 1. Nút hiện đúng chỗ ----------
  for (const [p, lang] of [['/', 'vi'], ['/en/', 'en'], ['/bang-gia/', 'vi']]) {
    await step(`(1) ${p}: điện thoại 390 → nút Tải app ở hàng dưới, trong Menu, ở chân trang`, async () => {
      const { ctx, page } = await pub(browser, p, { ua: UA.iphone26, width: 390 });
      const label = lang === 'en' ? 'Get app' : 'Tải app';
      const r2 = await page.$eval('.row2-app', (e) => { const b = e.getBoundingClientRect(); const hb = document.querySelector('.site-header').getBoundingClientRect(); return { t: e.textContent.trim(), w: b.width, h: b.height, belowHeader: b.top >= hb.bottom - 1, attr: e.hasAttribute('data-install-app'), tag: e.tagName }; });
      eq(r2.tag, 'BUTTON', 'là <button>'); eq(r2.t, label, 'nhãn'); eq(r2.attr, true, 'data-install-app'); assert(r2.w >= 44 && r2.h >= 44, `kích thước ${r2.w}×${r2.h}`); eq(r2.belowHeader, true, 'nằm ở hàng dưới');
      eq(await page.$eval('details.nav-mobile', (d) => d.open), false, 'trong Menu: đóng thì chưa thấy');
      await page.click('.menu-toggle');
      eq(await visible(page, '.mobile-app'), 1, 'trong Menu: mở ra thấy');
      has(await page.$eval('.mobile-app', (e) => e.textContent.trim()), lang === 'en' ? 'Get the app on your phone' : 'Tải app về điện thoại', 'nhãn menu');
      const inAcct = await page.$eval('.mobile-app', (e) => e.parentElement.classList.contains('mobile-acct') && e.getBoundingClientRect().height >= 44);
      eq(inAcct, true, 'trong nhóm Tài khoản, cao ≥ 44');
      if (p === '/') await shot(page, 'menu-mo-390-toi');
      await page.click('.menu-toggle');
      await page.locator('.footer-app').scrollIntoViewIfNeeded();
      eq(await visible(page, '.footer-app'), 1, 'chân trang');
      has(await page.$eval('.footer-app', (e) => e.textContent.trim()), lang === 'en' ? 'Get the ADS-Nolimit app' : 'Tải app ADS-Nolimit', 'nhãn chân trang');
      await ctx.close();
    });
    await step(`(1) ${p}: máy tính 1440 → không có hàng dưới, nút ở chân trang`, async () => {
      const { ctx, page } = await pub(browser, p, { ua: UA.chromeDesktop, width: 1440 });
      eq(await visible(page, '.row2-app'), 0, 'không có nút ở hàng dưới');
      await page.locator('.footer-app').scrollIntoViewIfNeeded();
      eq(await visible(page, '.footer-app'), 1, 'chân trang');
      await ctx.close();
    });
  }

  // ---------- 2. Đang ở trong app → ẩn hết ----------
  await step('(2) display-mode: standalone → ẩn mọi nút ở hàng dưới, Menu, chân trang; lưới hàng dưới về 2 cột', async () => {
    for (const [p, w, ua] of [['/', 390, UA.chromeAndroid], ['/en/', 390, UA.chromeAndroid], ['/bang-gia/', 1440, UA.chromeDesktop]]) {
      const { ctx, page } = await pub(browser, p, { ua, width: w, init: STANDALONE });
      if (w < 1080) await page.click('.menu-toggle');
      eq(await visible(page, '[data-install-app]'), 0, `${p}@${w}: số nút còn thấy`);
      if (w < 1080) { await page.click('.menu-toggle'); eq((await page.$eval('.row2-inner', (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length)), 2, 'lưới hàng dưới 2 cột'); await shot(page, 'trong-app-390'); }
      await ctx.close();
    }
  });
  await step('(2) iOS navigator.standalone=true → ẩn hết', async () => {
    const { ctx, page } = await pub(browser, '/', { ua: UA.iphone26, init: IOS_STANDALONE });
    await page.click('.menu-toggle');
    eq(await visible(page, '[data-install-app]'), 0, 'số nút còn thấy');
    await ctx.close();
  });

  // ---------- 3. Có sự kiện cài ----------
  await step('(3) có sự kiện cài: bấm → prompt() đúng 1 lần ngay trong cử chỉ bấm, không mở bảng, báo "Đã cài", nút ẩn', async () => {
    const { ctx, page } = await pub(browser, '/', { ua: UA.chromeAndroid, init: FAKE_PROMPT('accepted') });
    await page.click('.row2-app');
    await page.waitForTimeout(700);
    eq(await page.evaluate(() => window.__promptCalls), 1, 'số lần prompt()');
    eq(await page.evaluate(() => window.__gesture), true, 'prompt() chạy khi còn user activation');
    eq(await page.$('dialog.isheet'), null, 'không mở bảng');
    has(await page.$eval('.isheet-toast', (e) => e.textContent), 'Đã cài', 'thông báo');
    await shot(page, 'da-cai-thong-bao-390');
    await page.click('.menu-toggle');
    eq(await visible(page, '[data-install-app]'), 0, 'mọi nút ẩn sau khi cài');
    await ctx.close();
  });
  await step('(3) có sự kiện cài nhưng prompt() ném lỗi → mở bảng hướng dẫn; bấm lần nữa vẫn mở bảng', async () => {
    const { ctx, page } = await pub(browser, '/', { ua: UA.chromeAndroid, init: FAKE_PROMPT('accepted', true) });
    await page.click('.row2-app');
    await page.waitForSelector('dialog.isheet[open]');
    eq(await page.evaluate(() => window.__promptCalls), 1, 'đã thử prompt() 1 lần');
    eq(await page.$eval('dialog.isheet', (d) => d.dataset.platform), 'android', 'bảng của Android');
    has(await dialogText(page), 'Thêm vào màn hình chính', 'có bước menu');
    await ctx.close();
  });
  await step('(3) khách từ chối hộp cài → không mở bảng, không báo đã cài; lần bấm sau (sự kiện đã dùng) mở bảng', async () => {
    const { ctx, page } = await pub(browser, '/', { ua: UA.chromeAndroid, init: FAKE_PROMPT('dismissed') });
    await page.click('.row2-app');
    await page.waitForTimeout(600);
    eq(await page.evaluate(() => window.__promptCalls), 1, 'prompt()');
    eq(await page.$('dialog.isheet'), null, 'không bảng'); eq(await page.$('.isheet-toast'), null, 'không thông báo');
    eq(await visible(page, '.row2-app'), 1, 'nút vẫn còn');
    await page.click('.row2-app');
    await page.waitForSelector('dialog.isheet[open]');
    eq(await page.evaluate(() => window.__promptCalls), 1, 'không gọi prompt() lần 2');
    await ctx.close();
  });

  // ---------- 4. Không có sự kiện: bảng theo nền tảng ----------
  const MATRIX = [
    ['iphone26', 390, 'ios-safari-26', ['Apple không cho', 'góc dưới bên phải thanh Safari', 'Chia sẻ', 'Kéo xuống', 'Thêm vào MH chính', 'Mở dưới dạng ứng dụng web', 'Tải app ADS-Nolimit về điện thoại'], []],
    ['iphone26', 430, 'ios-safari-26', ['góc dưới bên phải thanh Safari', 'Thêm vào MH chính'], []],
    ['fbIos430', 430, 'ios-inapp', ['Mở bằng Safari', 'góc trên bên phải', 'Mở trong trình duyệt ngoài', 'Sao chép link', 'Thêm vào MH chính'], []],
    ['iphone17', 390, 'ios-safari', ['Apple không cho', 'thanh dưới của Safari', 'Chia sẻ', 'Thêm vào MH chính'], ['góc dưới bên phải thanh Safari']],
    ['ipad', 820, 'ios-safari', ['Apple không cho', 'Chia sẻ', 'Thêm vào MH chính'], []],
    ['chromeIos', 390, 'ios-chrome', ['Apple không cho', 'cuối thanh địa chỉ', 'Thêm vào MH chính'], []],
    ['cocCocIos', 390, 'ios-other', ['Apple không cho', 'Thêm vào MH chính', 'mở bằng Safari'], []],
    ['fbIos', 390, 'ios-inapp', ['Mở bằng Safari', 'Sao chép link', 'Facebook, Zalo'], []],
    ['zaloIos', 390, 'ios-inapp', ['Mở bằng Safari', 'Sao chép link'], []],
    ['fbAndroid', 390, 'android-inapp', ['Mở bằng Chrome', 'Sao chép link'], []],
    ['chromeAndroid', 390, 'android', ['Thêm vào màn hình chính', 'Cài đặt ứng dụng'], ['Apple']],
    ['cocCocAndroid', 390, 'android', ['Thêm vào màn hình chính', 'Cài đặt ứng dụng'], ['Apple']],
    ['samsung', 390, 'android', ['Thêm vào màn hình chính', 'Cài đặt ứng dụng'], ['Apple']],
    ['chromeDesktop', 1440, 'desktop', ['Tải app ADS-Nolimit về máy tính', 'Cài đặt trang dưới dạng ứng dụng', 'biểu tượng cài'], ['Apple']],
    ['safariMac', 1440, 'desktop-safari', ['Thêm vào Dock', 'Tệp'], ['Apple']],
    ['firefoxDesktop', 1440, 'desktop-firefox', ['Firefox', 'Chrome hoặc Edge', 'Sao chép link'], ['Apple']],
  ];
  for (const [key, width, platform, must, mustNot] of MATRIX) {
    const uaKey = key;
    await step(`(4) không có sự kiện, ${key} ${width}px → bảng "${platform}" đúng bước, đóng được bằng nút / Esc / bấm nền`, async () => {
      const ua = UA[key];
      const { ctx, page } = await pub(browser, '/', { ua, width, motion: false });
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e)));
      const sel = entry(ua, width);
      await page.locator(sel).scrollIntoViewIfNeeded();
      await page.click(sel);
      await page.waitForSelector('dialog.isheet[open]');
      eq(await page.$eval('dialog.isheet', (d) => d.dataset.platform), platform, 'nền tảng');
      const text = await dialogText(page);
      for (const k of must) has(text, k, `${key}: từ khóa`);
      for (const k of mustNot) assert(!text.includes(k), `${key}: không được có "${k}"`);
      assert(!/một lần bấm|bấm một lần|tự động cài/i.test(text), 'không hứa cài một chạm');
      has(text, 'Đã hiểu', 'nút đóng'); has(text, 'Đã cài rồi? Mở ADS-Nolimit từ màn hình chính', 'dòng đã cài rồi');
      const nSteps = await page.$$eval('.isheet-steps li', (l) => l.length);
      assert(nSteps >= 1 && nSteps <= 4, 'số bước ' + nSteps);
      eq(await page.$$eval('.isheet-steps li svg', (l) => l.length) > 0 || platform === 'desktop-safari' || platform === 'desktop-firefox' || platform.endsWith('inapp') , true, 'có biểu tượng trong bước');
      eq(await page.$eval('dialog.isheet img.isheet-icon', (i) => i.getAttribute('src')), '/icon-192.png', 'biểu tượng app');
      eq(await page.$$eval('dialog.isheet img, dialog.isheet [src], dialog.isheet [href]', (l) => l.filter((e) => /^https?:/.test(e.getAttribute('src') || e.getAttribute('href') || '') && !(e.getAttribute('src') || e.getAttribute('href')).startsWith(location.origin)).length), 0, 'không tài nguyên ngoài');
      // hộp nằm trong màn hình
      const box = await page.$eval('dialog.isheet', (d) => { const b = d.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, vh: innerHeight, vw: innerWidth, sw: document.documentElement.scrollWidth }; });
      assert(box.l >= -0.5 && box.r <= box.vw + 0.5 && box.t >= -0.5 && box.b <= box.vh + 0.5, 'hộp nằm trọn trong màn hình ' + JSON.stringify(box));
      if (width < 640) assert(Math.abs(box.b - box.vh) < 1.5, 'tấm trượt dính đáy màn hình');
      // đóng bằng 3 cách
      await page.click('dialog.isheet .isheet-got');
      eq(await page.$('dialog.isheet'), null, 'đóng bằng nút');
      await page.click(sel); await page.waitForSelector('dialog.isheet[open]');
      await page.keyboard.press('Escape'); await page.waitForTimeout(150);
      eq(await page.$('dialog.isheet'), null, 'đóng bằng Esc');
      await page.click(sel); await page.waitForSelector('dialog.isheet[open]');
      await page.mouse.click(width < 640 ? width / 2 : 8, 8); await page.waitForTimeout(150);
      eq(await page.$('dialog.isheet'), null, 'đóng khi bấm nền');
      await page.click(sel); await page.waitForSelector('dialog.isheet[open]');
      await page.click('dialog.isheet .isheet-box', { position: { x: 20, y: 60 } }); await page.waitForTimeout(100);
      eq(await page.$$('dialog.isheet').then((l) => l.length), 1, 'bấm trong hộp thì không đóng');
      eq(errs.length, 0, 'không lỗi JS ' + errs.join('|'));
      await ctx.close();
    });
  }

  await step('(4) bản tiếng Anh /en/ → bảng tiếng Anh, nút "Get app", bước đúng', async () => {
    const { ctx, page } = await pub(browser, '/en/', { ua: UA.iphone26, motion: false });
    await page.click('.row2-app');
    await page.waitForSelector('dialog.isheet[open]');
    const t = await dialogText(page);
    for (const k of ['Get the ADS-Nolimit app on your phone', 'Apple does not let a website install', 'Add to Home Screen', 'Got it', 'Already installed?']) has(t, k, 'en');
    await ctx.close();
  });
  await step('(4) bảng mở từ menu điện thoại: menu tự đóng', async () => {
    const { ctx, page } = await pub(browser, '/bang-gia/', { ua: UA.iphone26, motion: false });
    await page.click('.menu-toggle');
    await page.click('.mobile-app');
    await page.waitForSelector('dialog.isheet[open]');
    eq(await page.$eval('details.nav-mobile', (d) => d.open), false, 'menu đã đóng');
    await ctx.close();
  });

  await step('(4) trình duyệt trong app: nút Mở bằng Safari / Chrome có href đúng, Sao chép link ghi đúng địa chỉ trang', async () => {
    // Nút mở dùng đúng tên miền đang mở (bản thử: 127.0.0.1:<cổng>; web thật: www.ads-nolimit.agency)
    const HOST = '127.0.0.1:' + (process.env.WEB_PORT || '4330');
    for (const [key, startsWith, endsWith, btn] of [['fbIos', `x-safari-https://${HOST}/bang-gia/`, null, 'Mở bằng Safari'], ['zaloIos', `x-safari-https://${HOST}/bang-gia/`, null, 'Mở bằng Safari'], ['fbAndroid', `intent://${HOST}/bang-gia/`, ';end', 'Mở bằng Chrome']]) {
      const { ctx, page } = await pub(browser, '/bang-gia/?x=1', { ua: UA[key], motion: false });
      await page.click('.row2-app');
      await page.waitForSelector('dialog.isheet[open]');
      const href = await page.$eval('a.isheet-open', (a) => a.getAttribute('href'));
      assert(href.startsWith(startsWith), `${key}: href ${href}`);
      assert(href.includes('/bang-gia/?x=1'), `${key}: có đường dẫn + query ${href}`);
      if (endsWith) assert(href.endsWith(endsWith) && href.includes(';package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2F'), `${key}: kết thúc + dự phòng ${href}`);
      has(await page.$eval('a.isheet-open', (a) => a.textContent), btn, 'nhãn nút');
      await page.click('.isheet-copy');
      await page.waitForTimeout(200);
      eq(await page.evaluate(() => navigator.clipboard.readText()), page.url(), `${key}: nội dung đã sao chép`);
      has(await page.$eval('.isheet-copy', (b) => b.textContent), 'Đã sao chép link', 'nhãn sau khi chép');
      if (key === 'fbIos') await shot(page, 'trong-app-ios-390-toi');
      await ctx.close();
    }
  });

  // ---------- 5. Trang Tài khoản ----------
  await step('(5) Tài khoản 390, iPhone Safari 26, không có sự kiện: nút ở đầu trang + thẻ Tổng quan + khối Hồ sơ + chân trang đều có nút; bấm thẻ mở bảng', async () => {
    const { ctx, page } = await openAccount(browser, { ua: UA.iphone26, motion: false });
    const top = await page.$eval('.dash-app', (e) => { const b = e.getBoundingClientRect(); return { t: b.top + scrollY, w: b.width, h: b.height, txt: e.textContent.trim(), vis: getComputedStyle(e).display !== 'none' }; });
    assert(top.vis && top.t < 400 && top.w >= 44 && top.h >= 44, 'nút đầu trang ' + JSON.stringify(top));
    eq(await visible(page, '.dash-app'), 1, 'nút đầu trang thấy được');
    eq(await visible(page, '[data-view="overview"] .install-card [data-install-app]'), 1, 'thẻ Tổng quan có nút dù không có sự kiện');
    has(await page.$eval('[data-view="overview"] .install-card', (e) => e.textContent), 'Tải app', 'thẻ');
    await shot(page, 'tai-khoan-dau-trang-390-toi', { clip: { x: 0, y: 0, width: 390, height: 844 } });
    await shot(page, 'tai-khoan-tong-quan-390-toi', { fullPage: true });
    await page.hash; await page.evaluate(() => (location.hash = 'ho-so')); await page.waitForTimeout(700);
    eq(await visible(page, '.install-card--profile [data-install-app]'), 1, 'khối Hồ sơ có nút');
    eq((await page.$eval('.install-card--profile', (e) => e.textContent)).includes('Để sau'), false, 'Hồ sơ không có Để sau');
    await page.evaluate(() => (location.hash = 'tong-quan')); await page.waitForTimeout(500);
    // bấm nút trong thẻ
    await page.click('[data-view="overview"] .install-card [data-install-app]');
    await page.waitForSelector('dialog.isheet[open]');
    eq(await page.$eval('dialog.isheet', (d) => d.dataset.platform), 'ios-safari-26', 'bảng iOS 26');
    await shot(page, 'bang-iphone-safari26-390-toi');
    await page.keyboard.press('Escape');
    // Để sau → thẻ ẩn, nút đầu trang còn
    await page.click('[data-view="overview"] .install-card .btn-ghost'); await page.waitForTimeout(300);
    eq(await page.$('[data-view="overview"] .install-card'), null, 'thẻ ẩn sau Để sau');
    eq(await visible(page, '.dash-app'), 1, 'nút đầu trang KHÔNG bị Để sau ẩn');
    await page.locator('.footer-app').scrollIntoViewIfNeeded();
    eq(await visible(page, '.footer-app'), 1, 'chân trang');
    eq(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, 'không tràn ngang');
    await ctx.close();
  });
  await step('(5) Tài khoản 320 → đầu trang không tràn; nút đầu trang chỉ còn biểu tượng, ≥ 44px', async () => {
    const { ctx, page } = await openAccount(browser, { ua: UA.iphone26, width: 320, motion: false });
    const r = await page.evaluate(() => { const a = document.querySelector('.dash-app'); const b = a.getBoundingClientRect(); const lab = a.querySelector('span').getBoundingClientRect(); return { w: b.width, h: b.height, labelW: lab.width, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, actions: [...document.querySelectorAll('.dash-top-actions > *')].map((e) => { const x = e.getBoundingClientRect(); return [Math.round(x.left), Math.round(x.right)]; }) }; });
    assert(r.w >= 44 && r.h >= 44 && r.labelW <= 2 && r.over === 0, JSON.stringify(r));
    for (let i = 1; i < r.actions.length; i++) assert(r.actions[i][0] >= r.actions[i - 1][1] - 0.5, 'nút chồng nhau ' + JSON.stringify(r.actions));
    await shot(page, 'tai-khoan-dau-trang-320-toi', { clip: { x: 0, y: 0, width: 320, height: 420 } });
    await ctx.close();
  });
  await step('(5) Tài khoản có sự kiện cài: bấm nút đầu trang → prompt() 1 lần, thẻ + khối + nút ẩn hết', async () => {
    const { ctx, page } = await openAccount(browser, { ua: UA.chromeAndroid, init: FAKE_PROMPT('accepted') });
    eq((await page.$eval('[data-view="overview"] .install-card', (e) => e.dataset.install)), 'prompt', 'thẻ dạng prompt');
    await page.click('.dash-app');
    await page.waitForTimeout(700);
    eq(await page.evaluate(() => window.__promptCalls), 1, 'prompt()');
    eq(await page.$('dialog.isheet'), null, 'không bảng');
    eq(await page.$('.install-card'), null, 'thẻ biến mất');
    eq(await visible(page, '[data-install-app]'), 0, 'mọi nút ẩn');
    await ctx.close();
  });
  await step('(5) Tài khoản + standalone → không nút nào (đầu trang, thẻ, Hồ sơ, chân trang)', async () => {
    const { ctx, page } = await openAccount(browser, { ua: UA.chromeAndroid, init: STANDALONE + FAKE_PROMPT() });
    await page.evaluate(() => (location.hash = 'ho-so')); await page.waitForTimeout(500);
    eq(await visible(page, '[data-install-app]'), 0, 'nút còn thấy'); eq(await page.$('.install-card'), null, 'thẻ');
    await ctx.close();
  });
  await step('(5) Tài khoản 1440: thẻ + chân trang có nút, nút đầu trang ẩn (đã có hàng thanh trên máy tính)', async () => {
    const { ctx, page } = await openAccount(browser, { ua: UA.chromeDesktop, width: 1440, motion: false });
    eq(await visible(page, '.dash-app'), 0, 'nút đầu trang ẩn ở máy tính');
    eq(await visible(page, '[data-view="overview"] .install-card [data-install-app]'), 1, 'thẻ');
    await page.click('[data-view="overview"] .install-card [data-install-app]');
    await page.waitForSelector('dialog.isheet[open]');
    eq(await page.$eval('dialog.isheet', (d) => d.dataset.platform), 'desktop', 'bảng máy tính');
    await ctx.close();
  });
  await step('(5) /en/account/ → chữ tiếng Anh', async () => {
    const { ctx, page } = await openAccount(browser, { lang: 'en', ua: UA.iphone26, motion: false });
    has(await page.$eval('.dash-app', (e) => e.getAttribute('title')), 'Get the ADS-Nolimit app', 'tiêu đề nút');
    has(await page.$eval('[data-view="overview"] .install-card', (e) => e.textContent), 'Get app', 'thẻ');
    await ctx.close();
  });

  // ---------- 6. Ảnh + tương phản ----------
  await step('(6) bảng mở: tương phản ≥ 4,5 ở sáng/tối × 390/1440; ảnh', async () => {
    for (const [theme, w, ua, key] of [['toi', 390, UA.iphone26, 'iphone26'], ['sang', 390, UA.iphone26, 'iphone26'], ['toi', 1440, UA.chromeDesktop, 'chromeDesktop'], ['sang', 1440, UA.chromeDesktop, 'chromeDesktop'], ['toi', 390, UA.fbIos, 'fbIos'], ['sang', 390, UA.fbIos, 'fbIos'], ['sang', 390, UA.chromeAndroid, 'chromeAndroid'], ['toi', 390, UA.chromeAndroid, 'chromeAndroid']]) {
      const { ctx, page } = await pub(browser, '/', { ua, width: w, init: theme === 'sang' ? LIGHT : '', motion: false });
      if (theme === 'sang') eq(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light', 'giao diện sáng');
      await page.click(entry(ua, w));
      await page.waitForSelector('dialog.isheet[open]');
      await page.waitForTimeout(150);
      const loi = (await auditPage(page)).filter((l) => /isheet|dialog/.test(l.sel));
      assert(loi.length === 0, `${key} ${theme} ${w}: ${JSON.stringify(loi.slice(0, 4))}`);
      const all = await page.$$eval('dialog.isheet *', (els) => els.filter((e) => e.childNodes.length && [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())).length);
      assert(all >= 5, 'đã kiểm các phần tử chữ: ' + all);
      if (['iphone26', 'chromeAndroid', 'chromeDesktop'].includes(key)) await shot(page, `bang-${key}-${w}-${theme}`);
      await ctx.close();
    }
  });
  await step('(6) ảnh iPhone 430: Safari 26 + Facebook iOS (bảng, đầu trang, Tài khoản)', async () => {
    for (const [key, ua] of [['safari26', UA.iphone26], ['facebook', UA.fbIos430]]) for (const theme of ['toi', 'sang']) {
      const { ctx, page } = await pub(browser, '/', { ua, width: 430, init: theme === 'sang' ? LIGHT : '', motion: false });
      await shot(page, `iphone430-${key}-dau-trang-${theme}`, { clip: { x: 0, y: 0, width: 430, height: 190 } });
      await page.click('.row2-app'); await page.waitForSelector('dialog.isheet[open]');
      await shot(page, `iphone430-${key}-bang-${theme}`);
      const loi = (await auditPage(page)).filter((l) => /isheet|dialog/.test(l.sel));
      assert(loi.length === 0, `${key} ${theme} 430: ${JSON.stringify(loi.slice(0, 3))}`);
      eq(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, 'không tràn ngang');
      await ctx.close();
    }
    const { ctx, page } = await openAccount(browser, { ua: UA.fbIos430, width: 430, motion: false });
    eq((await page.$eval('[data-view="overview"] .install-card', (e) => e.textContent)).includes('chrome://'), false, 'không còn chữ chrome://apps');
    await page.evaluate(() => (location.hash = 'ho-so')); await page.waitForTimeout(600);
    eq(await visible(page, '.install-card--profile [data-install-app]'), 1, 'Hồ sơ trong Facebook có nút');
    await shot(page, 'iphone430-facebook-ho-so-toi', { fullPage: true });
    await page.click('.install-card--profile [data-install-app]'); await page.waitForSelector('dialog.isheet[open]');
    eq(await page.$eval('dialog.isheet', (d) => d.dataset.platform), 'ios-inapp', 'bảng trong app');
    assert((await page.$eval('a.isheet-open', (a) => a.getAttribute('href'))).startsWith('x-safari-https://127.0.0.1:' + (process.env.WEB_PORT || '4330') + '/'), 'href Safari');
    await ctx.close();
  });
  await step('(6) ảnh thanh đầu trang 320/390 sáng + tối; Tài khoản đầu trang sáng', async () => {
    for (const theme of ['toi', 'sang']) for (const w of [320, 390]) {
      const { ctx, page } = await pub(browser, '/', { ua: UA.iphone26, width: w, init: theme === 'sang' ? LIGHT : '', motion: false });
      await shot(page, `dau-trang-${w}-${theme}`, { clip: { x: 0, y: 0, width: w, height: 190 } });
      eq(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, `${w} ${theme} không tràn ngang`);
      await ctx.close();
    }
    const { ctx, page } = await openAccount(browser, { ua: UA.iphone26, motion: false, init: LIGHT });
    await shot(page, 'tai-khoan-dau-trang-390-sang', { clip: { x: 0, y: 0, width: 390, height: 844 } });
    await ctx.close();
  });
  await step('(6) không gọi mạng ngoài khi mở bảng (mọi yêu cầu ngoài máy chủ bị chặn đều không có)', async () => {
    const { ctx, page } = await pub(browser, '/', { ua: UA.iphone26, motion: false });
    await page.click('.row2-app'); await page.waitForSelector('dialog.isheet[open]');
    const blocked = ctx.external.filter((x) => x.action === 'BLOCKED').map((x) => x.url);
    eq(blocked.length, 0, 'yêu cầu ngoài: ' + blocked.join(', '));
    await ctx.close();
  });

  console.log(logs.join('\n') || 'không có lỗi console');
  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\nKết quả: ${results.length - fail} đạt, ${fail} không đạt`);
  process.exit(fail ? 1 : 0);
})();
