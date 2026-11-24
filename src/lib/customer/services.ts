/**
 * Dịch vụ khách đang dùng + quyền truy cập mục (V4.2). Thuần TypeScript, dùng chung trang Tài khoản và Quản trị.
 *
 * - customerServices/{uid} (chỉ quản trị ghi): services[] gán tay + access (4 công tắc).
 * - mergeServices(): gộp dịch vụ gán tay với nguồn tự động (đơn đã trả, TKQC đã gắn, khóa học, key) → thẻ hiển thị.
 * - isOpen(): mục ads/courses/keys/guides mở khi được cấp quyền HOẶC đã có dữ liệu thật.
 */
import type { Lang } from '../../config/i18n';
import type { SectionId } from '../account/routes';

export const SERVICE_IDS = ['ai-starter', 'ai-sales', 'ads', 'agency-account', 'ad-budget', 'automation', 'web', 'training', 'other'] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];
export type ServiceStatus = 'active' | 'paused' | 'ended';
export const SERVICE_STATUSES: readonly ServiceStatus[] = ['active', 'paused', 'ended'];
export const ACCESS_KEYS = ['ads', 'courses', 'keys', 'guides'] as const;
export type AccessKey = (typeof ACCESS_KEYS)[number];
export type Access = Record<AccessKey, boolean>;

const names: Record<ServiceId, { vi: string; en: string }> = {
  'ai-starter': { vi: 'AI Agent Khởi đầu', en: 'AI Agent Starter' },
  'ai-sales': { vi: 'AI Agent Bán hàng', en: 'AI Agent Sales' },
  ads: { vi: 'Quảng cáo hiệu suất', en: 'Performance advertising' },
  'agency-account': { vi: 'Tài khoản quảng cáo Agency (BM2500)', en: 'Agency ad account (BM2500)' },
  'ad-budget': { vi: 'Nạp ngân sách quảng cáo', en: 'Ad budget top-up' },
  automation: { vi: 'Tự động hóa quy trình', en: 'Workflow automation' },
  web: { vi: 'Thiết kế website', en: 'Website design' },
  training: { vi: 'Khóa học & đào tạo', en: 'Courses & training' },
  other: { vi: 'Dịch vụ khác', en: 'Other service' },
};
export const serviceName = (id: ServiceId, lang: Lang) => names[id][lang];

export const statusName = (s: ServiceStatus, lang: Lang) =>
  ({ active: { vi: 'Đang dùng', en: 'Active' }, paused: { vi: 'Tạm dừng', en: 'Paused' }, ended: { vi: 'Kết thúc', en: 'Ended' } })[s][lang];

export interface ManualService {
  id: ServiceId;
  label: string;
  status: ServiceStatus;
  /** YYYY-MM-DD */
  since: string;
  note: string;
  source: 'manual';
}

export interface CustomerServices {
  services: ManualService[];
  access: Access;
  updatedAt: Date | null;
  updatedBy: string;
}

export const EMPTY_ACCESS: Access = { ads: false, courses: false, keys: false, guides: false };
export const EMPTY_SERVICES: CustomerServices = { services: [], access: { ...EMPTY_ACCESS }, updatedAt: null, updatedBy: '' };

const isServiceId = (x: unknown): x is ServiceId => typeof x === 'string' && (SERVICE_IDS as readonly string[]).includes(x);
const isStatus = (x: unknown): x is ServiceStatus => typeof x === 'string' && (SERVICE_STATUSES as readonly string[]).includes(x);
export const isDay = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');

/** Đọc tài liệu customerServices; bỏ phần tử sai; thiếu khóa quyền → false. */
export const parseCustomerServices = (d: Record<string, unknown> | undefined | null): CustomerServices => {
  if (!d) return { ...EMPTY_SERVICES, access: { ...EMPTY_ACCESS } };
  const raw = Array.isArray(d.services) ? (d.services as unknown[]) : [];
  const services: ManualService[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (!isServiceId(o.id) || !isStatus(o.status) || !isDay(o.since)) continue;
    services.push({ id: o.id, label: str(o.label, 120), status: o.status, since: o.since, note: str(o.note, 300), source: 'manual' });
    if (services.length >= 30) break;
  }
  const a = (d.access && typeof d.access === 'object' ? d.access : {}) as Record<string, unknown>;
  const access = { ...EMPTY_ACCESS };
  for (const k of ACCESS_KEYS) access[k] = a[k] === true;
  const u = d.updatedAt as { toDate?: () => Date } | Date | undefined;
  const updatedAt = u instanceof Date ? u : u && typeof u.toDate === 'function' ? u.toDate() : null;
  return { services, access, updatedAt, updatedBy: str(d.updatedBy, 128) };
};

