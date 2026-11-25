/**
 * Báo cáo TKQC cho khách: kiểu dữ liệu + đọc tài liệu Firestore.
 * adAccounts/{actId}: cấu hình (quản trị ghi) + latest (Apps Script trong trang tính bot 3 ghi).
 * adReports/{actId}_{YYYY-MM}: báo cáo tháng giống tab trang tính (Apps Script ghi).
 */
import type { DocumentData } from 'firebase/firestore/lite';
import { toDate } from '../ui/dom';
import { parseMembers } from './members';

export { mergeById, mergeSettled, parseMembers } from './members';

export type AdService = 'ads' | 'agency-account' | 'ad-budget';

export interface AdLatest {
  month: string;
  balance: number;
  totalTopup: number;
  totalSpend: number;
  spendYesterday: number;
  /** Chi tiêu hôm nay (đến lần cập nhật gần nhất); báo cáo cũ không có → 0 */
  spendToday: number;
  avg7: number;
  daysLeft: number | null;
  low: boolean;
  updatedAt: Date | null;
}

export interface AdAccount {
  id: string;
  /** Tài khoản chính */
  uid: string;
  /** Người xem thêm (≤ 10); tài liệu cũ → [] */
  viewerUids: string[];
  viewerEmails: string[];
  /** [uid, ...viewerUids]; tài liệu cũ → [uid] */
  memberUids: string[];
  customerEmail: string;
  accountName: string;
  label: string;
  service: AdService;
  tabPattern: string;
  lowVnd: number;
  lowDays: number;
  emailAlerts: boolean;
  active: boolean;
  latest: AdLatest | null;
  updatedAt: Date | null;
}

export interface AdTopup {
  /** YYYY-MM-DD; trống với dòng ghi chú (số dư tháng trước, 10% phí…) */
  date: string;
  label: string;
  amount: number;
  /** Ô số tiền đang trống trên trang tính (undefined với báo cáo cũ) */
  blank?: boolean;
}

/** Khối ngân hàng bên phải tab trang tính */
export interface AdBank {
  name: string;
  holder: string;
  account: string;
}

export interface AdDay {
  date: string;
  comment: number;
  inbox: number;
  data: number;
  cpd: number;
  spend: number;
}

export interface AdReport {
  id: string;
  actId: string;
  month: string;
  tab: string;
  accountName: string;
  note: string;
  topups: AdTopup[];
  /** Mọi ngày ở cột NGÀY của bảng chi tiêu, theo thứ tự trên trang tính (rỗng với báo cáo cũ) */
  dayDates: string[];
  bank: AdBank | null;
  days: AdDay[];
  totals: { topup: number; spend: number; balance: number; comment: number; inbox: number; data: number; cpd: number };
  updatedAt: Date | null;
}

const s = (d: DocumentData | undefined, k: string) => (d && typeof d[k] === 'string' ? (d[k] as string) : '');
const n = (d: DocumentData | undefined, k: string) => (d && typeof d[k] === 'number' && Number.isFinite(d[k]) ? (d[k] as number) : 0);
const services: AdService[] = ['ads', 'agency-account', 'ad-budget'];

export const parseAdAccount = (id: string, d: DocumentData): AdAccount => {
  const l = d.latest as DocumentData | undefined;
  return {
    id,
    uid: s(d, 'uid'),
    ...parseMembers(d),
    customerEmail: s(d, 'customerEmail'),
    accountName: s(d, 'accountName'),
    label: s(d, 'label'),
    service: services.includes(d.service) ? (d.service as AdService) : 'ads',
    tabPattern: s(d, 'tabPattern'),
    lowVnd: n(d, 'lowVnd'),
    lowDays: n(d, 'lowDays'),
    emailAlerts: d.emailAlerts === true,
    active: d.active !== false,
    latest:
      l && typeof l === 'object'
        ? {
            month: s(l, 'month'),
            balance: n(l, 'balance'),
            totalTopup: n(l, 'totalTopup'),
            totalSpend: n(l, 'totalSpend'),
            spendYesterday: n(l, 'spendYesterday'),
            spendToday: n(l, 'spendToday'),
            avg7: n(l, 'avg7'),
            daysLeft: typeof l.daysLeft === 'number' ? l.daysLeft : null,
            low: l.low === true,
            updatedAt: toDate(l.updatedAt),
          }
        : null,
    updatedAt: toDate(d.updatedAt),
  };
};

