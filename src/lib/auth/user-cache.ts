/**
 * Bộ nhớ nhỏ trong trình duyệt (localStorage, khóa "adsnl-user") để header ở MỌI trang
 * biết khách đã đăng nhập mà không phải tải Firebase. Chỉ lưu tên hiển thị, chữ cái đầu
 * và ảnh đại diện (nếu đăng nhập Google). Ghi khi đăng nhập / đổi tên, xóa khi đăng xuất / xóa tài khoản.
 *
 * Script hiển thị ở header: src/components/AccountLink.astro (đọc cùng khóa này).
 * Mọi thao tác đều bọc try/catch: trình duyệt chặn localStorage thì site vẫn chạy bình thường.
 */
export const USER_CACHE_KEY = 'adsnl-user';
export const USER_CACHE_EVENT = 'adsnl-user';

export interface CachedUser {
  name: string;
  initial: string;
  /** Ảnh Google (https) hoặc ảnh đại diện khách tải lên (data:image/…) */
  photoURL?: string;
}

/** Ảnh đại diện trong hồ sơ (data URL) — đặt bởi trang Tài khoản để header/menu hiện ngay. */
let profileAvatar = '';
try {
  // Lấy lại ảnh đã lưu lần trước để menu/header hiện ngay khi tải trang (hồ sơ tải về sau sẽ ghi đè).
  const cached = JSON.parse(localStorage.getItem(USER_CACHE_KEY) ?? 'null') as CachedUser | null;
  if (cached?.photoURL && /^data:image\//.test(cached.photoURL)) profileAvatar = cached.photoURL;
} catch {
  /* không có localStorage */
}
export const setProfileAvatar = (dataUrl: string) => {
  profileAvatar = /^data:image\//.test(dataUrl) ? dataUrl : '';
};
export const profileAvatarUrl = () => profileAvatar;

interface UserLike {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/** Tên hiển thị, nếu chưa có thì lấy phần trước @ của email. */
export const nameOf = (user: UserLike): string =>
  (user.displayName ?? '').trim() || (user.email ?? '').split('@')[0] || '?';

export const initialOf = (name: string): string => (Array.from(name.trim())[0] ?? '?').toLocaleUpperCase('vi');

const notify = () => {
  try {
    window.dispatchEvent(new Event(USER_CACHE_EVENT));
  } catch {
    /* bỏ qua */
  }
};

export const writeUserCache = (user: UserLike): void => {
  const name = nameOf(user);
  const value: CachedUser = { name, initial: initialOf(name) };
  if (profileAvatar) value.photoURL = profileAvatar;
  else if (user.photoURL && /^https:\/\//.test(user.photoURL)) value.photoURL = user.photoURL;
  try {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(value));
  } catch {
    /* localStorage bị chặn: header chỉ hiện nút "Đăng nhập" */
  }
  notify();
};

export const clearUserCache = (): void => {
  try {
    if (localStorage.getItem(USER_CACHE_KEY) === null) return;
    localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    return;
  }
  notify();
};
