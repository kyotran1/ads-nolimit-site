/**
 * Báo cáo TKQC cho khách: kiểu dữ liệu + đọc tài liệu Firestore.
 * adAccounts/{actId}: cấu hình (quản trị ghi) + latest (Apps Script trong trang tính bot 3 ghi).
 * adReports/{actId}_{YYYY-MM}: báo cáo tháng giống tab trang tính (Apps Script ghi).
 */
import type { DocumentData } from 'firebase/firestore/lite';
import { toDate } from '../ui/dom';

export type AdService = 'ads' | 'agency-account' | 'ad-budget';

export interface AdLatest {
  month: string;
  balance: number;
  totalTopup: number;
  totalSpend: number;
  spendYesterday: number;
  avg7: number;
  daysLeft: number | null;
  low: boolean;
  updatedAt: Date | null;
}

export interface AdAccount {
  id: string;
  uid: string;
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
    topups: topups.map((x) => ({ date: s(x, 'date'), label: s(x, 'label'), amount: n(x, 'amount') })),
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
