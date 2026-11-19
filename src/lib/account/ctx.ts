/**
 * Dùng chung giữa các mục của trang tài khoản: cấu hình in sẵn trong trang (#dash-config),
 * người đang đăng nhập, chuyển mục, định dạng tiền/ngày, huy hiệu trạng thái, ô báo lỗi tải dữ liệu.
 */
import type { User } from 'firebase/auth';
import type { PickerGroup } from '../../data/catalog';
import { formatSigned, formatVnd } from '../money';
import { h } from '../ui/dom';
import { say } from '../auth/client';
import { dataErrorMessage, formatDateTime, m } from '../auth/messages';
import { hashFor } from './routes';
import type { Route, SectionId } from './routes';
import { txMaybe } from './text';

export interface DashConfig {
  lang: 'vi' | 'en';
  picker: PickerGroup[];
  contact: { zalo: string; telegram: string; email: string };
  links: { zalo: string; telegram: string; primary: string };
  paths: { terms: string; pricing: string; software: string };
}

export const config: DashConfig = JSON.parse(document.getElementById('dash-config')?.textContent ?? '{}');
export const lang = config.lang === 'en' ? 'en' : 'vi';

/* ---------- Người dùng ---------- */

let current: User | null = null;
export const me = () => current;
export const setMe = (user: User | null) => {
  current = user;
};

/* ---------- Mục ---------- */

export interface SectionModule {
  /** Gọi mỗi khi mục được mở (hoặc #neo con đổi). */
  enter(route: Route): void;
}
export const modules = new Map<SectionId, SectionModule>();
export const register = (id: SectionId, mod: SectionModule) => modules.set(id, mod);

let currentRoute: Route = { section: 'overview', sub: '' };
export const route = () => currentRoute;
export const setRoute = (r: Route) => {
  currentRoute = r;
};
export const isVisible = (id: SectionId) => currentRoute.section === id;

/** Chuyển mục (đổi #neo → main.ts hiển thị). */
export const go = (section: SectionId, sub = '') => {
  const target = hashFor(section, lang, sub);
  if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = target;
};

/* ---------- Định dạng ---------- */

export const money = (n: number) => formatVnd(n, lang);
export const signed = (n: number) => formatSigned(n, lang);
export const when = (d: Date | null) => (d ? formatDateTime(d) : '—');
/** Mã đơn ngắn để hiện: 8 ký tự đầu, in hoa. */
export const shortId = (id: string) => id.slice(0, 8).toUpperCase();

/** Huy hiệu trạng thái: badge('order', 'paid') → "Đã thanh toán" */
export const badge = (kind: 'topup' | 'order' | 'key' | 'keyreq', status: string) =>
  h('span', { class: `badge badge--${status}`, text: txMaybe(`${kind}.${status}`, status) });

/** Báo lỗi tải dữ liệu kèm nút "Thử lại". */
export const loadError = (region: HTMLElement | null, err: unknown, retry: () => void) =>
  say(region, `${m('loadFailed')} ${dataErrorMessage(err)}`, { action: { label: m('retry'), run: retry } });

/** Dòng "đang tải" dùng trong danh sách. */
export const loadingRow = () =>
  h('li', { class: 'row-loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { text: '…' }));
