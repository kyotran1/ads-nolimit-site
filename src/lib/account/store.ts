/**
 * Dữ liệu của trang tài khoản: đọc từ Firestore (bản "lite", không giữ kết nối) khi cần,
 * giữ trong bộ nhớ, báo cho các mục đang hiển thị khi có dữ liệu mới.
 *
 * Khách chỉ đọc được dữ liệu của chính mình (luật: firestore.rules). Mọi truy vấn lọc where('uid', '==', uid)
 * và sắp xếp ở trình duyệt (khỏi cần tạo chỉ mục ghép trong Firestore).
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore/lite';
import type { DocumentData } from 'firebase/firestore/lite';
import { app } from '../auth/client';
import { makeOps } from '../ledger/ops';
import type { Sdk } from '../ledger/ops';
import { toDate } from '../ui/dom';
import { parseAdAccount, parseAdBudgetTopup, parseAdReport, parseAdTopupSettings } from '../ads/report';
import type { AdAccount, AdBudgetTopup, AdReport, AdTopupSettings } from '../ads/report';
import { EMPTY_SERVICES, parseCustomerServices } from '../customer/services';
import type { AutoFacts, CustomerServices } from '../customer/services';

export const db = getFirestore(app);
export const ops = makeOps(
  { doc, collection, getDoc, getDocs, setDoc, updateDoc, addDoc, runTransaction, writeBatch, serverTimestamp } as unknown as Sdk,
  db,
);

/* ---------- Kiểu dữ liệu ---------- */

export interface Wallet {
  balance: number;
  updatedAt: Date | null;
}
export interface Tx {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  refType: string;
  refId: string;
  note: string;
  createdAt: Date | null;
}
export interface Topup {
  id: string;
  code: string;
  amount: number;
  status: string;
  reason: string;
  createdAt: Date | null;
  decidedAt: Date | null;
}
export interface Order {
  id: string;
  type: string;
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  status: string;
  note: string;
  adAccountId: string;
  adAccountName: string;
  adminNote: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  refundedAt: Date | null;
}
export interface Machine {
  id: string;
  name: string;
  activatedAt: Date | null;
}
export interface LicenseKey {
  id: string;
  key: string;
  plan: string;
  maxMachines: number;
  machines: Machine[];
  status: string;
  createdAt: Date | null;
}
export interface KeyRequest {
  id: string;
  keyId: string;
  status: string;
  createdAt: Date | null;
}
export interface OutlineItem {
  title: string;
  titleEn: string;
  duration: string;
}
export interface Course {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  price: number;
  priceUsd: number | null;
  cover: string;
  sort: number;
  outline: OutlineItem[];
}
export interface Lesson {
  id: string;
  title: string;
  titleEn: string;
  videoUrl: string;
  duration: string;
  sort: number;
}
export interface Guide {
  id: string;
  title: string;
  titleEn: string;
  category: string;
  categoryEn: string;
  body: string;
  bodyEn: string;
  videoUrl: string;
  sort: number;
  updatedAt: Date | null;
}
export interface Payment {
  bankBin: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  note: string;
}
export interface Product {
  id: string;
  active: boolean;
  pricing: string;
  price: number;
  maxQty: number;
  minAmount: number;
  maxAmount: number;
}
export interface ServiceRequest {
  id: string;
  planId: string;
  note: string;
  contact: string;
  status: string;
  createdAt: Date | null;
}

