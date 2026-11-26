// Test đơn vị thuần cho "Đăng nhập bằng Facebook": bảng dịch lỗi (vi/en), thứ tự nút theo nền tảng, nhãn cách đăng nhập,
// chế độ khối thêm/xác minh email. Chạy: npm run test:unit
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPlatform } from '../../src/lib/pwa/install.ts';
import {
  facebookErrorText,
  facebookErrorCodes,
  existsMessage,
  existsMessageSignUp,
  inAppKind,
  signInLayout,
  googleNoteMessage,
  providerLabels,
  hasProvider,
  canUnlink,
  reauthProvider,
  emailGapMode,
} from '../../src/lib/auth/facebook.ts';

const UA = {
  fbIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 [FBAN/FBIOS;FBAV/530.0.0.40.98;FBBV/123;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.6;FBSS/3;FBID/phone;FBLC/vi_VN;FBOP/5]',
  messengerIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 [FBAN/MessengerForiOS;FBAV/500.0.0.30.100;FBBV/123;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.6]',
  fbAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.38.108;]',
  zaloIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo/24.5.1',
  zaloAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 Zalo/24.5.1',
  instagramIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.20.113',
  safariIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  chromeDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};
const layout = (ua, touch = 5) => signInLayout(installPlatform(ua, touch), ua);

