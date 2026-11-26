/**
 * Chữ của bảng hướng dẫn "Tải app" (install-sheet.ts), tiếng Việt + tiếng Anh, xưng "bạn".
 * Hàm thuần, chạy được trong Node để test (không chạm window/document). Chỉ dùng cú pháp xóa-được.
 *
 * Trung thực: Apple KHÔNG cho trang web tự cài app lên iPhone/iPad, nên ở đó chỉ nói đúng các bước tự làm,
 * không hứa "bấm một lần là cài". Chỉ máy có sự kiện cài của trình duyệt (Android Chrome, máy tính Chrome/Edge) mới cài bằng một lần bấm,
 * và trường hợp đó không dùng bảng này (gọi thẳng hộp cài của trình duyệt).
 *
 * Trong `steps`, mã {share} {dots} {dotsv} {addhome} {install} được thay bằng biểu tượng vẽ SVG giống nút thật.
 */
import type { InstallPlatform } from './install';

export type Lang = 'vi' | 'en';
export type Glyph = 'share' | 'dots' | 'dotsv' | 'addhome' | 'install';

export interface SheetContent {
  title: string;
  lead: string;
  steps: string[];
  /** Dòng chú thích dưới các bước (không bắt buộc). */
  note: string;
  /** Có nút "Mở bằng Safari" / "Mở bằng Chrome" (trình duyệt trong app không cài được). */
  open: 'safari' | 'chrome' | null;
  /** Có nút "Sao chép link". */
  copy: boolean;
}

export const GLYPHS: readonly Glyph[] = ['share', 'dots', 'dotsv', 'addhome', 'install'];

interface Pair {
  vi: string;
  en: string;
}
interface Item {
  title?: Pair;
  lead: Pair;
  steps: { vi: string[]; en: string[] };
  note?: Pair;
  open?: 'safari' | 'chrome';
  copy?: boolean;
}

const TITLE_PHONE: Pair = { vi: 'Tải app ADS-Nolimit về điện thoại', en: 'Get the ADS-Nolimit app on your phone' };
const TITLE_PC: Pair = { vi: 'Tải app ADS-Nolimit về máy tính', en: 'Get the ADS-Nolimit app on your computer' };
const APPLE_LEAD: Pair = {
  vi: 'Apple không cho trang web tự cài app lên iPhone/iPad, nên bạn tự làm vài bước ngắn sau:',
  en: 'Apple does not let a website install an app on iPhone/iPad by itself, so please follow these short steps:',
};
const ADD_HOME_VI = 'Chọn “Thêm vào MH chính” {addhome}, rồi bấm Thêm.';
const ADD_HOME_EN = 'Choose “Add to Home Screen” {addhome}, then tap Add.';