const s = (d: DocumentData, k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
const n = (d: DocumentData, k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0);
const newestFirst = <T extends { createdAt: Date | null }>(a: T, b: T) =>
  (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);

/* ---------- Trạng thái ---------- */

export const state = {
  uid: '',
  wallet: null as Wallet | null,
  transactions: [] as Tx[],
  topups: [] as Topup[],
  orders: [] as Order[],
  requests: [] as ServiceRequest[],
  keys: [] as LicenseKey[],
  keyRequests: [] as KeyRequest[],
  access: new Set<string>(),
  courses: [] as Course[],
  guides: [] as Guide[],
  products: new Map<string, Product>(),
  adAccounts: [] as AdAccount[],
  adReports: [] as AdReport[],
  adTopups: [] as AdBudgetTopup[],
  adTopupSettings: null as AdTopupSettings | null,
  /** Dịch vụ chủ gán + quyền truy cập mục (customerServices/{uid}); chưa có tài liệu → rỗng */
  customerServices: EMPTY_SERVICES as CustomerServices,
  /** undefined = chưa tải; null = chủ chưa điền */
  payment: undefined as Payment | null | undefined,
};

export type StoreKey =
  | 'wallet'
  | 'transactions'
  | 'topups'
  | 'orders'
  | 'requests'
  | 'keys'
  | 'keyRequests'
  | 'access'
  | 'courses'
  | 'guides'
  | 'products'
  | 'payment'
  | 'adAccounts'
  | 'adReports'
  | 'adTopups'
  | 'adTopupSettings'
  | 'customerServices';

const mine = (name: string) => getDocs(query(collection(db, name), where('uid', '==', state.uid)));

const loaders: Record<StoreKey, () => Promise<void>> = {
  wallet: async () => {
    const snap = await getDoc(doc(db, 'wallets', state.uid));
    const d = snap.data();
    state.wallet = { balance: d ? n(d, 'balance') : 0, updatedAt: d ? toDate(d.updatedAt) : null };
  },
  transactions: async () => {
    const snap = await mine('transactions');
    state.transactions = snap.docs
      .map((x) => {
        const d = x.data();
        return {
          id: x.id,
          type: s(d, 'type'),
          amount: n(d, 'amount'),
          balanceAfter: n(d, 'balanceAfter'),
          refType: s(d, 'refType'),
          refId: s(d, 'refId'),
          note: s(d, 'note'),
          createdAt: toDate(d.createdAt),
        };
      })
      .sort(newestFirst);
  },
  topups: async () => {
    const snap = await mine('topups');
    state.topups = snap.docs
      .map((x) => {
        const d = x.data();
        return {
          id: x.id,
          code: s(d, 'code') || x.id,
          amount: n(d, 'amount'),
          status: s(d, 'status'),
          reason: s(d, 'reason'),
          createdAt: toDate(d.createdAt),
          decidedAt: toDate(d.decidedAt),
        };
      })
      .sort(newestFirst);
  },
  orders: async () => {
    const snap = await mine('orders');
    state.orders = snap.docs
      .map((x) => {
        const d = x.data();
        return {
          id: x.id,
          type: s(d, 'type'),
          productId: s(d, 'productId'),
          name: s(d, 'name'),
          qty: n(d, 'qty') || 1,
          unitPrice: n(d, 'unitPrice'),
          total: n(d, 'total'),
          status: s(d, 'status'),
          note: s(d, 'note'),
          adAccountId: s(d, 'adAccountId'),
          adAccountName: s(d, 'adAccountName'),
          adminNote: s(d, 'adminNote'),
          createdAt: toDate(d.createdAt),
          updatedAt: toDate(d.updatedAt),
          refundedAt: toDate(d.refundedAt),
        };
      })
      .sort(newestFirst);
  },
  requests: async () => {
    const snap = await mine('requests');
    state.requests = snap.docs
      .map((x) => {
        const d = x.data();
        return {
          id: x.id,
          planId: s(d, 'planId'),
          note: s(d, 'note'),
          contact: s(d, 'contact'),
          status: s(d, 'status'),
          createdAt: toDate(d.createdAt),
        };
      })
      .sort(newestFirst);
  },
  keys: async () => {
    const snap = await mine('keys');
    state.keys = snap.docs
      .map((x) => {
        const d = x.data();
        const machines = Array.isArray(d.machines) ? (d.machines as DocumentData[]) : [];
        return {
          id: x.id,
          key: s(d, 'key') || x.id,
          plan: s(d, 'plan'),
          maxMachines: n(d, 'maxMachines') || 1,
          machines: machines.map((m) => ({ id: s(m, 'id'), name: s(m, 'name'), activatedAt: toDate(m.activatedAt) })),
          status: s(d, 'status'),
          createdAt: toDate(d.createdAt),
        };
      })
      .sort(newestFirst);
  },
  adAccounts: async () => {
    const snap = await mine('adAccounts');
    state.adAccounts = snap.docs
      .map((x) => parseAdAccount(x.id, x.data()))
      .filter((a) => a.active)
      .sort((a, b) => a.accountName.localeCompare(b.accountName));
  },
  adReports: async () => {
    const snap = await mine('adReports');
    state.adReports = snap.docs.map((x) => parseAdReport(x.id, x.data())).sort((a, b) => b.month.localeCompare(a.month));
  },
  adTopups: async () => {
    const snap = await mine('adTopups');
    state.adTopups = snap.docs.map((x) => parseAdBudgetTopup(x.id, x.data())).sort(newestFirst);
  },
  customerServices: async () => {
    const snap = await getDoc(doc(db, 'customerServices', state.uid));
    state.customerServices = parseCustomerServices(snap.data());
  },
  adTopupSettings: async () => {
    const snap = await getDoc(doc(db, 'settings', 'adTopup'));
    state.adTopupSettings = parseAdTopupSettings(snap.data());
  },
  keyRequests: async () => {
    const snap = await mine('keyRequests');
    state.keyRequests = snap.docs
      .map((x) => {
        const d = x.data();
        return { id: x.id, keyId: s(d, 'keyId'), status: s(d, 'status'), createdAt: toDate(d.createdAt) };
      })
      .sort(newestFirst);
  },
  access: async () => {
    const snap = await mine('courseAccess');
    state.access = new Set(snap.docs.map((x) => s(x.data(), 'courseId')).filter(Boolean));
  },
  courses: async () => {
    const snap = await getDocs(query(collection(db, 'courses'), where('published', '==', true)));
    state.courses = snap.docs
      .map((x) => {
        const d = x.data();
        const outline = Array.isArray(d.outline) ? (d.outline as DocumentData[]) : [];
        return {
          id: x.id,
          title: s(d, 'title'),
          titleEn: s(d, 'titleEn'),
          description: s(d, 'description'),
          descriptionEn: s(d, 'descriptionEn'),
          price: n(d, 'price'),
          priceUsd: typeof d.priceUsd === 'number' ? (d.priceUsd as number) : null,
          cover: s(d, 'cover'),
          sort: n(d, 'sort'),
          outline: outline.map((o) => ({ title: s(o, 'title'), titleEn: s(o, 'titleEn'), duration: s(o, 'duration') })),
        };
      })
      .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
  },
  guides: async () => {
    const snap = await getDocs(query(collection(db, 'guides'), where('published', '==', true)));
    state.guides = snap.docs
      .map((x) => {
        const d = x.data();
        return {
          id: x.id,
          title: s(d, 'title'),
          titleEn: s(d, 'titleEn'),
          category: s(d, 'category'),
          categoryEn: s(d, 'categoryEn'),
          body: s(d, 'body'),
          bodyEn: s(d, 'bodyEn'),
          videoUrl: s(d, 'videoUrl'),
          sort: n(d, 'sort'),
          updatedAt: toDate(d.updatedAt),
        };
      })
      .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
  },
  products: async () => {
    const snap = await getDocs(collection(db, 'products'));
    state.products = new Map(
      snap.docs.map((x) => {
        const d = x.data();
        return [
          x.id,
          {
            id: x.id,
            active: d.active === true,
            pricing: s(d, 'pricing'),
            price: n(d, 'price'),
            maxQty: n(d, 'maxQty') || 1,
            minAmount: n(d, 'minAmount'),
            maxAmount: n(d, 'maxAmount'),
          },
        ];
      }),
    );
  },
  payment: async () => {
    const snap = await getDoc(doc(db, 'settings', 'payment'));
    const d = snap.data();
    state.payment =
      d && s(d, 'bankBin') && s(d, 'accountNumber')
        ? {
            bankBin: s(d, 'bankBin'),
            bankName: s(d, 'bankName'),
            accountNumber: s(d, 'accountNumber'),
            accountName: s(d, 'accountName'),
            note: s(d, 'note'),
          }
        : null;
  },
};

/* ---------- Tải & báo thay đổi ---------- */

const loaded = new Set<StoreKey>();
const running = new Map<StoreKey, Promise<void>>();
export const errors = new Map<StoreKey, unknown>();
const listeners = new Map<StoreKey, Set<() => void>>();

const emit = (key: StoreKey) => listeners.get(key)?.forEach((fn) => fn());

/** Gọi `fn` mỗi khi một trong các khóa có dữ liệu mới (hoặc lỗi). Trả về hàm hủy. */
export const on = (keys: StoreKey[], fn: () => void) => {
  keys.forEach((k) => {
    if (!listeners.has(k)) listeners.set(k, new Set());
    listeners.get(k)!.add(fn);
  });
  return () => keys.forEach((k) => listeners.get(k)?.delete(fn));
};

const run = (key: StoreKey): Promise<void> => {
  const existing = running.get(key);
  if (existing) return existing;
  const p = loaders[key]()
    .then(() => {
      loaded.add(key);
      errors.delete(key);
    })
    .catch((err) => {
      errors.set(key, err);
    })
    .finally(() => {
      running.delete(key);
      emit(key);
    });
  running.set(key, p);
  return p;
};

/** Tải nếu chưa có. */
export const ensure = (...keys: StoreKey[]) => Promise.all(keys.map((k) => (loaded.has(k) ? Promise.resolve() : run(k))));
/** Tải lại. */
export const reload = (...keys: StoreKey[]) => Promise.all(keys.map(run));
/** Tải lại mọi phần đã tải (dùng khi khách quay lại trang sau một lúc để số dư, báo cáo không bị cũ). */
export const reloadLoaded = () => reload(...loaded);
export const isLoaded = (key: StoreKey) => loaded.has(key);
export const isLoading = (key: StoreKey) => running.has(key);

export const balance = () => state.wallet?.balance ?? 0;

/** Nguồn tự động cho mergeServices()/isOpen(): từ các phần đã tải (phần chưa tải coi như rỗng). */
export const autoFacts = (): AutoFacts => ({
  paidOrders: state.orders
    .filter((o) => o.status === 'paid' || o.status === 'processing' || o.status === 'done')
    .map((o) => ({ type: o.type, productId: o.productId, name: o.name, createdAt: o.createdAt })),
  adAccounts: state.adAccounts.map((a) => ({ label: a.label || a.accountName, service: a.service })),
  courses: state.access.size,
  keys: state.keys.filter((k) => k.status === 'active').length,
});
