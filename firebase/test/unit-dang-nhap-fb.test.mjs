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
  FACEBOOK_FIRST_IN_APP,
  inAppBlockedMessage,
  linkDecision,
  armStallUnlock,
  POPUP_STALL_MS,
  RETURN_GRACE_MS,
  fbTestDecision,
  isPhoneUA,
  isSessionGone,
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
  test('trong app Facebook iOS/Android và Messenger → dòng nhắc Google; Facebook lên trên chỉ khi hằng FACEBOOK_FIRST_IN_APP bật (tạm TẮT)', () => {
    assert.equal(FACEBOOK_FIRST_IN_APP, false);
    for (const ua of [UA.fbIos, UA.messengerIos, UA.fbAndroid]) assert.deepEqual(layout(ua), { facebookFirst: FACEBOOK_FIRST_IN_APP, googleNote: true }, ua.slice(0, 60));
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

describe('trong trình duyệt của app: lỗi cửa sổ đăng nhập → hướng dẫn mở bằng Safari/Chrome (mục 1)', () => {
  const VI = 'Trình duyệt trong app này chặn cửa sổ đăng nhập. Bạn bấm ⋯ (góc trên) → Mở bằng trình duyệt (Safari/Chrome) rồi thử lại.';
  test('popup-blocked, operation-not-supported-in-this-environment, web-storage-unsupported, lỗi lạ → câu hướng dẫn (vi + en)', () => {
    for (const code of ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported', 'auth/something-new', 'internal-error']) {
      assert.equal(facebookErrorText(code, 'vi', '', true), VI, code);
      assert.match(facebookErrorText(code, 'en', '', true), /Open in browser \(Safari\/Chrome\)/, code);
    }
    assert.equal(inAppBlockedMessage('vi'), VI);
  });
  test('ngoài app giữ chữ cũ; lỗi khác (mạng, khóa, quá nhiều lần) trong app vẫn giữ chữ riêng; tự đóng cửa sổ vẫn im lặng', () => {
    assert.match(facebookErrorText('auth/popup-blocked', 'vi', '', false), /pop-up/);
    assert.match(facebookErrorText('auth/something-new', 'vi', '', false), /Chưa đăng nhập được bằng Facebook/);
    assert.match(facebookErrorText('auth/network-request-failed', 'vi', '', true), /kiểm tra mạng/);
    assert.match(facebookErrorText('auth/user-disabled', 'vi', '', true), /bị khóa/);
    assert.equal(facebookErrorText('auth/popup-closed-by-user', 'vi', '', true), '');
  });
});

describe('email trùng khi đang ở trong app: nhắc mở bằng Safari/Chrome để đăng nhập Google (mục 3)', () => {
  test('đăng nhập: thêm câu nhắc trong app, không thêm ngoài app', () => {
    assert.match(existsMessage('vi', 'a@b.vn', true), /Nếu trước đây bạn dùng Google, hãy mở trang bằng Safari\/Chrome để đăng nhập Google\.$/);
    assert.match(existsMessage('en', 'a@b.vn', true), /If you used Google before, open this page in Safari\/Chrome to sign in with Google\.$/);
    assert.doesNotMatch(existsMessage('vi', 'a@b.vn', false), /Safari/);
    assert.equal(facebookErrorText('account-exists-with-different-credential', 'vi', 'a@b.vn', true), existsMessage('vi', 'a@b.vn', true));
  });
  test('đăng ký: cũng có câu nhắc trong app', () => {
    assert.match(existsMessageSignUp('vi', 'a@b.vn', true), /hãy mở trang bằng Safari\/Chrome để đăng nhập Google\.$/);
    assert.match(existsMessageSignUp('en', '', true), /open this page in Safari\/Chrome to sign in with Google\.$/);
    assert.doesNotMatch(existsMessageSignUp('en', '', false), /open this page in Safari/);
  });
});

describe('user-mismatch ở ngữ cảnh Facebook (mục 8)', () => {
  test('chữ riêng vi + en', () => {
    assert.equal(facebookErrorText('auth/user-mismatch', 'vi'), 'Bạn đã chọn một tài khoản Facebook khác với tài khoản đang đăng nhập.');
    assert.match(facebookErrorText('user-mismatch', 'en'), /different Facebook account/);
  });
});

describe('nối Facebook đang chờ: quyết định theo email (mục 7)', () => {
  test('Facebook không báo email → không nối (skip), dù tài khoản kia có email', () => {
    assert.equal(linkDecision('', 'a@b.vn'), 'skip');
    assert.equal(linkDecision('', null), 'skip');
  });
  test('email khớp (không phân biệt hoa thường) → nối; khác nhau hoặc tài khoản không có email → mismatch', () => {
    assert.equal(linkDecision('Lan@Example.com', 'lan@example.com'), 'link');
    assert.equal(linkDecision('a@b.vn', 'c@d.vn'), 'mismatch');
    assert.equal(linkDecision('a@b.vn', null), 'mismatch');
    assert.equal(linkDecision('a@b.vn', ''), 'mismatch');
  });
});

describe('cửa sổ đăng nhập không trả kết quả: hẹn mở khóa nút (mục 1)', () => {
  /** Đồng hồ giả: chạy timer theo thời gian ảo; onReturn gọi tay. */
  const fake = () => {
    let now = 0;
    let next = 1;
    const timers = new Map();
    let returns = [];
    return {
      env: {
        setTimer: (fn, ms) => {
          const id = next++;
          timers.set(id, { at: now + ms, fn });
          return id;
        },
        clearTimer: (id) => timers.delete(id),
        onReturn: (fn) => {
          returns.push(fn);
          return () => (returns = returns.filter((f) => f !== fn));
        },
      },
      tick: (ms) => {
        now += ms;
        for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); }
      },
      back: () => returns.slice().forEach((f) => f()),
      pending: () => timers.size,
      listeners: () => returns.length,
    };
  };
  test('hằng số: 45 giây', () => assert.equal(POPUP_STALL_MS, 45000));
  test('hết 45 giây mà chưa có kết quả → mở khóa đúng một lần', () => {
    const f = fake();
    let n = 0;
    armStallUnlock(f.env, () => n++);
    f.tick(44999);
    assert.equal(n, 0);
    f.tick(1);
    assert.equal(n, 1);
    f.tick(100000);
    f.back();
    f.tick(RETURN_GRACE_MS);
    assert.equal(n, 1);
    assert.equal(f.listeners(), 0);
  });
  test('khách quay lại trang mà cửa sổ chưa xong → mở khóa sau thời gian chờ ngắn', () => {
    const f = fake();
    let n = 0;
    armStallUnlock(f.env, () => n++);
    f.tick(5000);
    f.back();
    f.tick(RETURN_GRACE_MS - 1);
    assert.equal(n, 0);
    f.tick(1);
    assert.equal(n, 1);
  });
  test('cửa sổ có kết quả (disarm) trước đó → không mở khóa, dọn sạch đồng hồ và lắng nghe', () => {
    const f = fake();
    let n = 0;
    const disarm = armStallUnlock(f.env, () => n++);
    f.back();
    disarm();
    f.tick(POPUP_STALL_MS * 2);
    assert.equal(n, 0);
    assert.equal(f.pending(), 0);
    assert.equal(f.listeners(), 0);
  });
  test('quay lại nhiều lần chỉ hẹn một lần', () => {
    const f = fake();
    let n = 0;
    armStallUnlock(f.env, () => n++);
    f.back();
    f.back();
    f.tick(RETURN_GRACE_MS);
    assert.equal(n, 1);
  });
});

