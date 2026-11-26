/**
 * Đăng nhập bằng Facebook: phần THUẦN (không chạm window/document/Firebase) để chạy được trong Node và test.
 * Gồm: bảng dịch lỗi → chữ (vi/en), quyết định thứ tự nút + dòng nhắc theo nền tảng, nhãn "Đăng nhập bằng" theo providerData.
 * Phần chạm Firebase nằm ở facebook-flow.ts. Chỉ dùng cú pháp xóa-được (không enum, không alias import).
 *
 * Trung thực: trang web KHÔNG mở được app Facebook, nên không có chữ nào hứa điều đó.
 */
import type { InstallPlatform } from '../pwa/install';

export type Lang = 'vi' | 'en';
type Text = Record<Lang, string>;

/* ---------- Lỗi → chữ ---------- */

/** Mã lỗi (đã bỏ "auth/") mà đăng nhập Facebook im lặng bỏ qua: khách tự đóng cửa sổ. */
export const SILENT_CODES: readonly string[] = ['popup-closed-by-user', 'cancelled-popup-request', 'user-cancelled'];

const errors: Record<string, Text> = {
  'popup-blocked': {
    vi: 'Trình duyệt đã chặn cửa sổ đăng nhập Facebook. Bạn cho phép cửa sổ bật lên (pop-up) cho trang này rồi bấm lại, hoặc dùng Google hoặc email.',
    en: 'Your browser blocked the Facebook sign-in window. Allow pop-ups for this site and click again, or use Google or your email.',
  },
  'operation-not-allowed': {
    vi: 'Đăng nhập bằng Facebook đang được chuẩn bị. Bạn dùng Google hoặc email tạm thời nhé.',
    en: 'Sign-in with Facebook is not ready yet. Please use Google or your email for now.',
  },
  'web-storage-unsupported': {
    vi: 'Trình duyệt đang chặn lưu dữ liệu đăng nhập (có thể do chế độ riêng tư). Bạn mở bằng trình duyệt thường rồi thử lại.',
    en: 'Your browser is blocking sign-in storage (perhaps private mode). Open the page in a normal window and try again.',
  },
  'network-request-failed': {
    vi: 'Không kết nối được tới Facebook. Bạn kiểm tra mạng rồi thử lại, hoặc dùng Google hoặc email.',
    en: 'Could not reach Facebook. Check your connection and try again, or use Google or your email.',
  },
  'unauthorized-domain': {
    vi: 'Trang này chưa được phép đăng nhập bằng Facebook. Bạn dùng Google hoặc email, hoặc liên hệ ADS-Nolimit.',
    en: 'Facebook sign-in is not enabled for this address. Use Google or your email, or contact ADS-Nolimit.',
  },
  'credential-already-in-use': {
    vi: 'Tài khoản Facebook này đã gắn với một tài khoản ADS-Nolimit khác. Bạn đăng nhập tài khoản đó bằng Facebook.',
    en: 'This Facebook account is already linked to another ADS-Nolimit account. Sign in to that account with Facebook.',
  },
  'user-disabled': {
    vi: 'Tài khoản này đã bị khóa. Vui lòng liên hệ ADS-Nolimit để được hỗ trợ.',
    en: 'This account has been disabled. Please contact ADS-Nolimit for help.',
  },
  'too-many-requests': {
    vi: 'Có quá nhiều lần thử. Vui lòng đợi vài phút rồi thử lại.',
    en: 'Too many attempts. Please wait a few minutes and try again.',
  },
  'user-mismatch': {
    vi: 'Bạn đã chọn một tài khoản Facebook khác với tài khoản đang đăng nhập.',
    en: 'You chose a different Facebook account from the one you are signed in with.',
  },
  generic: {
    vi: 'Chưa đăng nhập được bằng Facebook. Bạn thử lại sau ít phút, hoặc dùng Google hoặc email; nếu vẫn lỗi, nhắn ADS-Nolimit để được hỗ trợ.',
    en: 'Could not sign in with Facebook. Please try again in a few minutes, or use Google or your email; contact ADS-Nolimit if it keeps happening.',
  },
};

const googleInAppHint: Text = {
  vi: 'Nếu trước đây bạn dùng Google, hãy mở trang bằng Safari/Chrome để đăng nhập Google.',
  en: 'If you used Google before, open this page in Safari/Chrome to sign in with Google.',
};

/** Email trùng với tài khoản đã có (đăng nhập cách cũ rồi hệ thống tự nối Facebook vào). `email` rỗng = Facebook không báo email. `inApp`: đang trong trình duyệt của app (Google bị chặn) thì nhắc mở bằng Safari/Chrome. */
export const existsMessage = (lang: Lang, email: string, inApp = false): string => {
  const base = existsMessageBase(lang, email);
  return inApp ? `${base} ${googleInAppHint[lang]}` : base;
};

