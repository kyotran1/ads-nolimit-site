/**
 * SONG NGỮ VI ↔ EN — bảng đối chiếu đường dẫn DUY NHẤT của site.
 *
 * Tiếng Việt là bản chính, nằm ở gốc (/, /giai-phap-ai-agent/, …).
 * Tiếng Anh nằm dưới /en/. Mỗi dòng trong `routes` là MỘT trang ở hai ngôn ngữ.
 *
 * Bảng này được dùng cho:
 *   - nút chuyển ngôn ngữ "VI | EN" ở header (desktop + menu mobile),
 *   - thẻ <link rel="alternate" hreflang="vi|en|x-default"> trên mọi trang,
 *   - sitemap.xml (kèm liên kết bản ngôn ngữ còn lại),
 *   - hàm `localize()` đổi link tiếng Việt sang link tiếng Anh tương ứng.
 *
 * Thêm trang mới: tạo trang ở cả hai ngôn ngữ rồi thêm một dòng vào `routes`.
 * Thêm bài blog mới có bản tiếng Anh: thêm một dòng cho bài đó.
 * Bài blog chưa có bản dịch: nút EN dẫn về /en/blog/.
 */

export type Lang = 'vi' | 'en';
export const langs: readonly Lang[] = ['vi', 'en'];
export const defaultLang: Lang = 'vi';

export interface RoutePair {
  vi: string;
  en: string;
}

export const routes: readonly RoutePair[] = [
  { vi: '/', en: '/en/' },
  { vi: '/giai-phap-ai-agent/', en: '/en/ai-agent/' },
  { vi: '/tu-dong-hoa/', en: '/en/automation/' },
  { vi: '/quang-cao/', en: '/en/advertising/' },
  { vi: '/thiet-ke-website/', en: '/en/web-design/' },
  { vi: '/phan-mem/', en: '/en/software/' },
  { vi: '/bang-gia/', en: '/en/pricing/' },
  { vi: '/du-an/', en: '/en/projects/' },
  { vi: '/blog/', en: '/en/blog/' },
  { vi: '/blog/ai-agent-la-gi/', en: '/en/blog/what-is-an-ai-agent/' },
  {
    vi: '/blog/luat-tri-tue-nhan-tao-va-bao-ve-du-lieu-ca-nhan-2026/',
    en: '/en/blog/vietnam-ai-law-and-personal-data-law-2026/',
  },
  { vi: '/ve-chung-toi/', en: '/en/about/' },
  { vi: '/lien-he/', en: '/en/contact/' },
  { vi: '/chinh-sach-bao-mat/', en: '/en/privacy/' },
  { vi: '/dieu-khoan/', en: '/en/terms/' },
  { vi: '/xoa-du-lieu/', en: '/en/data-deletion/' },
  // Tài khoản khách hàng (Firebase Authentication)
  { vi: '/dang-nhap/', en: '/en/sign-in/' },
  { vi: '/dang-ky/', en: '/en/sign-up/' },
  { vi: '/quen-mat-khau/', en: '/en/forgot-password/' },
  { vi: '/tai-khoan/', en: '/en/account/' },
];

/**
 * Trang có thật nhưng KHÔNG đưa vào sitemap.xml (và tự gắn noindex trong view của trang):
 * trang quên mật khẩu, trang tài khoản riêng của khách và trang quản trị.
 */
export const unlistedPaths: readonly string[] = [
  '/quen-mat-khau/',
  '/en/forgot-password/',
  '/offline/',
  '/tai-khoan/',
  '/en/account/',
  // Trang quản trị của chủ (chỉ tiếng Việt, noindex)
  '/quan-tri/',
];

/** Trang chủ của từng ngôn ngữ. */
export const homeOf: Record<Lang, string> = { vi: '/', en: '/en/' };

/** Chuẩn hóa đường dẫn: bỏ index.html, luôn có "/" ở cuối. */
export const normalizePath = (path: string): string => {
  let p = path.replace(/index\.html$/, '');
  if (!p.endsWith('/')) p += '/';
  return p;
};

/** Ngôn ngữ của một đường dẫn. */
export const langFromPath = (path: string): Lang => (/^\/en(\/|$)/.test(path) ? 'en' : 'vi');

/** Cặp VI/EN của một trang, hoặc undefined nếu trang không có trong bảng. */
export const pairFor = (path: string): RoutePair | undefined => {
  const p = normalizePath(path);
  return routes.find((r) => r.vi === p || r.en === p);
};

/**
 * Đường dẫn của cùng trang ở ngôn ngữ `target`.
 * Trang không có trong bảng (ví dụ 404) → trang chủ ngôn ngữ đích;
 * bài blog chưa có bản dịch → trang blog ngôn ngữ đích.
 */
