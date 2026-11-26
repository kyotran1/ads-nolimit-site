// Test đơn vị thuần cho nút "Tải app": phân loại nền tảng (installPlatform) và chữ hướng dẫn (install-sheet-text). Chạy: npm run test:unit
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installPlatform, isIosSafari } from '../../src/lib/pwa/install.ts';
import { sheetContent, splitStep, safariUrl, chromeUrl, GLYPHS } from '../../src/lib/pwa/install-sheet-text.ts';

const UA = {
  iphoneSafari17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneSafari26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  ipadSafari: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  cocCocIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 coc_coc_browser/120.0.250 Mobile',
  edgeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/126.2592.80 Mobile/15E148 Safari/605.1.15',
  firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  facebookIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.38.108;FBBV/564431005;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/vi_VN]',
  zaloIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo/24.5.1',
  facebookAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.38.108;]',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  cocCocAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 coc_coc_browser/120.0.250',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  chromeDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  cocCocDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 coc_coc_browser/120.0.250 Chrome/120.0.0.0',
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  firefoxDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
};

describe('installPlatform', () => {
  const cases = [
    ['iPhone Safari 17', UA.iphoneSafari17, 5, 'ios-safari'],
    ['iPhone Safari 26', UA.iphoneSafari26, 5, 'ios-safari-26'],
    ['iPad (UA iPad)', UA.ipadSafari, 5, 'ios-safari'],
    ['iPad đòi trang máy tính (Macintosh + chạm)', UA.ipadDesktopMode, 5, 'ios-safari'],
    ['Chrome iOS', UA.chromeIos, 5, 'ios-chrome'],
    ['Cốc Cốc iOS', UA.cocCocIos, 5, 'ios-other'],
    ['Edge iOS', UA.edgeIos, 5, 'ios-other'],
    ['Firefox iOS', UA.firefoxIos, 5, 'ios-other'],
    ['Facebook iOS', UA.facebookIos, 5, 'ios-inapp'],
    ['Zalo iOS', UA.zaloIos, 5, 'ios-inapp'],
    ['Facebook Android', UA.facebookAndroid, 5, 'android-inapp'],
    ['Chrome Android', UA.chromeAndroid, 5, 'android'],
    ['Cốc Cốc Android', UA.cocCocAndroid, 5, 'android'],
    ['Samsung Internet', UA.samsung, 5, 'android'],
    ['Chrome máy tính', UA.chromeDesktop, 0, 'desktop'],
    ['Cốc Cốc máy tính', UA.cocCocDesktop, 0, 'desktop'],
    ['Chrome trên Mac', UA.chromeMac, 0, 'desktop'],
    ['Safari Mac', UA.safariMac, 0, 'desktop-safari'],
    ['Firefox máy tính', UA.firefoxDesktop, 0, 'desktop-firefox'],
  ];
  for (const [name, ua, touch, want] of cases) test(`${name} → ${want}`, () => assert.equal(installPlatform(ua, touch), want));
  test('UA rỗng → desktop', () => assert.equal(installPlatform('', 0), 'desktop'));
});

describe('isIosSafari (hàm cũ giữ nguyên hành vi)', () => {
  test('Safari iPhone 17 / 26 và iPad → true', () => {
    for (const ua of [UA.iphoneSafari17, UA.iphoneSafari26, UA.ipadSafari]) assert.equal(isIosSafari(ua, 5), true);
    assert.equal(isIosSafari(UA.ipadDesktopMode, 5), true);
  });
  test('Chrome/Edge/Firefox iOS, Facebook, Zalo, Android, Mac thật → false', () => {
    for (const ua of [UA.chromeIos, UA.edgeIos, UA.firefoxIos, UA.facebookIos, UA.zaloIos, UA.chromeAndroid]) assert.equal(isIosSafari(ua, 5), false);
    assert.equal(isIosSafari(UA.safariMac, 0), false);
  });
});

