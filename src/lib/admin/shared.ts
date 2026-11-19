/**
 * Trang quản trị /quan-tri/ — phần dùng chung: Firestore (bản lite, có transaction), thao tác tiền (ops.ts),
 * danh sách khách (users/ + wallets/), định dạng, ô nhập dựng nhanh.
 *
 * Chỉ người có tài liệu admins/<uid> trong Firestore mới dùng được (luật firestore.rules chặn mọi người khác,
 * kể cả khi họ mở được trang này).
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore/lite';
import type { DocumentData } from 'firebase/firestore/lite';
import { app } from '../auth/client';
import { formatDateTime } from '../auth/messages';
import { makeOps } from '../ledger/ops';
import type { Sdk } from '../ledger/ops';
import { formatVnd } from '../money';
import { h, toDate } from '../ui/dom';
import type { Bank } from '../../data/banks';
import type { ProductDoc } from '../../data/catalog';

export const db = getFirestore(app);
export const ops = makeOps(
  { doc, collection, getDoc, getDocs, setDoc, updateDoc, addDoc, runTransaction, writeBatch, serverTimestamp } as unknown as Sdk,
  db,
);

export interface AdminConfig {
  catalog: ProductDoc[];
  banks: Bank[];
  planNames: Record<string, string>;
  accountPath: string;
}
export const config: AdminConfig = JSON.parse(document.getElementById('admin-config')?.textContent ?? '{}');

let adminUid = '';
export const me = () => adminUid;
export const setAdmin = (uid: string) => {
  adminUid = uid;
};

/* ---------- Định dạng ---------- */