const items: Record<InstallPlatform, Item> = {
  'ios-safari-26': {
    lead: APPLE_LEAD,
    steps: {
      vi: [
        'Bấm nút {dots} ở góc dưới bên phải thanh Safari.',
        'Chọn “Chia sẻ” {share}.',
        'Kéo xuống, chọn “Thêm vào MH chính” {addhome}.',
        'Bấm Thêm (giữ bật “Mở dưới dạng ứng dụng web”).',
      ],
      en: [
        'Tap the {dots} button at the bottom right of the Safari bar.',
        'Choose “Share” {share}.',
        'Scroll down and choose “Add to Home Screen” {addhome}.',
        'Tap Add (keep “Open as Web App” on).',
      ],
    },
  },
  'ios-safari': {
    lead: APPLE_LEAD,
    steps: {
      vi: ['Bấm nút Chia sẻ {share} ở thanh dưới của Safari.', 'Kéo danh sách lên, ' + ADD_HOME_VI.replace('Chọn', 'chọn')],
      en: ['Tap the Share button {share} on the bottom bar of Safari.', 'Scroll the list up, ' + ADD_HOME_EN.replace('Choose', 'choose')],
    },
  },
  'ios-chrome': {
    lead: APPLE_LEAD,
    steps: {
      vi: ['Bấm nút Chia sẻ {share} ở cuối thanh địa chỉ (phía trên cùng) của Chrome.', ADD_HOME_VI],
      en: ['Tap the Share button {share} at the end of the address bar (top of the screen) in Chrome.', ADD_HOME_EN],
    },
  },
  'ios-other': {
    lead: APPLE_LEAD,
    steps: {
      vi: ['Mở menu {dots} hoặc nút Chia sẻ {share} của trình duyệt này.', ADD_HOME_VI],
      en: ['Open this browser’s menu {dots} or its Share button {share}.', ADD_HOME_EN],
    },
    note: {
      vi: 'Nếu trình duyệt này không có mục “Thêm vào MH chính”, hãy sao chép link rồi mở bằng Safari.',
      en: 'If this browser has no “Add to Home Screen”, copy the link and open it in Safari.',
    },
    copy: true,
  },
  'ios-inapp': {
    lead: {
      vi: 'Bạn đang mở trang này trong app khác (Facebook, Zalo, Messenger…). Trình duyệt trong app không cài được. Hãy mở bằng Safari rồi làm tiếp:',
      en: 'You are viewing this page inside another app (Facebook, Zalo, Messenger…). Its built-in browser cannot install apps. Open it in Safari, then:',
    },
    steps: {
      vi: [
        'Bấm nút “Mở bằng Safari” bên dưới. Nếu không được: bấm {dots} ở góc trên bên phải → chọn “Mở trong trình duyệt ngoài” / “Mở bằng Safari”.',
        'Sau khi sang Safari: bấm {dots} ở góc dưới bên phải (iOS 26) hoặc Chia sẻ {share} ở thanh dưới (iOS cũ hơn), rồi chọn “Chia sẻ” {share}.',
        'Chọn “Thêm vào MH chính” {addhome}, rồi bấm Thêm.',
      ],
      en: [
        'Tap the “Open in Safari” button below. If it does not work: tap {dots} at the top right → choose “Open in external browser” / “Open in Safari”.',
        'Once in Safari: tap {dots} at the bottom right (iOS 26) or Share {share} on the bottom bar (older iOS), then choose “Share” {share}.',
        'Choose “Add to Home Screen” {addhome}, then tap Add.',
      ],
    },
    open: 'safari',
    copy: true,
  },
  'android-inapp': {
    lead: {
      vi: 'Bạn đang mở trang này trong app khác (Facebook, Zalo, Messenger…). Trình duyệt trong app không cài được. Hãy mở bằng Chrome rồi làm tiếp:',
      en: 'You are viewing this page inside another app (Facebook, Zalo, Messenger…). Its built-in browser cannot install apps. Open it in Chrome, then:',
    },
    steps: {
      vi: ['Bấm “Mở bằng Chrome” bên dưới (hoặc sao chép link rồi dán vào Chrome).', 'Trong Chrome, bấm Tải app một lần nữa, hoặc bấm {dotsv} rồi chọn “Thêm vào màn hình chính” / “Cài đặt ứng dụng”.'],
      en: ['Tap “Open in Chrome” below (or copy the link and paste it into Chrome).', 'In Chrome, tap Get app again, or tap {dotsv} and choose “Add to Home screen” / “Install app”.'],
    },
    open: 'chrome',
    copy: true,
  },
  android: {
    lead: {
      vi: 'Trình duyệt của bạn chưa đưa sẵn hộp cài. Bạn cài bằng menu, làm 2 bước:',
      en: 'Your browser has not offered its install box yet. You can install from its menu in 2 steps:',
    },
    steps: {
      vi: ['Bấm nút {dotsv} (hoặc ≡) của trình duyệt.', 'Chọn “Thêm vào màn hình chính” hoặc “Cài đặt ứng dụng”, rồi bấm Cài đặt / Thêm.'],
      en: ['Tap your browser’s {dotsv} (or ≡) button.', 'Choose “Add to Home screen” or “Install app”, then tap Install / Add.'],
    },
    note: {
      vi: 'Nếu bạn từng bấm Hủy hộp cài, trình duyệt có thể chưa mời lại ngay; menu ở trên luôn dùng được.',
      en: 'If you dismissed the install box earlier, the browser may not offer it again right away; the menu above always works.',
    },
    copy: true,
  },
  'desktop-safari': {
    title: TITLE_PC,
    lead: { vi: 'Trên Safari máy Mac, bạn cài bằng menu:', en: 'In Safari on a Mac, install from the menu:' },
    steps: {
      vi: ['Trên thanh menu phía trên, mở “Tệp” (File).', 'Chọn “Thêm vào Dock”, rồi bấm Thêm.'],
      en: ['In the menu bar at the top, open “File”.', 'Choose “Add to Dock”, then click Add.'],
    },
    note: { vi: 'Cần Safari 17 trở lên (macOS Sonoma trở lên).', en: 'Needs Safari 17 or later (macOS Sonoma or later).' },
  },
  'desktop-firefox': {
    title: TITLE_PC,
    lead: {
      vi: 'Firefox trên máy tính chưa hỗ trợ cài app web. Bạn mở trang này bằng Chrome hoặc Edge rồi cài ở đó.',
      en: 'Firefox on desktop does not support installing web apps. Open this page in Chrome or Edge and install there.',
    },
    steps: {
      vi: ['Sao chép link bên dưới.', 'Dán vào Chrome hoặc Edge, rồi bấm “Tải app” trên trang.'],
      en: ['Copy the link below.', 'Paste it into Chrome or Edge, then click “Get app” on the page.'],
    },
    copy: true,
  },
  desktop: {
    title: TITLE_PC,
    lead: {
      vi: 'Trình duyệt của bạn chưa đưa sẵn hộp cài. Bạn cài bằng thanh địa chỉ hoặc menu:',
      en: 'Your browser has not offered its install box yet. Install from the address bar or the menu:',
    },
    steps: {
      vi: [
        'Tìm biểu tượng cài {install} ở cuối thanh địa chỉ, bấm vào rồi chọn Cài đặt.',
        'Chrome / Cốc Cốc: bấm {dotsv} → “Truyền, lưu và chia sẻ” → “Cài đặt trang dưới dạng ứng dụng”. Edge: bấm ⋯ → “Ứng dụng” → “Cài đặt trang web này dưới dạng ứng dụng”.',
      ],
      en: [
        'Look for the install icon {install} at the end of the address bar, click it and choose Install.',
        'Chrome: click {dotsv} → “Cast, save and share” → “Install page as app”. Edge: click ⋯ → “Apps” → “Install this site as an app”.',
      ],
    },
    note: {
      vi: 'Dùng Chrome, Edge hoặc Cốc Cốc. Nếu không thấy biểu tượng, có thể bạn đã cài rồi.',
      en: 'Use Chrome, Edge or Cốc Cốc. If you do not see the icon, you may have installed it already.',
    },
  },
};