describe('chữ hướng dẫn (sheetContent)', () => {
  const platforms = ['ios-safari', 'ios-safari-26', 'ios-chrome', 'ios-other', 'ios-inapp', 'android-inapp', 'android', 'desktop-safari', 'desktop-firefox', 'desktop'];
  for (const lang of ['vi', 'en']) {
    test(`${lang}: mọi nền tảng có tiêu đề, dẫn nhập, ít nhất 1 bước, mã biểu tượng hợp lệ`, () => {
      for (const p of platforms) {
        const c = sheetContent(p, lang);
        assert.ok(c.title && c.lead && c.steps.length >= 1, p);
        for (const s of c.steps) for (const m of s.matchAll(/\{(\w+)\}/g)) assert.ok(GLYPHS.includes(m[1]), `${p}: mã lạ ${m[0]}`);
      }
    });
  }
  test('iOS: nói thật là Apple không cho web tự cài, không hứa một lần bấm', () => {
    for (const p of ['ios-safari', 'ios-safari-26', 'ios-chrome', 'ios-other']) {
      const c = sheetContent(p, 'vi');
      assert.match(c.lead, /Apple không cho/, p);
      assert.doesNotMatch(c.lead + c.steps.join(' ') + c.note, /một lần|1 lần|một chạm|tự động cài/i, p);
    }
  });
  test('đúng bước từng nền tảng (từ khóa)', () => {
    const j = (p) => sheetContent(p, 'vi').steps.join(' | ');
    assert.match(j('ios-safari-26'), /\{dots\}.*góc dưới bên phải/); assert.match(j('ios-safari-26'), /Chia sẻ/); assert.match(j('ios-safari-26'), /Thêm vào MH chính/);
    assert.match(j('ios-safari'), /Chia sẻ \{share\}.*thanh dưới/); assert.match(j('ios-safari'), /Thêm vào MH chính/);
    assert.match(j('ios-chrome'), /cuối thanh địa chỉ/); assert.match(j('ios-chrome'), /Thêm vào MH chính/);
    assert.match(j('android'), /\{dotsv\}/); assert.match(j('android'), /Thêm vào màn hình chính/); assert.match(j('android'), /Cài đặt ứng dụng/);
    assert.match(j('desktop'), /\{install\}/); assert.match(j('desktop'), /Cài đặt trang dưới dạng ứng dụng/);
    assert.match(j('desktop-safari'), /Thêm vào Dock/);
    assert.match(sheetContent('desktop-firefox', 'vi').lead, /Chrome hoặc Edge/);
  });
  test('trong app: có nút mở trình duyệt thật + sao chép link; máy tính chọn tiêu đề "máy tính"', () => {
    assert.equal(sheetContent('ios-inapp', 'vi').open, 'safari');
    assert.equal(sheetContent('android-inapp', 'vi').open, 'chrome');
    assert.equal(sheetContent('ios-inapp', 'vi').copy, true);
    assert.equal(sheetContent('android-inapp', 'vi').copy, true);
    assert.equal(sheetContent('ios-safari', 'vi').open, null);
    assert.match(sheetContent('ios-safari', 'vi').title, /về điện thoại/);
    assert.match(sheetContent('desktop', 'vi').title, /máy tính/);
  });
});

describe('splitStep và địa chỉ mở trình duyệt', () => {
  test('tách chữ và biểu tượng', () => {
    assert.deepEqual(splitStep('Bấm {share} ở đây'), ['Bấm ', { glyph: 'share' }, ' ở đây']);
    assert.deepEqual(splitStep('Chỉ chữ'), ['Chỉ chữ']);
    assert.deepEqual(splitStep('{dots}'), [{ glyph: 'dots' }]);
  });
  test('safariUrl / chromeUrl', () => {
    assert.equal(safariUrl('/bang-gia/'), 'x-safari-https://www.ads-nolimit.agency/bang-gia/');
    assert.equal(chromeUrl('/en/?a=1'), 'intent://www.ads-nolimit.agency/en/?a=1#Intent;scheme=https;package=com.android.chrome;end');
  });
});