const existsMessageBase = (lang: Lang, email: string): string => {
  if (email)
    return lang === 'en'
      ? `The email ${email} already has an ADS-Nolimit account. Sign in below the way you did before (Google, or email and password) and we will link Facebook to that account automatically.`
      : `Email ${email} đã có tài khoản ADS-Nolimit. Bạn đăng nhập bằng cách cũ (Google hoặc email & mật khẩu) ngay bên dưới, chúng tôi sẽ tự nối Facebook vào tài khoản đó.`;
  return lang === 'en'
    ? 'This email already has an ADS-Nolimit account. Sign in below the way you did before (Google, or email and password) and we will link Facebook to that account automatically.'
    : 'Email này đã có tài khoản ADS-Nolimit. Bạn đăng nhập bằng cách cũ (Google hoặc email & mật khẩu) ngay bên dưới, chúng tôi sẽ tự nối Facebook vào tài khoản đó.';
};

/** Như existsMessage nhưng cho trang Tạo tài khoản, nơi khung email & mật khẩu ở trên là để TẠO tài khoản mới (không nối được). */
export const existsMessageSignUp = (lang: Lang, email: string, inApp = false): string => {
  const base = existsSignUpBase(lang, email);
  return inApp ? `${base} ${googleInAppHint[lang]}` : base;
};

const existsSignUpBase = (lang: Lang, email: string): string => {
  const who = email ? (lang === 'en' ? `The email ${email}` : `Email ${email}`) : lang === 'en' ? 'This email' : 'Email này';
  return lang === 'en'
    ? `${who} already has an ADS-Nolimit account. If you used Google before, press “Sign up with Google” above and we will link Facebook for you. If you used email and password, sign in on the Sign in page, then link Facebook in Account → Security.`
    : `${who} đã có tài khoản ADS-Nolimit. Nếu trước đây bạn dùng Google, bấm “Đăng ký với Google” ở trên, chúng tôi sẽ tự nối Facebook. Nếu bạn dùng email & mật khẩu, hãy đăng nhập ở trang Đăng nhập rồi nối Facebook trong Tài khoản → Bảo mật.`;
};

/** Trong trình duyệt của app (Facebook/Messenger/Zalo/Instagram…): cửa sổ đăng nhập thường bị chặn hoặc không trả kết quả. */
const inAppBlocked: Text = {
  vi: 'Trình duyệt trong app này chặn cửa sổ đăng nhập. Bạn bấm ⋯ (góc trên) → Mở bằng trình duyệt (Safari/Chrome) rồi thử lại.',
  en: 'The browser inside this app blocks the sign-in window. Tap ⋯ (top corner) → Open in browser (Safari/Chrome) and try again.',
};
export const inAppBlockedMessage = (lang: Lang): string => inAppBlocked[lang];

/** Mã lỗi mà khi đang ở trong app thì nguyên nhân gần như chắc chắn là trình duyệt của app (lỗi lạ khác cũng tính). */
const IN_APP_BLOCK_CODES: readonly string[] = ['popup-blocked', 'operation-not-supported-in-this-environment', 'web-storage-unsupported'];

/** Mã lỗi Firebase tương đương → mã trong bảng. */
const aliases: Record<string, string> = {
  timeout: 'network-request-failed',
  'admin-restricted-operation': 'operation-not-allowed',
};

/**
 * Chữ báo lỗi cho một mã lỗi Firebase (có hoặc không có "auth/") khi đăng nhập/nối Facebook.
 * Trả '' khi lỗi cần im lặng (khách tự đóng cửa sổ). Lỗi trùng email dùng `existsMessage` (cần email), ở đây trả chữ chung.
 */
export const facebookErrorText = (rawCode: string, lang: Lang, email = '', inApp = false): string => {
  const raw = rawCode.replace(/^auth\//, '');
  if (SILENT_CODES.includes(raw)) return '';
  if (raw === 'account-exists-with-different-credential') return existsMessage(lang, email, inApp);
  const code = aliases[raw] ?? raw;
  if (inApp && (IN_APP_BLOCK_CODES.includes(code) || !errors[code])) return inAppBlocked[lang];
  return (errors[code] ?? errors.generic)[lang];
};

/** Mọi mã lỗi có chữ riêng (để test kiểm đủ vi + en). */
export const facebookErrorCodes = (): string[] => Object.keys(errors);

/* ---------- Nền tảng → thứ tự nút ---------- */

/** Loại trình duyệt nhúng trong app: 'facebook' = Facebook/Messenger; 'zalo'; 'other' = Instagram, Line, TikTok…; null = không phải trình duyệt trong app. */
export type InAppKind = 'facebook' | 'zalo' | 'other' | null;

export const inAppKind = (ua: string): InAppKind => {
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A|Messenger/i.test(ua)) return 'facebook';
  if (/Zalo/i.test(ua)) return 'zalo';
  if (/Instagram|Line\/|musical_ly|BytedanceWebview/i.test(ua)) return 'other';
  return null;
};

