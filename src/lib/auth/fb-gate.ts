/**
 * Phần chạm trình duyệt của cờ Facebook:
 *  - facebookShown(): có hiện Facebook cho khách này không (on: có; test: chỉ khi đã bật bằng ?fbtest=1; off: không);
 *  - revealFacebook(): ở chế độ test đã bật, hiện các phần tử Facebook đang ẩn trong trang và đổi câu lưu ý sang bản có Facebook;
 *  - browserStallEnv: đồng hồ + sự kiện "khách quay lại trang" cho armStallUnlock (facebook.ts).
 * Chỉ dùng bên trong `if (facebookLoginOn)` nên ở bản "off" các chỗ gọi là mã chết (dist có thể còn tệp này nhưng không có gì chạy).
 */
import { facebookLoginOn, facebookTestOnly } from '../../config/auth-providers';
import { FB_TEST_KEY, fbTestDecision } from './facebook';
import type { StallEnv } from './facebook';

export const facebookShown = (): boolean => {
  if (!facebookLoginOn) return false;
  if (!facebookTestOnly) return true;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(FB_TEST_KEY);
  } catch {
    /* không đọc được: coi như chưa bật */
  }
  const decision = fbTestDecision(location.search, stored);
  try {
    if (decision.write === '1') localStorage.setItem(FB_TEST_KEY, '1');
    else if (decision.write === 'remove') localStorage.removeItem(FB_TEST_KEY);
  } catch {
    /* chế độ riêng tư: vẫn bật cho lần tải trang này */
  }
  return decision.enabled;
};

export const revealFacebook = (): void => {
  document.querySelectorAll<HTMLElement>('[data-fb-test]').forEach((el) => (el.hidden = false));
  document.querySelectorAll<HTMLElement>('[data-note-off]').forEach((el) => (el.hidden = true));
  document.querySelectorAll<HTMLElement>('[data-note-on]').forEach((el) => (el.hidden = false));
};

export const browserStallEnv = (): StallEnv => ({
  setTimer: (fn, ms) => window.setTimeout(fn, ms),
  clearTimer: (handle) => window.clearTimeout(handle as number),
  onReturn: (fn) => {
    const onVisible = () => {
      if (!document.hidden) fn();
    };
    window.addEventListener('focus', fn);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', fn);
      document.removeEventListener('visibilitychange', onVisible);
    };
  },
});
