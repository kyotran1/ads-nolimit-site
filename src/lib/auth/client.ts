/**
 * Khởi tạo Firebase Authentication và các hàm dùng chung cho 4 trang tài khoản
 * (đăng nhập, đăng ký, quên mật khẩu, tài khoản). Chỉ nạp firebase/app và firebase/auth.
 * Firestore chỉ được nạp riêng ở trang tài khoản (src/lib/auth/account.ts).
 */
import { getApp, getApps, initializeApp } from 'firebase/app';
import { FacebookAuthProvider, getAuth, GoogleAuthProvider } from 'firebase/auth';
import type { ActionCodeSettings, User } from 'firebase/auth';
import { firebaseConfig } from '../../config/firebase';
import { isPhoneUA } from './facebook';
import { errorCode, m, pageLang } from './messages';
import type { MessageKey } from './messages';

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Email của Firebase (xác minh, đặt lại mật khẩu) gửi theo ngôn ngữ của trang.
auth.languageCode = pageLang();

/* ---------- Cấu hình trang (do AuthConfig.astro in ra) ---------- */

export interface AuthPageConfig {
  siteUrl: string;
  paths: { home: string; signIn: string; signUp: string; forgot: string; account: string; privacy: string };
  /** Đường dẫn trang đăng nhập/đăng ký/quên mật khẩu ở cả hai ngôn ngữ (không dùng làm `next`). */
  authPaths: string[];
}

export const config: AuthPageConfig = JSON.parse(document.getElementById('auth-config')?.textContent ?? '{}');

/* ---------- Đăng nhập Google ---------- */

export const googleProvider = (): GoogleAuthProvider => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
};

/* ---------- Đăng nhập Facebook (chỉ dùng khi mã Facebook có trong bản build; không dùng Facebook JS SDK) ---------- */

export const facebookProvider = (): FacebookAuthProvider => {
  const provider = new FacebookAuthProvider();
  provider.addScope('email');
  provider.addScope('public_profile');
  // display=popup chỉ hợp cho máy tính; trên điện thoại để Facebook tự chọn giao diện.
  if (!isPhoneUA(navigator.userAgent, navigator.maxTouchPoints || 0)) provider.setCustomParameters({ display: 'popup' });
  return provider;
};

export const hasPassword = (user: User) => user.providerData.some((p) => p.providerId === 'password');
export const hasGoogle = (user: User) => user.providerData.some((p) => p.providerId === 'google.com');
export const hasFacebook = (user: User) => user.providerData.some((p) => p.providerId === 'facebook.com');

/* ---------- Điều hướng an toàn sau khi đăng nhập ---------- */

/**
 * `next` chỉ được là đường dẫn trong cùng site ("/..." nhưng không phải "//..." hay "/\..."),
 * và không phải chính các trang đăng nhập/đăng ký. Ngược lại dùng `fallback`.
 */