/**
 * TẠM THỜI false: trong app Facebook/Messenger vẫn để Google ở vị trí cũ, Facebook ngay dưới (chưa đưa Facebook lên đầu)
 * cho tới khi thử trên máy thật. Muốn đưa Facebook lên đầu trong app Facebook: đổi hằng này thành true (chỉ sửa ở đây).
 */
export const FACEBOOK_FIRST_IN_APP = false;

export interface SignInLayout {
  /** Nút Facebook đặt trên nút Google. */
  facebookFirst: boolean;
  /** Hiện dòng nhỏ dưới nút Google: Google không cho đăng nhập trong app này. */
  googleNote: boolean;
}

/**
 * Thứ tự nút ở trang Đăng nhập/Đăng ký theo nền tảng (kết quả của `installPlatform(ua, touch)` + UA).
 * Google CHẶN đăng nhập trong trình duyệt nhúng của app (lỗi disallowed_useragent):
 *  - trong app Facebook/Messenger: dòng nhắc dưới nút Google; Facebook lên trên chỉ khi FACEBOOK_FIRST_IN_APP = true;
 *  - trong Zalo (và app khác): giữ thứ tự, vẫn có dòng nhắc.
 */
export const signInLayout = (platform: InstallPlatform, ua: string): SignInLayout => {
  const inApp = platform === 'ios-inapp' || platform === 'android-inapp';
  const kind = inAppKind(ua);
  if (!inApp && kind === null) return { facebookFirst: false, googleNote: false };
  return { facebookFirst: FACEBOOK_FIRST_IN_APP && kind === 'facebook', googleNote: true };
};

const googleNoteText: Text = {
  vi: 'Google không cho đăng nhập trong app này. Bạn dùng Facebook, email, hoặc mở trang bằng Safari/Chrome.',
  en: 'Google does not allow sign-in inside this app. Use Facebook, email, or open this page in Safari/Chrome.',
};
export const googleNoteMessage = (lang: Lang): string => googleNoteText[lang];

/* ---------- Cách đăng nhập hiện ở Bảo mật ---------- */

const providerNames: Record<string, Text> = {
  'google.com': { vi: 'Google', en: 'Google' },
  'facebook.com': { vi: 'Facebook', en: 'Facebook' },
  password: { vi: 'Email & mật khẩu', en: 'Email & password' },
};

/** Nhãn các cách đăng nhập theo providerData (giữ thứ tự Firebase trả về, bỏ trùng). Mã lạ hiện nguyên mã. */
export const providerLabels = (providerData: readonly { providerId: string }[], lang: Lang): string[] => {
  const out: string[] = [];
  for (const p of providerData) {
    const label = providerNames[p.providerId]?.[lang] ?? p.providerId;
    if (!out.includes(label)) out.push(label);
  }
  return out;
};

export const hasProvider = (providerData: readonly { providerId: string }[], providerId: string): boolean =>
  providerData.some((p) => p.providerId === providerId);

/** Được bỏ nối một cách đăng nhập chỉ khi còn ít nhất một cách khác. */
export const canUnlink = (providerData: readonly { providerId: string }[], providerId: string): boolean =>
  hasProvider(providerData, providerId) && providerData.some((p) => p.providerId !== providerId);

/** Cách đăng nhập khách DÙNG ĐƯỢC để xác nhận lại danh tính (không phải mật khẩu): Facebook hoặc Google theo cách họ có. */
export const reauthProvider = (providerData: readonly { providerId: string }[]): 'google' | 'facebook' => {
  if (hasProvider(providerData, 'google.com')) return 'google';
  if (hasProvider(providerData, 'facebook.com')) return 'facebook';
  return 'google';
};

/** Khối "Thêm email / xác minh email" của khách Facebook: không email → 'add'; có email chưa xác minh (và có nối Facebook) → 'verify'; còn lại ẩn. */
export const emailGapMode = (user: { email: string | null; emailVerified: boolean; providerData: readonly { providerId: string }[] }): 'add' | 'verify' | 'none' => {
  if (!user.email) return 'add';
  if (!user.emailVerified && hasProvider(user.providerData, 'facebook.com')) return 'verify';
  return 'none';
};

/* ---------- Nối Facebook đang chờ vào tài khoản đăng nhập sau ---------- */