const UI = {
  vi: {
    got: 'Đã hiểu',
    copy: 'Sao chép link',
    copied: 'Đã sao chép link',
    copyFailed: 'Chưa sao chép được, bạn giữ vào thanh địa chỉ để chép nhé',
    openSafari: 'Mở bằng Safari',
    openChrome: 'Mở bằng Chrome',
    already: 'Đã cài rồi? Mở ADS-Nolimit từ màn hình chính.',
    installed: 'Đã cài. Bạn mở ADS-Nolimit từ màn hình chính.',
    close: 'Đóng',
    stepsLabel: 'Các bước',
  },
  en: {
    got: 'Got it',
    copy: 'Copy link',
    copied: 'Link copied',
    copyFailed: 'Could not copy; press and hold the address bar to copy it',
    openSafari: 'Open in Safari',
    openChrome: 'Open in Chrome',
    already: 'Already installed? Open ADS-Nolimit from your home screen.',
    installed: 'Installed. Open ADS-Nolimit from your home screen.',
    close: 'Close',
    stepsLabel: 'Steps',
  },
} as const;

export const sheetUi = (lang: Lang) => UI[lang];

export function sheetContent(platform: InstallPlatform, lang: Lang): SheetContent {
  const it = items[platform];
  const phone = !platform.startsWith('desktop');
  return {
    title: (it.title ?? (phone ? TITLE_PHONE : TITLE_PC))[lang],
    lead: it.lead[lang],
    steps: it.steps[lang],
    note: it.note?.[lang] ?? '',
    open: it.open ?? null,
    copy: it.copy === true,
  };
}

/** Chia một bước thành đoạn chữ và mã biểu tượng, vd "Bấm {share} ở…" → ['Bấm ', {glyph:'share'}, ' ở…']. */
export function splitStep(step: string): (string | { glyph: Glyph })[] {
  const out: (string | { glyph: Glyph })[] = [];
  let last = 0;
  for (const m of step.matchAll(/\{(\w+)\}/g)) {
    const g = m[1] as Glyph;
    if (!GLYPHS.includes(g)) continue;
    if (m.index! > last) out.push(step.slice(last, m.index));
    out.push({ glyph: g });
    last = m.index! + m[0].length;
  }
  if (last < step.length) out.push(step.slice(last));
  return out;
}

/** Địa chỉ mở bằng Safari (iOS 17+) / Chrome (Android) cho trình duyệt trong app; `path` gồm đường dẫn + ?query. */
export const SITE_HOST = 'www.ads-nolimit.agency';
/** `host`: tên miền đang mở (bản xem trước mở đúng bản xem trước); mặc định web thật. */
export const safariUrl = (path: string, host: string = SITE_HOST): string => `x-safari-https://${host}${path}`;
/** Máy không có Chrome: trình duyệt mặc định mở lại trang (S.browser_fallback_url). */
export const chromeUrl = (path: string, host: string = SITE_HOST): string =>
  `intent://${host}${path}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(`https://${host}${path}`)};end`;