export const safeNext = (raw: string | null, fallback = config.paths.account): string => {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, location.origin);
    if (url.origin !== location.origin) return fallback;
    if (config.authPaths.includes(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
};

export const nextParam = (): string | null => new URLSearchParams(location.search).get('next');

/**
 * Trang đến sau khi vừa TẠO tài khoản: trang tài khoản kèm ?welcome=… (để hiện lời chào / nhắc xác minh email).
 * Nếu `next` đã trỏ tới trang tài khoản (ví dụ ?plan=ads#yeu-cau) thì giữ nguyên phần đó.
 */
export const welcomeTarget = (welcome: string): string => {
  const next = safeNext(nextParam());
  const url = new URL(next, location.origin);
  const target = url.pathname === config.paths.account ? url : new URL(config.paths.account, location.origin);
  target.searchParams.set('welcome', welcome);
  return target.pathname + target.search + target.hash;
};

/** Thêm ?next=… (nếu có) vào các link chuyển qua lại giữa đăng nhập / đăng ký / quên mật khẩu. */
export const keepNextOnLinks = (): void => {
  const next = nextParam();
  if (!next || safeNext(next, '') === '') return;
  document.querySelectorAll<HTMLAnchorElement>('a[data-keep-next]').forEach((a) => {
    const url = new URL(a.href, location.origin);
    url.searchParams.set('next', next);
    a.href = url.pathname + url.search;
  });
};

/* ---------- Link trong email của Firebase ---------- */

/** Trang mở tiếp sau khi khách bấm link trong email (đúng tên miền đã được phép trong Firebase). */
const continueUrl = (path: string): string =>
  (location.hostname === 'localhost' ? location.origin : config.siteUrl.replace(/\/$/, '')) + path;

const continueErrors = ['unauthorized-continue-uri', 'invalid-continue-uri', 'missing-continue-uri'];

/** Gọi hàm gửi email kèm link quay lại site; nếu Firebase từ chối link đó thì gửi lại không kèm link. */
export const withContinueUrl = async (path: string, send: (settings?: ActionCodeSettings) => Promise<void>) => {
  try {
    await send({ url: continueUrl(path) });
  } catch (err) {
    if (!continueErrors.includes(errorCode(err))) throw err;
    await send();
  }
};

/* ---------- Giao diện: nút đang xử lý, thông báo, lỗi ô nhập ---------- */

const original = new WeakMap<HTMLButtonElement, Node[]>();

/** Khóa nút, hiện vòng xoay và chữ "Đang …"; gọi lại với busy=false để trả về như cũ. */
export const setBusy = (button: HTMLButtonElement | null, busy: boolean, label?: MessageKey): void => {
  if (!button) return;
  if (busy) {
    if (!original.has(button))
      original.set(
        button,
        Array.from(button.childNodes).map((n) => n.cloneNode(true)),
      );
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = label ? m(label) : (button.textContent ?? '').trim();
    button.replaceChildren(spinner, text);
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  } else {
    const nodes = original.get(button);
    if (nodes) button.replaceChildren(...nodes.map((n) => n.cloneNode(true)));
    original.delete(button);
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
};

/** Khóa/mở nhiều nút cùng lúc (ví dụ cả nút email lẫn nút Google khi đang đăng nhập). */
export const lockButtons = (buttons: (HTMLButtonElement | null)[], locked: boolean): void => {
  buttons.forEach((b) => {
    if (b && !b.hasAttribute('aria-busy')) b.disabled = locked;
  });
};

/**
 * Hiện thông báo trong một vùng role="alert" (lỗi) hoặc role="status" (thành công).
 * `text` rỗng = xóa thông báo. Có thể kèm một link hành động.
 */
export const say = (
  region: HTMLElement | null,
  text: string,
  options: {
    kind?: 'error' | 'success' | 'info';
    link?: { href: string; label: string };
    action?: { label: string; run: () => void };
  } = {},
): void => {
  if (!region) return;
  region.replaceChildren();
  region.dataset.kind = options.kind ?? (region.getAttribute('role') === 'alert' ? 'error' : 'success');
  if (!text) return;
  const p = document.createElement('p');
  p.textContent = text;
  region.append(p);
  if (options.link) {
    const a = document.createElement('a');
    a.href = options.link.href;
    a.textContent = options.link.label;
    a.className = 'alert-link';
    region.append(a);
  }
  if (options.action) {
    const { label, run } = options.action;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm alert-action';
    button.textContent = label;
    button.addEventListener('click', run, { once: true });
    region.append(button);
  }
};

/** Đánh dấu một ô nhập sai (aria-invalid + chữ báo lỗi ngay dưới ô), hoặc xóa đánh dấu khi `message` rỗng. */
export const fieldError = (input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, message = ''): void => {
  const out = document.getElementById(`${input.id}-error`);
  if (out) out.textContent = message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
};

/** Xóa lỗi của ô khi khách sửa lại. */
export const clearOnInput = (form: HTMLFormElement): void => {
  form.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (target?.id && target.getAttribute('aria-invalid') === 'true') fieldError(target);
  });
};

/** Đặt tiêu điểm vào ô sai đầu tiên; trả về true nếu form có lỗi. */
export const focusFirstInvalid = (form: HTMLFormElement): boolean => {
  const first = form.querySelector<HTMLElement>('[aria-invalid="true"]');
  first?.focus();
  return Boolean(first);
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const checkEmail = (input: HTMLInputElement): boolean => {
  const value = input.value.trim();
  input.value = value;
  if (!value) fieldError(input, m('emailRequired'));
  else if (!EMAIL_RE.test(value)) fieldError(input, m('emailInvalid'));
  else fieldError(input);
  return input.getAttribute('aria-invalid') !== 'true';
};

export const MIN_PASSWORD = 8;

/** Ô mật khẩu có nút Hiện/Ẩn (src/components/auth/PasswordInput.astro). */
export const setupPasswordToggles = (root: ParentNode = document): void => {
  root.querySelectorAll<HTMLButtonElement>('button[data-toggle-password]').forEach((button) => {
    const input = document.getElementById(button.getAttribute('aria-controls') ?? '') as HTMLInputElement | null;
    if (!input) return;
    button.hidden = false;
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', m(show ? 'hide' : 'show'));
    });
  });
};

/** Đưa trang tới vị trí #neo sau khi nội dung (đang ẩn chờ đăng nhập) đã hiện ra. */
export const scrollToHash = (): void => {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  if (target) target.scrollIntoView({ block: 'start' });
};
