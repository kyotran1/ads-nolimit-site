/**
 * Định dạng tiền cho trang tài khoản / quản trị (trình duyệt và lúc build).
 * Số dư luôn tính bằng VNĐ (tiền thật khách chuyển khoản). Trang tiếng Anh hiện "1,000,000 VND";
 * giá tham khảo trên trang tiếng Anh vẫn lấy USD từ src/data/pricing.ts.
 */
import type { Lang } from '../config/i18n';

const nf = {
  vi: new Intl.NumberFormat('vi-VN'),
  en: new Intl.NumberFormat('en-US'),
};

/** 1000000 → "1.000.000đ" (vi) / "1,000,000 VND" (en). */
export const formatVnd = (amount: number, lang: Lang): string =>
  lang === 'en' ? `${nf.en.format(amount)} VND` : `${nf.vi.format(amount)}đ`;

/** Có dấu: "+1.000.000đ" / "−990.000đ". */
export const formatSigned = (amount: number, lang: Lang): string =>
  `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${formatVnd(Math.abs(amount), lang)}`;

/** 189 → "$189". */
export const formatUsd = (amount: number): string => `$${nf.en.format(amount)}`;

/** Số có dấu phân cách để hiện trong ô nhập: 1000000 → "1.000.000" / "1,000,000". */
export const groupDigits = (amount: number, lang: Lang): string => nf[lang].format(amount);

/** Đọc số tiền khách gõ ("1.000.000", "1,000,000", "1000000đ", " 2 000 000 ") → 1000000; không đọc được → NaN. */
export const parseAmount = (raw: string): number => {
  const digits = raw.replace(/[\s.,_]/g, '').replace(/(đ|vnd|vnđ|d)$/i, '');
  if (!/^\d{1,13}$/.test(digits)) return Number.NaN;
  return Number(digits);
};

/** Làm tròn LÊN tới bội số `step` (mặc định 1.000đ). */
export const roundUp = (amount: number, step = 1000): number => Math.ceil(amount / step) * step;
