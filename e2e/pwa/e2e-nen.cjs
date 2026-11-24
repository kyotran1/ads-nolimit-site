const { chromium } = require('playwright');
const fs = require('fs');
const B = 'http://127.0.0.1:4330';
const SHOTS = '/tmp/claude-0/-home-claude/518e96b9-6704-53d2-abe0-181328bc886f/scratchpad/e2e-v4/shots-pwa-merge';
const DIST = '/home/claude/ads-nolimit-v4/dist/bang-gia/index.html';
const { execSync } = require('child_process');
const SERVE = '/tmp/claude-0/-home-claude/518e96b9-6704-53d2-abe0-181328bc886f/scratchpad/e2e-v4/serve.sh';
const stopSrv = () => { execSync('pkill -f "http.serve[r] 4330" || true'); execSync('sleep 0.7'); };
const startSrv = () => { execSync(SERVE + ' 4330 /home/claude/ads-nolimit-v4/dist', { stdio: 'ignore' }); };
const res = {};
const ok = (k, c, ev) => { res[k] = (c ? 'PASS ' : 'FAIL ') + ev; console.log(k, res[k]); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // (a) manifest
  for (const [lang, url, start] of [['vi', '/site.webmanifest', '/tai-khoan/?src=pwa'], ['en', '/site.en.webmanifest', '/en/account/?src=pwa']]) {
    const r = await page.request.get(B + url);
    let m; try { m = await r.json(); } catch (e) {}
    let icons = [];
    if (m) for (const i of m.icons.concat(...m.shortcuts.map((s) => s.icons))) icons.push((await page.request.get(B + i.src)).status());
    ok('a-' + lang, r.status() === 200 && m && m.display === 'standalone' && m.start_url === start && m.lang === lang && icons.every((s) => s === 200) && m.icons.some((i) => i.purpose === 'maskable'),
      `status ${r.status()} display=${m && m.display} start=${m && m.start_url} icons=${icons.join(',')}`);
  }
  // link points to the right manifest per page
  const lk = async (u) => ((await (await page.request.get(B + u)).text()).match(/rel="manifest" href="([^"]+)"/) || [])[1];
  const viLink = await lk('/tai-khoan/'); const enLink = await lk('/en/account/');
  ok('a-link', viLink === '/site.webmanifest' && enLink === '/site.en.webmanifest', `vi=${viLink} en=${enLink}`);
  // (b) SW register + control after 2nd load
  await page.goto(B + '/bang-gia/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const ctl = await page.evaluate(() => !!navigator.serviceWorker.controller);
  const keys = await page.evaluate(() => caches.keys());
  ok('b', ctl && keys.length === 1 && keys[0].startsWith('adsnl-'), `controller=${ctl} caches=${JSON.stringify(keys)}`);
  // old cache cleanup: plant stale cache, publish a "new build" sw.js (different BUILD), update() -> activate must delete old caches
  await page.evaluate(async () => { await caches.open('adsnl-OLD'); });
  const SW = '/home/claude/ads-nolimit-v4/dist/sw.js';
  const swOrig = fs.readFileSync(SW, 'utf8');
  fs.writeFileSync(SW, swOrig.replace(/const BUILD = '[0-9]+'/, "const BUILD = '99999999999999'"));
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  await page.waitForTimeout(1500);
  const keys2 = await page.evaluate(() => caches.keys());
  fs.writeFileSync(SW, swOrig);
  ok('b-activate-cleanup', !keys2.includes('adsnl-OLD') && keys2.length === 1 && keys2[0] === 'adsnl-99999999999999', `caches after new-version activate=${JSON.stringify(keys2)}`);
  // (c) offline
  await page.reload(); // ensure controlled
  stopSrv();
  let r1; try { r1 = await page.goto(B + '/bang-gia/'); } catch (e) { r1 = null; console.log('goto err', e.message); }
  const t1 = await page.locator('body').innerText();
  await page.setViewportSize({ width: 390, height: 800 });
  await page.screenshot({ path: SHOTS + '/offline-390.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: SHOTS + '/offline-1440.png' });
  const offlineShown = /Không có mạng/.test(t1) && /No connection/.test(t1);
  startSrv();
  await page.goto(B + '/bang-gia/');
  const t2 = await page.locator('body').innerText();
  ok('c', offlineShown && !/Không có mạng/.test(t2), `offline page shown=${offlineShown}; after reconnect offlineText=${/Không có mạng/.test(t2)} title="${await page.title()}"`);
  // retry button reloads when back online
  stopSrv();
  await page.goto(B + '/bang-gia/');
  startSrv();
  await page.click('#retry');
  await page.waitForLoadState('load'); await page.waitForTimeout(500);
  ok('c-retry', !/Không có mạng/.test(await page.locator('body').innerText()), 'Thử lại -> trang thật');
  // (d) edited HTML shows immediately
  const orig = fs.readFileSync(DIST, 'utf8');
  fs.writeFileSync(DIST, orig.replace('</body>', '<p id="marker-xyz">MARKER-123</p></body>'));
  await page.goto(B + '/bang-gia/');
  const mk = await page.locator('#marker-xyz').count();
  const ctl2 = await page.evaluate(() => !!navigator.serviceWorker.controller);
  fs.writeFileSync(DIST, orig);
  ok('d', mk === 1 && ctl2, `marker present=${mk}, SW controlling=${ctl2}`);
  // (e) 404 with network
  const r404 = await page.goto(B + '/khong-co-trang-nay/');
  const t404 = await page.locator('body').innerText();
  ok('e', r404.status() === 404 && !/Không có mạng/.test(t404) && /404|Not Found|not found/i.test(t404), `status=${r404.status()} offlineText=${/Không có mạng/.test(t404)} body="${t404.slice(0, 60).replace(/\n/g, ' ')}"`);
  // (f) admin manifest
  await page.goto(B + '/quan-tri/');
  const adm = await page.getAttribute('link[rel=manifest]', 'href');
  const atouch = await page.getAttribute('link[rel=apple-touch-icon]', 'href');
  ok('f', adm === '/site.webmanifest' && atouch === '/apple-touch-icon.png', `manifest=${adm} apple-touch-icon=${atouch}`);
  // extra: cross-origin & POST untouched; asset cached; beforeinstallprompt hook
  await page.goto(B + '/bang-gia/');
  await page.waitForTimeout(500);
  const cached = await page.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).map((r) => new URL(r.url).pathname); });
  console.log('cached entries', JSON.stringify(cached));
  const hook = await page.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); window.dispatchEvent(e); return { prevented: e.defaultPrevented, stored: window.__adsnlInstall === e }; });
  console.log('install hook', JSON.stringify(hook));
  await browser.close();
  fs.writeFileSync('/tmp/claude-0/-home-claude/518e96b9-6704-53d2-abe0-181328bc886f/scratchpad/pwa-a/result.json', JSON.stringify(res, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