/**
 * Có nên nối chứng nhận Facebook đang chờ vào tài khoản vừa đăng nhập không?
 *  - 'skip': Facebook không báo email → không có cơ sở để biết là cùng một người: KHÔNG nối, đi tiếp như thường;
 *  - 'link': hai email khớp (không phân biệt hoa thường);
 *  - 'mismatch': email khác nhau (hoặc tài khoản đăng nhập không có email): không nối, báo nhẹ cho khách.
 */
export const linkDecision = (waitEmail: string, userEmail: string | null | undefined): 'link' | 'skip' | 'mismatch' => {
  if (!waitEmail) return 'skip';
  if (userEmail && waitEmail.toLowerCase() === userEmail.toLowerCase()) return 'link';
  return 'mismatch';
};

/* ---------- Cửa sổ đăng nhập không bao giờ trả kết quả (trình duyệt trong app) ---------- */

/** Sau chừng này mili giây mà cửa sổ chưa trả kết quả thì mở khóa nút (không hủy cửa sổ thật). */
export const POPUP_STALL_MS = 45000;

/** Sau khi khách quay lại trang, đợi chừng này rồi mới mở khóa (cửa sổ vừa đóng thường trả kết quả ngay sau đó; tránh báo nhầm). */
export const RETURN_GRACE_MS = 2000;

export interface StallEnv {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** Đăng ký hàm gọi khi khách quay lại trang (window 'focus' hoặc visibilitychange sang hiện); trả hàm hủy đăng ký. */
  onReturn: (fn: () => void) => () => void;
}

/**
 * Hẹn mở khóa giao diện khi cửa sổ đăng nhập (popup) có thể không bao giờ trả kết quả:
 * hết POPUP_STALL_MS, hoặc khách quay lại trang và RETURN_GRACE_MS sau đó cửa sổ vẫn chưa xong. `unlock` chỉ chạy tối đa một lần.
 * Trả hàm `disarm` (gọi khi cửa sổ đã có kết quả) để hủy hẹn.
 */
export const armStallUnlock = (env: StallEnv, unlock: () => void): (() => void) => {
  let done = false;
  let off: () => void = () => {};
  let timer: unknown = null;
  let grace: unknown = null;
  const disarm = () => {
    done = true;
    off();
    if (timer !== null) env.clearTimer(timer);
    if (grace !== null) env.clearTimer(grace);
  };
  const fire = () => {
    if (done) return;
    disarm();
    unlock();
  };
  timer = env.setTimer(fire, POPUP_STALL_MS);
  off = env.onReturn(() => {
    if (!done && grace === null) grace = env.setTimer(fire, RETURN_GRACE_MS);
  });
  return disarm;
};

/* ---------- Chế độ thử (PUBLIC_FB_LOGIN=test) ---------- */

/** Khóa localStorage bật chế độ thử Facebook trên trình duyệt này. */
export const FB_TEST_KEY = 'adsnl-fbtest';

/**
 * Quyết định hiện Facebook ở chế độ thử: ?fbtest=1 bật (và ghi nhớ), ?fbtest=0 tắt (và xóa), không có thì theo giá trị đã ghi.
 * `write`: '1' = ghi, 'remove' = xóa, null = không đổi.
 */
export const fbTestDecision = (search: string, stored: string | null): { enabled: boolean; write: '1' | 'remove' | null } => {
  const param = /(?:^|[?&])fbtest=([^&]*)/.exec(search)?.[1];
  if (param === '1') return { enabled: true, write: '1' };
  if (param === '0') return { enabled: false, write: 'remove' };
  return { enabled: stored === '1', write: null };
};

/* ---------- Loại máy ---------- */

/** Điện thoại/máy tính bảng (kể cả iPad hiện là Macintosh nhưng có cảm ứng nhiều điểm). Dùng để chỉ đặt display=popup trên máy tính. */
export const isPhoneUA = (ua: string, touchPoints = 0): boolean =>
  /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);

/* ---------- Thêm email xong thì Firebase thu hồi phiên ---------- */

/** Mã lỗi khi đọc lại tài khoản sau verifyBeforeUpdateEmail mà phiên đã bị thu hồi (email đổi) → cho khách đăng nhập lại. */
export const SESSION_GONE_CODES: readonly string[] = ['user-token-expired', 'user-not-found', 'user-disabled'];
export const isSessionGone = (rawCode: string): boolean => SESSION_GONE_CODES.includes(rawCode.replace(/^auth\//, ''));

/** Khóa sessionStorage: trang Đăng nhập thấy khóa này thì hiện câu "Email đã được thêm… đăng nhập lại bằng Facebook". */
export const EMAIL_ADDED_KEY = 'adsnl-email-added';
