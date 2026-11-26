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
  generic: {
    vi: 'Chưa đăng nhập được bằng Facebook. Bạn thử lại sau ít phút, hoặc dùng Google hoặc email; nếu vẫn lỗi, nhắn ADS-Nolimit để được hỗ trợ.',
    en: 'Could not sign in with Facebook. Please try again in a few minutes, or use Google or your email; contact ADS-Nolimit if it keeps happening.',
  },
};

/** Email trùng với tài khoản đã có (đăng nhập cách cũ rồi hệ thống tự nối Facebook vào). `email` rỗng = Facebook không báo email. */
export const existsMessage = (lang: Lang, email: string): string => {
  if (email)
    return lang === 'en'
      ? `The email ${email} already has an ADS-Nolimit account. Sign in below the way you did before (Google, or email and password) and we will link Facebook to that account automatically.`
      : `Email ${email} đã có tài khoản ADS-Nolimit. Bạn đăng nhập bằng cách cũ (Google hoặc email & mật khẩu) ngay bên dưới, chúng tôi sẽ tự nối Facebook vào tài khoản đó.`;
  return lang === 'en'
    ? 'This email already has an ADS-Nolimit account. Sign in below the way you did before (Google, or email and password) and we will link Facebook to that account automatically.'
    : 'Email này đã có tài khoản ADS-Nolimit. Bạn đăng nhập bằng cách cũ (Google hoặc email & mật khẩu) ngay bên dưới, chúng tôi sẽ tự nối Facebook vào tài khoản đó.';
};

/** Như existsMessage nhưng cho trang Tạo tài khoản, nơi khung email & mật khẩu ở trên là để TẠO tài khoản mới (không nối được). */
export const existsMessageSignUp = (lang: Lang, email: string): string => {
  const who = email ? (lang === 'en' ? `The email ${email}` : `Email ${email}`) : lang === 'en' ? 'This email' : 'Email này';
  return lang === 'en'
    ? `${who} already has an ADS-Nolimit account. If you used Google before, press “Sign up with Google” above and we will link Facebook for you. If you used email and password, sign in on the Sign in page, then link Facebook in Account → Security.`
    : `${who} đã có tài khoản ADS-Nolimit. Nếu trước đây bạn dùng Google, bấm “Đăng ký với Google” ở trên, chúng tôi sẽ tự nối Facebook. Nếu bạn dùng email & mật khẩu, hãy đăng nhập ở trang Đăng nhập rồi nối Facebook trong Tài khoản → Bảo mật.`;
};

/** Mã lỗi Firebase tương đương → mã trong bảng. */
const aliases: Record<string, string> = {
  timeout: 'network-request-failed',
  'admin-restricted-operation': 'operation-not-allowed',
};

/**
 * Chữ báo lỗi cho một mã lỗi Firebase (có hoặc không có "auth/") khi đăng nhập/nối Facebook.
 * Trả '' khi lỗi cần im lặng (khách tự đóng cửa sổ). Lỗi trùng email dùng `existsMessage` (cần email), ở đây trả chữ chung.
 */
export const facebookErrorText = (rawCode: string, lang: Lang, email = ''): string => {
  const raw = rawCode.replace(/^auth\//, '');
  if (SILENT_CODES.includes(raw)) return '';
  if (raw === 'account-exists-with-different-credential') return existsMessage(lang, email);
  const code = aliases[raw] ?? raw;
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

export interface SignInLayout {
  /** Nút Facebook đặt trên nút Google. */
  facebookFirst: boolean;
  /** Hiện dòng nhỏ dưới nút Google: Google không cho đăng nhập trong app này. */
  googleNote: boolean;
}

/**
 * Thứ tự nút ở trang Đăng nhập/Đăng ký theo nền tảng (kết quả của `installPlatform(ua, touch)` + UA).
 * Google CHẶN đăng nhập trong trình duyệt nhúng của app (lỗi disallowed_useragent):
 *  - trong app Facebook/Messenger: Facebook lên trên + dòng nhắc dưới nút Google;
 *  - trong Zalo (và app khác): giữ thứ tự, vẫn có dòng nhắc.
 */
export const signInLayout = (platform: InstallPlatform, ua: string): SignInLayout => {
  const inApp = platform === 'ios-inapp' || platform === 'android-inapp';
  const kind = inAppKind(ua);
  if (!inApp && kind === null) return { facebookFirst: false, googleNote: false };
  return { facebookFirst: kind === 'facebook', googleNote: true };
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