export const money = (n: number) => formatVnd(n, 'vi');
export const when = (v: unknown) => {
  const d = v instanceof Date ? v : toDate(v);
  return d ? formatDateTime(d) : '—';
};
export const str = (d: DocumentData, k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
export const num = (d: DocumentData, k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0);
export const time = (d: DocumentData, k = 'createdAt') => toDate(d[k])?.getTime() ?? 0;

const statusText: Record<string, string> = {
  pending: 'Chờ chuyển khoản',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  cancelled: 'Đã hủy',
  paid: 'Đã thanh toán',
  processing: 'Đang xử lý',
  done: 'Hoàn thành',
  refunded: 'Đã hoàn tiền',
  new: 'Mới',
  contacted: 'Đã liên hệ',
  in_progress: 'Đang triển khai',
  active: 'Đang dùng',
  revoked: 'Đã thu hồi',
};
export const statusLabel = (s: string) => statusText[s] ?? s;
export const badge = (status: string) => h('span', { class: `badge badge--${status}`, text: statusLabel(status) });

/** Lỗi Firestore → chữ dễ hiểu cho chủ. */
export const errText = (err: unknown): string => {
  const code = String((err as { code?: string })?.code ?? '');
  const message = String((err as { message?: string })?.message ?? err);
  if (code.includes('permission-denied')) return 'Firestore từ chối thao tác (luật bảo mật). Dữ liệu có thể đã thay đổi, tải lại rồi thử lần nữa.';
  if (code.includes('unavailable')) return 'Không kết nối được Firestore. Kiểm tra mạng rồi thử lại.';
  const known: Record<string, string> = {
    'already-decided': 'Lệnh nạp này đã được xử lý trước đó.',
    'already-refunded': 'Đơn này đã được hoàn tiền.',
    'not-found': 'Không tìm thấy dữ liệu (có thể đã bị xóa).',
    'negative-balance': 'Số dư sau điều chỉnh sẽ âm, không cho phép.',
    'note-required': 'Cần ghi chú ít nhất 3 ký tự.',
    'invalid-amount': 'Số tiền không hợp lệ.',
    'invalid-machines': 'Số máy phải từ 1 đến 50.',
  };
  const ledger = (err as { name?: string })?.name === 'LedgerError' ? known[code] : undefined;
  return ledger ?? message;
};

/* ---------- Khách hàng (users/ + wallets/) ---------- */

export interface Customer {
  uid: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  createdAt: number;
  balance: number;
}

let customers: Map<string, Customer> | null = null;
let loadingCustomers: Promise<Map<string, Customer>> | null = null;

export const loadCustomers = (force = false): Promise<Map<string, Customer>> => {
  if (customers && !force) return Promise.resolve(customers);
  if (loadingCustomers && !force) return loadingCustomers;
  loadingCustomers = Promise.all([getDocs(collection(db, 'users')), getDocs(collection(db, 'wallets'))])
    .then(([users, wallets]) => {
      const map = new Map<string, Customer>();
      users.docs.forEach((u) => {
        const d = u.data();
        map.set(u.id, {
          uid: u.id,
          name: str(d, 'displayName'),
          email: str(d, 'email'),
          phone: str(d, 'phone'),
          company: str(d, 'company'),
          createdAt: time(d),
          balance: 0,
        });
      });
      wallets.docs.forEach((w) => {
        const c = map.get(w.id) ?? { uid: w.id, name: '', email: '', phone: '', company: '', createdAt: 0, balance: 0 };
        c.balance = num(w.data(), 'balance');
        map.set(w.id, c);
      });
      customers = map;
      return map;
    })
    .finally(() => {
      loadingCustomers = null;
    });
  return loadingCustomers;
};

/** Khách theo email (không phân biệt hoa thường) trong danh sách đã tải. */
export const customerByEmail = async (email: string) => {
  const map = await loadCustomers();
  const e = email.trim().toLowerCase();
  return Array.from(map.values()).find((c) => c.email.toLowerCase() === e);
};

/** "Tên · email" của một uid (để hiện cạnh lệnh nạp / đơn / yêu cầu). */
export const who = (uid: string, fallbackEmail = '') => {
  const c = customers?.get(uid);
  const email = c?.email || fallbackEmail;
  return [c?.name, email].filter(Boolean).join(' · ') || uid;
};

/* ---------- Ô nhập dựng nhanh ---------- */

export interface FieldSpec {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'email' | 'url';
  value?: string | number | boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  required?: boolean;
  maxlength?: number;
  min?: number;
  max?: number;
  rows?: number;
  placeholder?: string;
  inputmode?: string;
  wide?: boolean;
}

let fieldSeq = 0;

/** Dựng một form; trả về form + hàm đọc giá trị + hàm báo lỗi từng ô. */
export const buildForm = (fields: FieldSpec[], submitLabel: string, extraClass = '') => {
  const form = h('form', { class: `acc-form admin-form ${extraClass}`, novalidate: true });
  const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
  const errors = new Map<string, HTMLElement>();
  const grid = h('div', { class: 'admin-form-grid' });
  for (const f of fields) {
    const id = `af-${++fieldSeq}-${f.name}`;
    let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (f.type === 'textarea') {
      input = h('textarea', { id, name: f.name, rows: f.rows ?? 4, maxlength: f.maxlength, placeholder: f.placeholder });
      input.value = String(f.value ?? '');
    } else if (f.type === 'select') {
      input = h('select', { id, name: f.name }, ...(f.options ?? []).map((o) => h('option', { value: o.value, text: o.label })));
      input.value = String(f.value ?? '');
    } else if (f.type === 'checkbox') {
      input = h('input', { id, name: f.name, type: 'checkbox' });
      (input as HTMLInputElement).checked = Boolean(f.value);
    } else {
      input = h('input', {
        id,
        name: f.name,
        type: f.type === 'number' ? 'text' : (f.type ?? 'text'),
        inputmode: f.type === 'number' ? 'numeric' : f.inputmode,
        maxlength: f.maxlength,
        placeholder: f.placeholder,
        autocomplete: 'off',
      });
      input.value = f.value === undefined ? '' : String(f.value);
    }
    inputs.set(f.name, input);
    const error = h('p', { class: 'field-error', id: `${id}-error` });
    errors.set(f.name, error);
    input.setAttribute('aria-describedby', `${id}-error`);
    if (f.type === 'checkbox') {
      grid.append(h('div', { class: `check${f.wide ? ' is-wide' : ''}` }, input, h('label', { for: id, text: f.label })));
    } else {
      grid.append(
        h(
          'div',
          { class: `field${f.wide || f.type === 'textarea' ? ' is-wide' : ''}` },
          h('label', { for: id }, f.label, f.required ? null : h('span', { class: 'optional', text: ' (không bắt buộc)' })),
          input,
          f.hint ? h('p', { class: 'field-hint', text: f.hint }) : null,
          error,
        ),
      );
    }
  }
  const alert = h('div', { class: 'auth-alert', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary', text: submitLabel });
  form.append(grid, alert, h('div', { class: 'acc-actions' }, submit));
  const value = (name: string) => {
    const el = inputs.get(name);
    if (!el) return '';
    return el instanceof HTMLInputElement && el.type === 'checkbox' ? String(el.checked) : el.value.trim();
  };
  const checked = (name: string) => (inputs.get(name) as HTMLInputElement | undefined)?.checked ?? false;
  const setError = (name: string, message = '') => {
    const el = inputs.get(name);
    const out = errors.get(name);
    if (out) out.textContent = message;
    if (message) el?.setAttribute('aria-invalid', 'true');
    else el?.removeAttribute('aria-invalid');
  };
  const clearErrors = () => fields.forEach((f) => setError(f.name));
  const focusFirstError = () => {
    const bad = form.querySelector<HTMLElement>('[aria-invalid="true"]');
    bad?.focus();
    return Boolean(bad);
  };
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    if (t.getAttribute('aria-invalid') === 'true') {
      const name = (t as HTMLInputElement).name;
      setError(name);
    }
  });
  return { form, inputs, value, checked, setError, clearErrors, focusFirstError, alert, submit };
};

/** Số nguyên VNĐ từ ô nhập ("1.000.000", "-200000"); sai dạng → NaN. */
export const parseVnd = (raw: string) => {
  const t = raw.replace(/[\s.,_đ]/gi, '');
  return /^-?\d{1,12}$/.test(t) ? Number(t) : Number.NaN;
};

/** Chuỗi id an toàn từ tiêu đề: "Khóa AI cơ bản" → "khoa-ai-co-ban". */
export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
