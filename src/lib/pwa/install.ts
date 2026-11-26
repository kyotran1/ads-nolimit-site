/**
 * Lời mời cài ứng dụng (PWA). Hàm thuần (installMode, isIosSafari) chạy được trong Node để test;
 * phần trình duyệt (đọc/ghi hoãn, bắt sự kiện cài) chỉ chạm window/localStorage BÊN TRONG hàm.
 * Chỉ dùng cú pháp xóa-được (không enum, không alias import) để chạy với `node --experimental-strip-types`.
 */

export type InstallMode = 'hidden' | 'prompt' | 'ios' | 'manual';

export interface InstallEnv {
  /** Đang chạy ở chế độ ứng dụng (đã cài). */
  standalone: boolean;
  /** Vừa cài xong trong phiên này (sự kiện appinstalled hoặc khách chấp nhận hộp cài). */
  installed: boolean;
  /** Trình duyệt đã đưa sự kiện beforeinstallprompt (gọi được .prompt()). */
  canPrompt: boolean;
  iosSafari: boolean;
  /** Mốc (ms) đến khi khách "Để sau"; 0 = chưa hoãn. */
  snoozedUntil: number;
  now: number;
}

export const SNOOZE_MS = 30 * 24 * 3600 * 1000;
export const SNOOZE_KEY = 'adsnl-pwa-snooze';

/** Chọn dạng hiển thị: thẻ ở Tổng quan ('card', tôn trọng "Để sau") hay khối cố định ở Hồ sơ ('profile'). Chưa cài thì luôn có nút. */
export function installMode(env: InstallEnv, where: 'card' | 'profile'): InstallMode {
  if (env.standalone || env.installed) return 'hidden';
  if (where === 'card' && env.snoozedUntil > env.now) return 'hidden';
  if (env.canPrompt) return 'prompt';
  if (env.iosSafari) return 'ios';
  // Không có sự kiện cài: vẫn có nút "Tải app", bấm thì mở bảng hướng dẫn theo nền tảng (install-sheet.ts).
  return 'manual';
}

/** Nền tảng của khách, để chọn đúng cách hướng dẫn cài (bảng hướng dẫn ở install-sheet.ts). */
export type InstallPlatform =
  | 'ios-safari'
  | 'ios-safari-26'
  | 'ios-chrome'
  | 'ios-other'
  | 'ios-inapp'
  | 'android-inapp'
  | 'android'
  | 'desktop-safari'
  | 'desktop-firefox'
  | 'desktop';

/** Trình duyệt nhúng trong app mạng xã hội / chat: không cài được, phải mở bằng trình duyệt thật. */
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Zalo|Line\/|musical_ly|BytedanceWebview/;

/** Phân loại nền tảng từ chuỗi User-Agent (+ số điểm chạm, để nhận iPad đòi trang máy tính). Hàm thuần, có test. */
export function installPlatform(ua: string, maxTouchPoints: number): InstallPlatform {
  const iphoneOrIpod = /iPhone|iPod/.test(ua);
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (iphoneOrIpod || ipad) {
    if (IN_APP.test(ua)) return 'ios-inapp';
    if (/CriOS/.test(ua)) return 'ios-chrome';
    if (/FxiOS|EdgiOS|OPiOS|GSA\/|coc_coc_browser/.test(ua)) return 'ios-other';
    if (!/Safari/.test(ua)) return 'ios-other';
    const major = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0);
    return major >= 26 ? 'ios-safari-26' : 'ios-safari';
  }
  if (/Android/.test(ua)) return IN_APP.test(ua) ? 'android-inapp' : 'android';
  if (/Firefox\//.test(ua)) return 'desktop-firefox';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg\/|OPR\/|coc_coc_browser/.test(ua)) return 'desktop-safari';
  return 'desktop';
}

/** Safari thật trên iPhone/iPad (có iPad đòi trang máy tính); loại Chrome/Firefox iOS và trình duyệt trong app Facebook/Zalo. */
export function isIosSafari(ua: string, maxTouchPoints: number): boolean {
  const p = installPlatform(ua, maxTouchPoints);
  return p === 'ios-safari' || p === 'ios-safari-26';
}