export const counterpart = (path: string, target: Lang): string => {
  const pair = pairFor(path);
  if (pair) return pair[target];
  if (/^(\/en)?\/blog\//.test(normalizePath(path))) return target === 'en' ? '/en/blog/' : '/blog/';
  return homeOf[target];
};

/**
 * Đổi một link nội bộ viết theo đường dẫn TIẾNG VIỆT sang ngôn ngữ `lang`.
 * Giữ nguyên phần #neo. Báo lỗi khi build nếu link chưa có trong `routes`
 * (để không bao giờ có link tiếng Anh trỏ vào trang không tồn tại).
 */
export const localize = (viHref: string, lang: Lang): string => {
  if (lang === 'vi') return viHref;
  const [path, hash] = viHref.split('#');
  const pair = routes.find((r) => r.vi === normalizePath(path));
  if (!pair) throw new Error(`i18n: chưa có bản tiếng Anh cho "${viHref}" trong src/config/i18n.ts`);
  return hash ? `${pair.en}#${hash}` : pair.en;
};

/** Chữ giao diện dùng chung (header, footer, nút, nhãn). */
export const ui = {
  vi: {
    skip: 'Bỏ qua, tới nội dung chính',
    home: 'về trang chủ',
    mainNav: 'Điều hướng chính',
    mobileNav: 'Điều hướng trên điện thoại',
    solutions: 'Giải pháp',
    company: 'ADS-Nolimit',
    menu: 'Menu',
    openMenu: 'Mở menu',
    themeToLight: 'Chuyển sang giao diện sáng',
    themeToDark: 'Chuyển sang giao diện tối',
    contact: 'Liên hệ',
    privacy: 'Chính sách bảo mật',
    terms: 'Điều khoản nạp tiền & số dư',
    headerCta: 'Tư vấn miễn phí',
    signIn: 'Đăng nhập',
    signUp: 'Tạo tài khoản',
    account: 'Tài khoản',
    getApp: 'Tải app',
    getAppMenu: 'Tải app về điện thoại',
    getAppFooter: 'Tải app ADS-Nolimit',
    language: 'Ngôn ngữ',
    langName: { vi: 'Tiếng Việt', en: 'English' },
    quickContact: 'Liên hệ nhanh',
    call: 'Gọi',
    details: 'Xem chi tiết',
    zaloCta: 'Tư vấn miễn phí qua Zalo',
    newTab: ' (mở trong tab mới)',
    footerAbout: 'Quảng cáo & AI Agent cho doanh nghiệp. Làm quảng cáo từ 2016, đã phục vụ hơn 800 khách hàng.',
    footerAiNote: 'Hình minh họa trên site được vẽ bằng SVG/CSS, có sử dụng AI.',
    contactLabels: {
      hotline: 'Hotline',
      phone: 'Điện thoại & Zalo',
      assistant: 'Trợ lý',
      telegram: 'Telegram',
      email: 'Email',
      fanpage: 'Fanpage',
      messenger: 'Messenger',
      zalo: 'Zalo',
    },
  },
  en: {
    skip: 'Skip to main content',
    home: 'home',
    mainNav: 'Main navigation',
    mobileNav: 'Mobile navigation',
    solutions: 'Solutions',
    company: 'ADS-Nolimit',
    menu: 'Menu',
    openMenu: 'Open menu',
    themeToLight: 'Switch to light theme',
    themeToDark: 'Switch to dark theme',
    contact: 'Contact',
    privacy: 'Privacy policy',
    terms: 'Balance top-up terms',
    headerCta: 'Free consultation',
    signIn: 'Sign in',
    signUp: 'Create account',
    account: 'Account',
    getApp: 'Get app',
    getAppMenu: 'Get the app on your phone',
    getAppFooter: 'Get the ADS-Nolimit app',
    language: 'Language',
    langName: { vi: 'Tiếng Việt', en: 'English' },
    quickContact: 'Quick contact',
    call: 'Call',
    details: 'Learn more',
    zaloCta: 'Free consultation on Zalo',
    newTab: ' (opens in a new tab)',
    footerAbout: 'Advertising and AI agents for businesses. Running ads since 2016, for more than 800 clients.',
    footerAiNote: 'Illustrations on this site are drawn in SVG/CSS with the help of AI.',
    contactLabels: {
      hotline: 'Hotline',
      phone: 'Phone & Zalo',
      assistant: 'Assistant',
      telegram: 'Telegram',
      email: 'Email',
      fanpage: 'Facebook page',
      messenger: 'Messenger',
      zalo: 'Zalo',
    },
  },
} as const;

export const t = (lang: Lang) => ui[lang];
