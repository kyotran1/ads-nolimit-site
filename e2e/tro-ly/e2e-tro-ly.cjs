// E2E: trợ lý AI (khung chat góc phải) với trạm giả — không gọi API thật.
// Cần bản build có địa chỉ trạm:  PUBLIC_TRO_LY_ENDPOINT=https://tro-ly.test/exec npm run build
// Chạy trong emulators:exec (từ firebase/):  WEB_PORT=… EMU_PORT=… SHOTS_DIR=… node ../e2e/tro-ly/e2e-tro-ly.cjs
const H = __dirname + '/../pwa/';
const { BASE, SHOTS, setupContext, chromium, emu, signIn, FakeAuth, watchConsole } = require(H + 'harness.cjs');
const { seedGlobal } = require(H + 'seed.cjs');
const path = require('path');
const ENDPOINT = 'https://tro-ly.test/exec';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? '  ✔' : '  ✗ KHÔNG ĐẠT'} ${name}${ok || !extra ? '' : ' — ' + extra}`); };

const REPLY = 'Chào bạn! Gói **AI Agent Khởi đầu**:\n- Cài đặt 4.900.000đ\n- Duy trì 990.000đ/tháng\n\nXem [bảng giá](https://www.ads-nolimit.agency/bang-gia/) hoặc nhắn https://zalo.me/0888882823. Link lạ [bấm đây](https://evil.example/x) <img src=x onerror="window.__xss=1">';

(async () => {
  await emu.clear();
  await seedGlobal();
  const browser = await chromium.launch();
  const logs = [];
  const reqs = [];
  let mode = 'ok';
  const relay = async (route) => {
    const body = route.request().postData() || '';
    const m = mode; // chốt chế độ lúc nhận yêu cầu
    reqs.push({ body: JSON.parse(body), ct: route.request().headers()['content-type'] });
    if (m === 'abort') return route.abort('failed');
    await new Promise((r) => setTimeout(r, 600));
    const payload = m === 'ok' ? { ok: true, reply: REPLY } : { ok: false, code: m };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(payload) });
  };

  for (const width of [1440, 390]) {
    console.log(`\n== Rộng ${width} ==`);
    reqs.length = 0;
    mode = 'ok';
    const fake = new FakeAuth();
    const ctx = await setupContext(browser, { fake, viewport: width < 600 ? { width, height: 844 } : { width, height: 900 }, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600 });
    await ctx.route(ENDPOINT + '**', relay);
    const page = await ctx.newPage();
    watchConsole(page, logs);
    page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
    await page.goto(BASE + '/');
    const fab = page.locator('.trl-fab');
    await fab.waitFor();
    const fb = await fab.boundingBox();
    const vp = page.viewportSize();
    check('1. nút trợ lý ở góc dưới phải', fb.x + fb.width > vp.width - 40 && fb.y + fb.height > vp.height - (width < 600 ? 140 : 60), JSON.stringify(fb));
    if (width < 600) {
      const bar = await page.locator('.contact-bar').boundingBox();
      check('1b. điện thoại: nút nằm trên thanh liên hệ, không đè', fb.y + fb.height <= bar.y - 4, `fab ${fb.y + fb.height} bar ${bar.y}`);
    }
    await page.screenshot({ path: path.join(SHOTS, `tro-ly-${width}-nut.png`) });

    await fab.click();
    const panel = page.locator('#trl-panel');
    await panel.waitFor();
    const pb = await panel.boundingBox();
    check('2. mở khung chat, nằm trọn trong màn hình', pb.x >= 0 && pb.y >= 0 && pb.x + pb.width <= vp.width && pb.y + pb.height <= vp.height, JSON.stringify(pb));
    check('2b. con trỏ ở ô nhập, nút báo đang mở', (await page.evaluate(() => document.activeElement?.tagName)) === 'TEXTAREA' && (await fab.getAttribute('aria-expanded')) === 'true');
    check('2c. có lời chào + 3 câu gợi ý', (await panel.innerText()).includes('trợ lý AI của ADS-Nolimit') && (await page.locator('.trl-chip').count()) === 3);
    if (width < 600) check('2d. ô nhập cỡ chữ 16px (iPhone không tự phóng to)', (await page.$eval('.trl-form textarea', (e) => getComputedStyle(e).fontSize)) === '16px');
    await page.screenshot({ path: path.join(SHOTS, `tro-ly-${width}-mo.png`) });

    await page.fill('.trl-form textarea', '  Giá AI Agent bao nhiêu?  ');
    await page.keyboard.press('Enter');
    await page.locator('.trl-typing').waitFor({ timeout: 3000 }).catch(() => {});
    check('3. đang chờ: có chấm "đang soạn", nút gửi khóa', (await page.locator('.trl-typing').count()) === 1 && (await page.locator('.trl-send').isDisabled()));
    await page.locator('.trl-msg--ai:not(.trl-typing)').nth(1).waitFor();
    const r = reqs[0]?.body;
    check('4. yêu cầu gửi trạm đúng dạng (v1, mã phiên, vi, trang /, chỉ câu của khách đã làm gọn)', r && r.v === 1 && /^[A-Za-z0-9_-]{20}$/.test(r.sid) && r.lang === 'vi' && r.page === '/' && JSON.stringify(r.messages) === JSON.stringify([{ role: 'user', content: 'Giá AI Agent bao nhiêu?' }]), JSON.stringify(r));
    check('4b. gửi dạng text/plain (không phải hỏi trước CORS)', (reqs[0]?.ct || '').startsWith('text/plain'));
    const ai = page.locator('.trl-msg--ai:not(.trl-typing)').nth(1);
    check('5. trả lời: in đậm + gạch đầu dòng', (await ai.locator('strong').innerText()) === 'AI Agent Khởi đầu' && (await ai.locator('li').count()) === 2);
    const hrefs = await ai.locator('a').evaluateAll((as) => as.map((a) => a.href));
    check('5b. chỉ có link tới web ADS-Nolimit và Zalo; link lạ thành chữ', JSON.stringify(hrefs) === JSON.stringify(['https://www.ads-nolimit.agency/bang-gia/', 'https://zalo.me/0888882823']) && (await ai.innerText()).includes('bấm đây'), JSON.stringify(hrefs));
    check('5c. mã HTML trong trả lời hiện thành chữ, không chạy', (await ai.locator('img').count()) === 0 && (await page.evaluate(() => window.__xss)) === undefined && (await ai.innerText()).includes('<img'));
    check('5d. hết gợi ý sau câu hỏi đầu', !(await page.locator('.trl-chips').isVisible()));
    await page.screenshot({ path: path.join(SHOTS, `tro-ly-${width}-tra-loi.png`) });

    await page.reload();
    await page.locator('#trl-panel').waitFor();
    check('6. tải lại trang: khung vẫn mở, còn cuộc trò chuyện', (await page.locator('.trl-msg--me').count()) === 1 && (await page.locator('.trl-msg--ai:not(.trl-typing)').count()) === 2);
    await page.goto(BASE + '/bang-gia/');
    await page.locator('#trl-panel').waitFor();
    check('6b. sang trang khác: vẫn mở, vẫn còn lịch sử', (await page.locator('.trl-msg--me').count()) === 1);
    await page.fill('.trl-form textarea', 'Còn quảng cáo?');
    await page.click('.trl-send');
    await page.locator('.trl-msg--ai:not(.trl-typing)').nth(2).waitFor();
    const r2 = reqs[1]?.body;
    check('6c. câu thứ hai gửi kèm lịch sử (khách → AI → khách) và trang /bang-gia/', r2 && r2.messages.length === 3 && r2.messages[1].role === 'assistant' && r2.page === '/bang-gia/' && r2.sid === r.sid, JSON.stringify(r2 && r2.messages.map((m) => m.role)));

    for (const [m, word] of [['limit', 'hỏi khá nhiều'], ['daily', 'tạm nghỉ'], ['busy', 'đang bận'], ['setup', 'chưa trả lời được'], ['abort', 'chưa trả lời được']]) {
      mode = m;
      const before = await page.locator('.trl-msg--note').count();
      await page.fill('.trl-form textarea', `thử ${m}`);
      await page.click('.trl-send');
      await page.waitForFunction((n) => document.querySelectorAll('.trl-msg--note').length > n, before, { timeout: 5000 }).catch(() => {});
      const t = await page.locator('.trl-msg--note').last().innerText().catch(() => '');
      check(`7. lỗi ${m} → báo dễ hiểu, gợi ý Zalo/thử lại`, t.includes(word), t);
    }
    mode = 'ok';
    const before = reqs.length;
    await page.fill('.trl-form textarea', 'sau lỗi');
    await page.click('.trl-send');
    await page.locator('.trl-msg--ai:not(.trl-typing)').nth(3).waitFor();
    const r3 = reqs[before].body;
    check('7b. tin báo lỗi không gửi lên trạm; các câu khách liền nhau vẫn gửi', !JSON.stringify(r3.messages).includes('hỏi khá nhiều') && r3.messages.at(-1).content === 'sau lỗi');

    await page.click('.trl-clear');
    check('8. xóa trò chuyện → chỉ còn lời chào + gợi ý', (await page.locator('.trl-msg').count()) === 1 && (await page.locator('.trl-chips').isVisible()));
    await page.keyboard.press('Escape');
    check('9. Esc đóng khung, nút báo đã đóng', !(await page.locator('#trl-panel').isVisible()) && (await fab.getAttribute('aria-expanded')) === 'false');
    await page.reload();
    await page.waitForTimeout(800);
    check('9b. tải lại sau khi đóng: khung không tự mở', (await page.locator('#trl-panel').count()) === 0);

    await page.goto(BASE + '/');
    await page.click('.news-pill');
    await page.locator('#trl-panel').waitFor({ timeout: 3000 }).catch(() => {});
    check('10. nhãn "Mới" ở trang chủ mở khung chat', await page.locator('#trl-panel').isVisible());
    await page.keyboard.press('Escape');

    await page.goto(BASE + '/en/');
    await page.locator('.trl-fab').click();
    await page.locator('#trl-panel').waitFor();
    check('11. trang tiếng Anh: chữ tiếng Anh', (await page.locator('#trl-panel').innerText()).includes('ADS-Nolimit AI assistant'));
    await page.fill('.trl-form textarea', 'price?');
    await page.keyboard.press('Enter');
    await page.locator('.trl-msg--ai:not(.trl-typing)').nth(1).waitFor();
    check('11b. gửi lang en', reqs.at(-1).body.lang === 'en' && reqs.at(-1).body.page === '/en/');
    await page.keyboard.press('Escape');

    // trang tài khoản (đăng nhập)
    const u = fake.addUser({ email: `k${width}@example.com`, password: 'pass-12345', displayName: 'Khách Thử', emailVerified: true });
    await emu.set(`users/${u.uid}`, { displayName: 'Khách Thử', email: u.email, createdAt: new Date(), updatedAt: new Date() });
    await signIn(page, u.email, 'pass-12345', '/tai-khoan/');
    await page.waitForSelector('#acc-app:not([hidden])');
    await page.locator('.trl-fab').waitFor();
    check('12. trang Tài khoản cũng có nút trợ lý', await page.locator('.trl-fab').isVisible());
    await page.screenshot({ path: path.join(SHOTS, `tro-ly-${width}-tai-khoan.png`) });
    await ctx.close();
  }

  // trang Quản trị và trang Không có mạng: không có (chưa đăng nhập thì /quan-tri/ chuyển sang Đăng nhập, nên đọc thẳng HTML)
  const htmlOf = async (p) => (await (await fetch(BASE + p)).text());
  check('13. trang Quản trị và trang Không có mạng không có nút trợ lý', !(await htmlOf('/quan-tri/')).includes('id="trl"') && !(await htmlOf('/offline/')).includes('id="trl"'));
  await browser.close();
  const errs = logs.filter((l) => /PAGEERROR|\[error\]/.test(l) && !/favicon|403|ERR_FAILED|tro-ly\.test/.test(l));
  check('14. không có lỗi trang', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(`\nKẾT QUẢ: ${pass}/${pass + fail} ĐẠT`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