/* ---------- Phần trình duyệt ---------- */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void> | void;
  userChoice?: Promise<{ outcome: string }>;
}

let installedNow = false;

const deferred = (): InstallPromptEvent | null => {
  try {
    return ((window as unknown as { __adsnlInstall?: InstallPromptEvent }).__adsnlInstall ?? null) as InstallPromptEvent | null;
  } catch {
    return null;
  }
};

export const isStandalone = (): boolean => {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    /* matchMedia hỏng → coi như không phải app */
  }
  return (navigator as unknown as { standalone?: boolean }).standalone === true;
};

export const isIos = (): boolean => {
  try {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  } catch {
    return false;
  }
};

const readSnooze = (): number => {
  try {
    const n = Number(localStorage.getItem(SNOOZE_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
};

/** Hoãn thẻ mời 30 ngày trên máy này (ghi hỏng → chỉ ẩn trong phiên này, qua `snoozedInMemory`). */
let snoozedInMemory = 0;

/** Báo cho mọi khối cài ứng dụng đang hiện (Tổng quan, Hồ sơ) vẽ lại. */
export const CHANGED = 'adsnl-install-changed';
const announce = () => {
  try {
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    /* bỏ qua */
  }
};

export const snooze = () => {
  snoozedInMemory = Date.now() + SNOOZE_MS;
  try {
    localStorage.setItem(SNOOZE_KEY, String(snoozedInMemory));
  } catch {
    /* chế độ riêng tư / bị chặn: bỏ qua */
  }
  announce();
};

export const currentInstallMode = (where: 'card' | 'profile'): InstallMode => {
  try {
    return installMode(
      {
        standalone: isStandalone(),
        installed: installedNow,
        canPrompt: deferred() !== null,
        iosSafari: isIosSafari(navigator.userAgent, navigator.maxTouchPoints || 0),
        snoozedUntil: Math.max(readSnooze(), snoozedInMemory),
        now: Date.now(),
      },
      where,
    );
  } catch {
    return 'hidden';
  }
};

export type PromptResult = 'accepted' | 'dismissed' | 'error' | 'none';

/**
 * Mở hộp cài của trình duyệt. PHẢI gọi thẳng trong sự kiện bấm (đoạn đến `ev.prompt()` chạy đồng bộ, không await trước đó).
 * Sự kiện chỉ dùng được một lần nên luôn bỏ sau khi gọi. 'none' = không có sự kiện; 'error' = hộp cài không mở được.
 */
export const tryPrompt = async (): Promise<PromptResult> => {
  const ev = deferred();
  if (!ev) return 'none';
  let result: PromptResult = 'dismissed';
  try {
    (window as unknown as { __adsnlInstall?: unknown }).__adsnlInstall = null;
    await ev.prompt();
    const choice = await ev.userChoice;
    if (choice?.outcome === 'accepted') {
      installedNow = true;
      result = 'accepted';
    }
  } catch {
    result = 'error';
  }
  announce();
  return result;
};

/** Như tryPrompt nhưng chỉ trả về true nếu khách chấp nhận. */
export const promptInstall = async (): Promise<boolean> => (await tryPrompt()) === 'accepted';

/** Đã ở trong app hoặc vừa cài xong: mọi nút "Tải app" phải ẩn. */
export const installHidden = (): boolean => installedNow || isStandalone();

/** Gọi `redraw` khi có thể đổi dạng hiển thị: sự kiện cài sẵn sàng (đến trước hoặc sau khi mã này nạp), đã cài, đổi chế độ hiển thị. */
export const watchInstall = (redraw: () => void) => {
  window.addEventListener('adsnl-install-ready', redraw);
  window.addEventListener(CHANGED, redraw);
  window.addEventListener('appinstalled', () => {
    installedNow = true;
    redraw();
  });
  try {
    window.matchMedia('(display-mode: standalone)').addEventListener('change', redraw);
  } catch {
    /* trình duyệt cũ */
  }
  redraw(); // sự kiện có thể đã đến trước khi mã này nạp (window.__adsnlInstall đã có)
};