export const parseAdReport = (id: string, d: DocumentData): AdReport => {
  const t = (d.totals ?? {}) as DocumentData;
  const topups = Array.isArray(d.topups) ? (d.topups as DocumentData[]) : [];
  const days = Array.isArray(d.days) ? (d.days as DocumentData[]) : [];
  return {
    id,
    actId: s(d, 'actId'),
    month: s(d, 'month'),
    tab: s(d, 'tab'),
    accountName: s(d, 'accountName'),
    note: s(d, 'note'),
    topups: topups.map((x) => ({
      date: s(x, 'date'),
      label: s(x, 'label'),
      amount: n(x, 'amount'),
      ...(typeof x.blank === 'boolean' ? { blank: x.blank as boolean } : {}),
    })),
    dayDates: (Array.isArray(d.dayDates) ? (d.dayDates as unknown[]) : []).filter((x): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)),
    bank:
      d.bank && typeof d.bank === 'object' && /^\d{6,19}$/.test(s(d.bank as DocumentData, 'account'))
        ? { name: s(d.bank as DocumentData, 'name'), holder: s(d.bank as DocumentData, 'holder'), account: s(d.bank as DocumentData, 'account') }
        : null,
    days: days
      .map((x) => ({ date: s(x, 'date'), comment: n(x, 'comment'), inbox: n(x, 'inbox'), data: n(x, 'data'), cpd: n(x, 'cpd'), spend: n(x, 'spend') }))
      .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date))
      .sort((a, b) => a.date.localeCompare(b.date)),
    totals: {
      topup: n(t, 'topup'),
      spend: n(t, 'spend'),
      balance: n(t, 'balance'),
      comment: n(t, 'comment'),
      inbox: n(t, 'inbox'),
      data: n(t, 'data'),
      cpd: n(t, 'cpd'),
    },
    updatedAt: toDate(d.updatedAt),
  };
};

/** 2026-11-05 → 05/11/2026 */
export const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
/** 2026-11 → 11/2026 */
export const my = (ym: string) => (/^\d{4}-\d{2}$/.test(ym) ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : ym);

/* ---------- Nạp ngân sách TKQC (adTopups, settings/adTopup) ---------- */

export interface AdTopupSettings {
  /** Số tiền khách chuyển (đã gồm phí) */
  presets: number[];
  min: number;
  max: number;
  feePercent: number;
}

/** Mặc định khi chủ chưa lưu cài đặt (khớp firestore.rules adTopupCfg()). */
export const AD_TOPUP_DEFAULTS: AdTopupSettings = { presets: [11_000_000, 22_000_000], min: 11_000_000, max: 110_000_000, feePercent: 10 };

/** Ngân sách vào TKQC từ số tiền chuyển (gồm phí). */
export const budgetOf = (amount: number, feePercent: number) => Math.round((amount * 100) / (100 + feePercent));

export const parseAdTopupSettings = (d: DocumentData | undefined): AdTopupSettings => {
  if (!d) return { ...AD_TOPUP_DEFAULTS };
  const presets = Array.isArray(d.presets) ? (d.presets as unknown[]).filter((x): x is number => typeof x === 'number' && x > 0) : [];
  return {
    presets: presets.length ? presets : AD_TOPUP_DEFAULTS.presets,
    min: n(d, 'min') || AD_TOPUP_DEFAULTS.min,
    max: n(d, 'max') || AD_TOPUP_DEFAULTS.max,
    feePercent: typeof d.feePercent === 'number' ? d.feePercent : AD_TOPUP_DEFAULTS.feePercent,
  };
};

export type AdTopupStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface AdBudgetTopup {
  code: string;
  uid: string;
  email: string;
  name: string;
  actId: string;
  accountLabel: string;
  amount: number;
  budget: number;
  feePercent: number;
  day: string;
  status: AdTopupStatus;
  reason: string;
  written: boolean;
  sheetTab: string;
  /** 'sepay' khi tự xác nhận qua SePay */
  decidedBy: string;
  /** Ghi chú khi SePay thấy tiền nhưng không tự duyệt được (sai số tiền…) */
  sepayNote: string;
  paidAmount: number;
  /** Mã giao dịch SePay đã khớp (rỗng nếu chưa thấy tiền về) */
  sepayId: string;
  /** Tài liệu đã có trường `written` (Apps Script đã đụng tới trang tính), dù true hay false */
  hasWritten: boolean;
  createdAt: Date | null;
  decidedAt: Date | null;
  writtenAt: Date | null;
}

const statuses: AdTopupStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

export const parseAdBudgetTopup = (code: string, d: DocumentData): AdBudgetTopup => ({
  code,
  uid: s(d, 'uid'),
  email: s(d, 'email'),
  name: s(d, 'name'),
  actId: s(d, 'actId'),
  accountLabel: s(d, 'accountLabel'),
  amount: n(d, 'amount'),
  budget: n(d, 'budget'),
  feePercent: n(d, 'feePercent'),
  day: s(d, 'day'),
  status: statuses.includes(d.status) ? (d.status as AdTopupStatus) : 'pending',
  reason: s(d, 'reason'),
  written: d.written === true,
  sheetTab: s(d, 'sheetTab'),
  decidedBy: s(d, 'decidedBy'),
  sepayNote: s(d, 'sepayNote'),
  paidAmount: n(d, 'paidAmount'),
  sepayId: d.sepayId == null ? '' : String(d.sepayId),
  hasWritten: 'written' in d,
  createdAt: toDate(d.createdAt),
  decidedAt: toDate(d.decidedAt),
  writtenAt: toDate(d.writtenAt),
});

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export const todayVn = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
