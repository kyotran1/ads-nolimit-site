/**
 * Mục "Thông báo" — phần thuần (không DOM, không Firebase) để test được bằng Node:
 * chuẩn hóa số Zalo, tạo mã nối Messenger, đọc tùy chọn đã lưu.
 */

export interface NotifyPrefs {
  email: boolean;
  /** Nhận qua Messenger khi đã nối (nối xong mặc định là nhận). */
  messenger: boolean;
  zalo: boolean;
  /** '' hoặc 0xxxxxxxxx (10 số, đầu 03/05/07/08/09), đúng luật Firestore. */
  zaloPhone: string;
}

export const DEFAULT_NOTIFY: NotifyPrefs = { email: true, messenger: true, zalo: false, zaloPhone: '' };

/** Số di động VN đã chuẩn hóa — khớp luật Firestore ^0[35789][0-9]{8}$. */
export const PHONE_OK = /^0[35789][0-9]{8}$/;

/**
 * Số Zalo nhập tay → 0xxxxxxxxx. Bỏ khoảng trắng, dấu chấm, gạch, ngoặc; đổi +84 / 84 → 0.
 * '' (chưa nhập) → ''. Không hợp lệ → null.
 */
export const normalizeZaloPhone = (raw: string): string | null => {
  const t = String(raw ?? '').trim();
  if (t === '') return '';
  if (!/^[+0-9\s().-]+$/.test(t)) return null;
  let digits = t.replace(/\D/g, '');
  if (t.startsWith('+') || digits.startsWith('84')) {
    if (!digits.startsWith('84')) return null;
    digits = digits.slice(2);
    // "+84 0912345678": bỏ số 0 thừa sau mã nước
    digits = digits.startsWith('0') ? digits : '0' + digits;
  }
  return PHONE_OK.test(digits) ? digits : null;
};

/** Mã nối Messenger: 10 ký tự A-Z0-9 (khớp luật Firestore ^[A-Z0-9]{10}$). */
export const CODE_RE = /^[A-Z0-9]{10}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Tạo mã từ bộ sinh byte ngẫu nhiên (crypto.getRandomValues). Bỏ byte ≥ 252 để 36 ký tự đều xác suất. */
export const makeCode = (fill: (bytes: Uint8Array) => void): string => {
  let out = '';
  const buf = new Uint8Array(32);
  while (out.length < 10) {
    fill(buf);
    for (const b of buf) {
      if (b >= 252) continue;
      out += ALPHABET[b % 36];
      if (out.length === 10) break;
    }
  }
  return out;
};

export const PAGE_HANDLE = 'adsnolimit.agency2610';

/** Link mở Messenger với mã nối: https://m.me/<page>?ref=NOI-<mã>. */
export const messengerLink = (code: string): string => `https://m.me/${PAGE_HANDLE}?ref=NOI-${code}`;

/** Tin mẫu khách gửi nếu Messenger không mang theo ref. */
export const messengerText = (code: string): string => `Nối thông báo NOI-${code}`;

/** Đọc users/{uid}.notify (dữ liệu thô); thiếu → mặc định (email bật; nhận Messenger khi đã nối). */
export const parseNotify = (data: unknown): NotifyPrefs => {
  const n = (data && typeof data === 'object' ? (data as Record<string, unknown>).notify : null) as Record<string, unknown> | null;
  if (!n || typeof n !== 'object') return { ...DEFAULT_NOTIFY };
  const phone = typeof n.zaloPhone === 'string' && PHONE_OK.test(n.zaloPhone) ? n.zaloPhone : '';
  return {
    email: n.email !== false,
    messenger: n.messenger !== false,
    zalo: n.zalo === true && phone !== '',
    zaloPhone: phone,
  };
};

/** Mã nối hết hạn sau 24 giờ. */
export const CODE_TTL_MS = 24 * 60 * 60 * 1000;

/** Mã còn dùng được ở máy này (đã tạo chưa quá 24 giờ, đúng hạn của Apps Script)? */
export const pendingValid = (createdAtMs: number, nowMs: number): boolean => Number.isFinite(createdAtMs) && nowMs - createdAtMs >= 0 && nowMs - createdAtMs < CODE_TTL_MS;
