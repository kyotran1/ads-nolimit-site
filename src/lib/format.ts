import type { Lang } from '../config/i18n';

/** Ngày dạng 19/11/2026 (vi) hoặc 19 November 2026 (en) */
export const formatDate = (date: Date, lang: Lang = 'vi') =>
  lang === 'en'
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(date)
    : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