describe('thêm email xong Firebase thu hồi phiên → đăng nhập lại (mục 2)', () => {
  test('nhận ra ba mã lỗi, có hoặc không có auth/', () => {
    for (const c of ['user-token-expired', 'auth/user-not-found', 'auth/user-disabled']) assert.equal(isSessionGone(c), true, c);
    for (const c of ['', 'network-request-failed', 'requires-recent-login']) assert.equal(isSessionGone(c), false, c);
  });
});

describe('chế độ thử PUBLIC_FB_LOGIN=test (mục 11)', () => {
  test('?fbtest=1 bật và ghi nhớ; ?fbtest=0 tắt và xóa; không có thì theo giá trị đã ghi', () => {
    assert.deepEqual(fbTestDecision('?fbtest=1', null), { enabled: true, write: '1' });
    assert.deepEqual(fbTestDecision('?next=%2Ftai-khoan%2F&fbtest=1', null), { enabled: true, write: '1' });
    assert.deepEqual(fbTestDecision('?fbtest=0', '1'), { enabled: false, write: 'remove' });
    assert.deepEqual(fbTestDecision('', '1'), { enabled: true, write: null });
    assert.deepEqual(fbTestDecision('', null), { enabled: false, write: null });
    assert.deepEqual(fbTestDecision('?fbtest=2', '1'), { enabled: true, write: null });
    assert.deepEqual(fbTestDecision('?xfbtest=1', null), { enabled: false, write: null });
  });
  test('cờ đọc ba giá trị off / test / on', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../src/config/auth-providers.ts'), 'utf8');
    assert.match(src, /PUBLIC_FB_LOGIN \?\? 'off'/);
    assert.match(src, /flag === 'on' \|\| flag === 'test'/);
    assert.match(src, /facebookTestOnly: boolean = flag === 'test'/);
  });
});

describe('display=popup chỉ trên máy tính (mục 9)', () => {
  test('điện thoại, iPad (cả chế độ Macintosh) → true; máy tính → false', () => {
    for (const ua of [UA.fbIos, UA.fbAndroid, UA.safariIos, UA.chromeAndroid, UA.zaloIos]) assert.equal(isPhoneUA(ua, 5), true, ua.slice(0, 50));
    assert.equal(isPhoneUA(UA.safariMac, 5), true); // iPad hiện UA Macintosh + cảm ứng
    assert.equal(isPhoneUA(UA.safariMac, 0), false);
    assert.equal(isPhoneUA(UA.chromeDesktop, 0), false);
  });
});
