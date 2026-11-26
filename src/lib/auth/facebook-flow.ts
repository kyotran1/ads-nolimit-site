/**
 * Đăng nhập bằng Facebook: phần chạm trình duyệt/Firebase dùng chung cho trang Đăng nhập và Đăng ký.
 * Chỉ được nạp khi mã Facebook có trong bản build (facebookLoginOn: on hoặc test; bản off không có tệp này). Không dùng Facebook JS SDK:
 * chỉ Firebase Auth (signInWithPopup) nên trang không nạp bộ mã (SDK) nào của Facebook.
 * Phần thuần (chữ, thứ tự nút) ở facebook.ts, có test.
 */
import { FacebookAuthProvider, linkWithCredential } from 'firebase/auth';
import type { AuthCredential, User } from 'firebase/auth';
import { installPlatform } from '../pwa/install';
import { authErrorMessage, errorCode, errorEmail, inAppBrowser, pageLang } from './messages';
import { existsMessage, existsMessageSignUp, linkDecision, signInLayout } from './facebook';

/**
 * Chứng nhận Facebook đang chờ nối vào tài khoản đã có (khi Facebook báo email trùng).
 * Chỉ giữ trong bộ nhớ trang (KHÔNG lưu localStorage/sessionStorage): đóng trang là mất.
 */
let pending: { credential: AuthCredential; email: string } | null = null;

export const hasPendingFacebook = (): boolean => pending !== null;

/** Chữ báo lỗi khi đăng nhập Facebook thất bại. Gặp "email trùng tài khoản khác" thì giữ chứng nhận để nối sau. '' = im lặng. */
export const facebookFailureText = (err: unknown, page: 'signin' | 'signup'): string => {
  if (errorCode(err) === 'account-exists-with-different-credential') {
    const credential = FacebookAuthProvider.credentialFromError(err as Parameters<typeof FacebookAuthProvider.credentialFromError>[0]);
    const email = errorEmail(err);
    pending = credential ? { credential, email } : null;
    return (page === 'signup' ? existsMessageSignUp : existsMessage)(pageLang(), email, inAppBrowser());
  }
  return authErrorMessage(err, 'facebook');
};

export type LinkOutcome = 'linked' | 'failed' | 'mismatch' | 'none';

/**
 * Khách vừa đăng nhập thành công bằng cách khác (email & mật khẩu, Google): nối Facebook đang chờ vào tài khoản đó.
 * Chỉ nối khi email khớp email Facebook đã báo (tránh nối nhầm vào tài khoản khác); Facebook không báo email thì không nối;
 * email khác nhau thì 'mismatch' (báo nhẹ). Nối lỗi thì chỉ báo nhẹ, không chặn đăng nhập.
 */
export const linkPendingFacebook = async (user: User): Promise<LinkOutcome> => {
  const wait = pending;
  if (!wait) return 'none';
  pending = null;
  const decision = linkDecision(wait.email, user.email);
  if (decision === 'skip') return 'none';
  if (decision === 'mismatch') return 'mismatch';
  try {
    await linkWithCredential(user, wait.credential);
    return 'linked';
  } catch {
    return 'failed';
  }
};

/** Đặt thứ tự nút và dòng nhắc "Google không cho đăng nhập trong app này" theo trình duyệt đang dùng. */
export const applyProviderLayout = (root: HTMLElement | null): void => {
  if (!root) return;
  let layout = { facebookFirst: false, googleNote: false };
  try {
    layout = signInLayout(installPlatform(navigator.userAgent, navigator.maxTouchPoints || 0), navigator.userAgent);
  } catch {
    /* không đọc được UA: giữ thứ tự mặc định */
  }
  if (layout.facebookFirst) root.dataset.first = 'facebook';
  const note = root.querySelector<HTMLElement>('[data-google-note]');
  if (note && layout.googleNote) note.hidden = false;
};