describe('bảng dịch lỗi Facebook (vi/en)', () => {
  test('khách tự đóng cửa sổ → im lặng (cả mã có và không có "auth/")', () => {
    for (const code of ['popup-closed-by-user', 'cancelled-popup-request', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request']) {
      for (const lang of ['vi', 'en']) assert.equal(facebookErrorText(code, lang), '', `${code}/${lang}`);
    }
  });
  test('popup bị chặn: nhắc cho phép cửa sổ bật lên', () => {
    assert.match(facebookErrorText('auth/popup-blocked', 'vi'), /Facebook.*(cửa sổ bật lên|pop-up)/);
    assert.match(facebookErrorText('popup-blocked', 'en'), /Facebook.*pop-ups/);
  });
  test('Facebook chưa được bật trên Firebase: nhắn dùng Google hoặc email tạm thời', () => {
    assert.match(facebookErrorText('auth/operation-not-allowed', 'vi'), /Google hoặc email tạm thời/);
    assert.match(facebookErrorText('auth/operation-not-allowed', 'en'), /Google or your email for now/);
  });
  test('email trùng tài khoản khác: nêu đúng email và hướng dẫn đăng nhập cách cũ, tự nối Facebook', () => {
    const vi = facebookErrorText('auth/account-exists-with-different-credential', 'vi', 'lan@example.com');
    assert.match(vi, /Email lan@example\.com đã có tài khoản ADS-Nolimit/);
    assert.match(vi, /Google hoặc email & mật khẩu/);
    assert.match(vi, /tự nối Facebook/);
    const en = facebookErrorText('auth/account-exists-with-different-credential', 'en', 'lan@example.com');
    assert.match(en, /lan@example\.com already has an ADS-Nolimit account/);
    assert.match(en, /link Facebook .* automatically/);
    assert.equal(existsMessage('vi', 'a@b.vn'), facebookErrorText('account-exists-with-different-credential', 'vi', 'a@b.vn'));
    assert.match(existsMessage('vi', ''), /^Email này đã có tài khoản/);
  });
  test('trang Đăng ký: không bảo khách "đăng nhập ngay bên dưới" (khung email ở đó là để TẠO tài khoản)', () => {
    const vi = existsMessageSignUp('vi', 'lan@example.com');
    assert.match(vi, /lan@example\.com/);
    assert.match(vi, /Đăng ký với Google/);
    assert.doesNotMatch(vi, /ngay bên dưới/);
    assert.match(existsMessageSignUp('en', 'lan@example.com'), /Sign up with Google/);
  });
  test('lưu trữ trình duyệt bị chặn và lỗi mạng: thông báo chung (không đổ lỗi cho Google)', () => {
    assert.match(facebookErrorText('auth/web-storage-unsupported', 'vi'), /chế độ riêng tư/);
    assert.match(facebookErrorText('auth/web-storage-unsupported', 'en'), /private mode/);
    assert.match(facebookErrorText('auth/network-request-failed', 'vi'), /Facebook/);
    assert.match(facebookErrorText('auth/timeout', 'en'), /Could not reach Facebook/);
  });
  test('mã lạ → thông báo chung, có cả vi và en', () => {
    assert.match(facebookErrorText('auth/something-new', 'vi'), /Chưa đăng nhập được bằng Facebook/);
    assert.match(facebookErrorText('auth/something-new', 'en'), /Could not sign in with Facebook/);
  });
  test('mọi mã có chữ riêng đều có cả vi và en, xưng "bạn", và KHÔNG hứa "mở app Facebook"', () => {
    const codes = [...facebookErrorCodes(), 'account-exists-with-different-credential'];
    assert.ok(codes.length >= 9);
    for (const code of codes) {
      const vi = facebookErrorText(code, 'vi', 'x@y.vn');
      const en = facebookErrorText(code, 'en', 'x@y.vn');
      assert.ok(vi.length > 10 && en.length > 10, code);
      assert.notEqual(vi, en, code);
      assert.doesNotMatch(vi, /mở (ứng dụng|app) Facebook/i, code);
      assert.doesNotMatch(en, /open the Facebook app/i, code);
      assert.doesNotMatch(vi, /\b(quý khách|em)\b/i, code);
    }
  });
});

describe('thứ tự nút theo nền tảng', () => {
  test('trong app Facebook iOS/Android và Messenger → Facebook lên trên + dòng nhắc Google', () => {
    for (const ua of [UA.fbIos, UA.messengerIos, UA.fbAndroid]) assert.deepEqual(layout(ua), { facebookFirst: true, googleNote: true }, ua.slice(0, 60));
  });
  test('trong Zalo (iOS, Android) → giữ thứ tự, vẫn có dòng nhắc', () => {
    for (const ua of [UA.zaloIos, UA.zaloAndroid]) assert.deepEqual(layout(ua), { facebookFirst: false, googleNote: true }, ua.slice(0, 60));
  });
  test('Instagram và app khác → giữ thứ tự, có dòng nhắc', () => {
    assert.deepEqual(layout(UA.instagramIos), { facebookFirst: false, googleNote: true });
  });
  test('Safari/Chrome/máy tính → thứ tự thường, không có dòng nhắc', () => {
    for (const ua of [UA.safariIos, UA.chromeAndroid, UA.chromeDesktop, UA.safariMac]) assert.deepEqual(layout(ua, ua === UA.chromeDesktop ? 0 : 5), { facebookFirst: false, googleNote: false }, ua.slice(0, 60));
  });
  test('inAppKind phân loại đúng', () => {
    assert.equal(inAppKind(UA.fbIos), 'facebook');
    assert.equal(inAppKind(UA.messengerIos), 'facebook');
    assert.equal(inAppKind(UA.fbAndroid), 'facebook');
    assert.equal(inAppKind(UA.zaloIos), 'zalo');
    assert.equal(inAppKind(UA.instagramIos), 'other');
    assert.equal(inAppKind(UA.safariIos), null);
    assert.equal(inAppKind(UA.chromeDesktop), null);
  });
  test('dòng nhắc có hướng dẫn mở bằng Safari/Chrome, không hứa mở app Facebook', () => {
    for (const lang of ['vi', 'en']) {
      const t = googleNoteMessage(lang);
      assert.match(t, /Safari\/Chrome/);
      assert.match(t, /Facebook/);
      assert.doesNotMatch(t, /mở (ứng dụng|app) Facebook|open the Facebook app/i);
    }
    assert.match(googleNoteMessage('vi'), /Google không cho đăng nhập trong app này/);
  });
});

describe('cách đăng nhập hiện ở Bảo mật (providerData)', () => {
  const P = (...ids) => ids.map((providerId) => ({ providerId }));
  test('nhãn theo providerData, đúng thứ tự, vi và en', () => {
    assert.deepEqual(providerLabels(P('google.com', 'facebook.com', 'password'), 'vi'), ['Google', 'Facebook', 'Email & mật khẩu']);
    assert.deepEqual(providerLabels(P('facebook.com'), 'en'), ['Facebook']);
    assert.deepEqual(providerLabels(P('password'), 'en'), ['Email & password']);
    assert.deepEqual(providerLabels(P('phone', 'facebook.com'), 'vi'), ['phone', 'Facebook']);
    assert.deepEqual(providerLabels(P('facebook.com', 'facebook.com'), 'vi'), ['Facebook']);
    assert.deepEqual(providerLabels([], 'vi'), []);
  });
  test('hasProvider / canUnlink: chỉ bỏ nối khi còn ít nhất một cách khác', () => {
    assert.equal(hasProvider(P('facebook.com'), 'facebook.com'), true);
    assert.equal(hasProvider(P('google.com'), 'facebook.com'), false);
    assert.equal(canUnlink(P('facebook.com'), 'facebook.com'), false);
    assert.equal(canUnlink(P('facebook.com', 'google.com'), 'facebook.com'), true);
    assert.equal(canUnlink(P('facebook.com', 'password'), 'facebook.com'), true);
    assert.equal(canUnlink(P('google.com', 'password'), 'facebook.com'), false);
  });
  test('xác nhận lại danh tính: Google nếu có, không thì Facebook', () => {
    assert.equal(reauthProvider(P('facebook.com')), 'facebook');
    assert.equal(reauthProvider(P('facebook.com', 'google.com')), 'google');
    assert.equal(reauthProvider(P('google.com')), 'google');
  });
});

describe('khối thêm/xác minh email của khách Facebook', () => {
  const U = (email, emailVerified, ...ids) => ({ email, emailVerified, providerData: ids.map((providerId) => ({ providerId })) });
  test('không có email → "add" (kể cả cách đăng nhập khác)', () => {
    assert.equal(emailGapMode(U(null, false, 'facebook.com')), 'add');
    assert.equal(emailGapMode(U('', false, 'facebook.com')), 'add');
  });
  test('có email chưa xác minh + có Facebook → "verify"', () => {
    assert.equal(emailGapMode(U('a@b.vn', false, 'facebook.com')), 'verify');
    assert.equal(emailGapMode(U('a@b.vn', false, 'google.com', 'facebook.com')), 'verify');
  });
  test('đã xác minh, hoặc khách email/Google chưa xác minh (không đụng cách hiện có) → "none"', () => {
    assert.equal(emailGapMode(U('a@b.vn', true, 'facebook.com')), 'none');
    assert.equal(emailGapMode(U('a@b.vn', false, 'password')), 'none');
    assert.equal(emailGapMode(U('a@b.vn', false, 'google.com')), 'none');
  });
});

describe('không dùng Facebook JS SDK và không đặt tên giống quảng cáo', () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  test('không có mã đăng nhập nào nạp connect.facebook.net hoặc FB.init (Meta Pixel của Analytics.astro, mặc định tắt, là việc khác)', () => {
    const bad = walk(SRC)
      .filter((f) => /\.(astro|ts|css)$/.test(f) && !f.endsWith('Analytics.astro'))
      .filter((f) => /connect\.facebook\.net|FB\.init|fbAsyncInit/.test(readFileSync(f, 'utf8')));
    assert.deepEqual(bad, []);
  });
  test('không chữ nào hứa mở app Facebook trong src/', () => {
    const bad = walk(SRC)
      .filter((f) => /\.(astro|ts)$/.test(f))
      .filter((f) => /mở (ứng dụng|app) Facebook|open the Facebook app|open Facebook app/i.test(readFileSync(f, 'utf8')));
    assert.deepEqual(bad, []);
  });
});