/* ---------- Nguồn tự động ---------- */

export interface AutoFacts {
  /** Đơn đã trả tiền (status paid/processing/done) */
  paidOrders: { type: string; productId: string; name: string; createdAt: Date | null }[];
  /** TKQC đã gắn cho khách */
  adAccounts: { label: string; service: string }[];
  /** Số khóa học đã mua */
  courses: number;
  /** Số key đang hoạt động */
  keys: number;
}
export const EMPTY_FACTS: AutoFacts = { paidOrders: [], adAccounts: [], courses: 0, keys: 0 };

/** Đơn hàng → id dịch vụ. */
export const serviceOfOrder = (type: string, productId: string): ServiceId => {
  if (type === 'course') return 'training';
  // productId bán lẻ dạng "<id gói>-setup" / "<id gói>-monthly" / "training-workshop" → gói
  const hit = SERVICE_IDS.find((id) => productId === id || productId.startsWith(`${id}-`));
  return hit ?? 'other';
};

export interface ServiceCard {
  id: ServiceId;
  label: string;
  status: ServiceStatus;
  since: string;
  source: 'manual' | 'order' | 'ad' | 'course' | 'key';
  /** Dòng phụ: "+2 đơn", tên TKQC… */
  extra: string;
  goto: SectionId | null;
}

const day = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d) : '');
const rank: Record<ServiceStatus, number> = { active: 0, paused: 1, ended: 2 };

/** Gộp dịch vụ gán tay + tự động thành thẻ hiển thị; trùng id → một thẻ (ưu tiên gán tay). */
export const mergeServices = (cs: CustomerServices, auto: AutoFacts, lang: Lang): ServiceCard[] => {
  const byId = new Map<ServiceId, ServiceCard>();
  const extras = new Map<ServiceId, string[]>();
  const add = (card: ServiceCard, extra?: string) => {
    const cur = byId.get(card.id);
    if (!cur) byId.set(card.id, card);
    else if (card.source === 'manual' && cur.source !== 'manual') byId.set(card.id, card);
    if (extra) extras.set(card.id, [...(extras.get(card.id) ?? []), extra]);
  };
  for (const s of cs.services) add({ id: s.id, label: s.label || serviceName(s.id, lang), status: s.status, since: s.since, source: 'manual', extra: '', goto: gotoOf(s.id) });
  const orderCount = new Map<ServiceId, number>();
  for (const o of auto.paidOrders) {
    const id = serviceOfOrder(o.type, o.productId);
    orderCount.set(id, (orderCount.get(id) ?? 0) + 1);
    add({ id, label: serviceName(id, lang), status: 'active', since: day(o.createdAt), source: o.type === 'course' ? 'course' : 'order', extra: '', goto: gotoOf(id) });
  }
  for (const a of auto.adAccounts) {
    const id: ServiceId = a.service === 'agency-account' ? 'agency-account' : 'ads';
    add({ id, label: serviceName(id, lang), status: 'active', since: '', source: 'ad', extra: '', goto: 'ads' }, a.label);
  }
  if (auto.courses > 0) add({ id: 'training', label: serviceName('training', lang), status: 'active', since: '', source: 'course', extra: '', goto: 'courses' });
  if (auto.keys > 0) add({ id: 'other', label: lang === 'en' ? 'Software & keys' : 'Phần mềm & key', status: 'active', since: '', source: 'key', extra: '', goto: 'keys' });
  for (const [id, n] of orderCount) {
    const c = byId.get(id);
    if (c && c.source === 'manual') extras.set(id, [...(extras.get(id) ?? []), lang === 'en' ? `+${n} order${n > 1 ? 's' : ''}` : `+${n} đơn`]);
  }
  const out = Array.from(byId.values()).map((c) => ({ ...c, extra: (extras.get(c.id) ?? []).join(' · ') }));
  return out.sort((a, b) => rank[a.status] - rank[b.status] || b.since.localeCompare(a.since));
};

const gotoOf = (id: ServiceId): SectionId | null =>
  id === 'ads' || id === 'agency-account' || id === 'ad-budget' ? 'ads' : id === 'training' ? 'courses' : null;

/** Mục có mở cho khách không: được cấp quyền, hoặc đã có dữ liệu thật. */
export const isOpen = (key: AccessKey, cs: CustomerServices, auto: AutoFacts): boolean =>
  cs.access[key] || (key === 'ads' && auto.adAccounts.length > 0) || (key === 'courses' && auto.courses > 0) || (key === 'keys' && auto.keys > 0);
