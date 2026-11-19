/**
 * THAO TÁC TIỀN & KEY — dùng chung cho trang tài khoản (khách), trang /quan-tri/ (chủ)
 * và bộ test luật bảo mật (firebase/test/*.test.mjs chạy trên Firebase Emulator).
 *
 * File này KHÔNG import gì lúc chạy: hàm Firestore được truyền vào (`sdk`), nên trình duyệt dùng
 * firebase/firestore/lite, còn bộ test dùng SDK đầy đủ — cùng một đoạn code ghi dữ liệu.
 * (Chỉ dùng cú pháp TypeScript "xóa được": interface/type, không enum/namespace — Node chạy thẳng file .ts.)
 *
 * Mọi số tiền là số nguyên VNĐ. Luật kiểm tra từng bước: firestore.rules ở thư mục gốc repo.
 */

/* ---------- Kiểu dữ liệu tối thiểu của SDK (lite và bản đầy đủ đều khớp) ---------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ref = any;
type Db = any;

interface Snap {
  exists(): boolean;
  data(): any;
  id: string;
}

interface Txn {
  get(ref: Ref): Promise<Snap>;
  set(ref: Ref, data: Record<string, unknown>): Txn;
  update(ref: Ref, data: Record<string, unknown>): Txn;
  delete(ref: Ref): Txn;
}

export interface Sdk {
  doc: (...args: any[]) => Ref;
  collection: (...args: any[]) => Ref;
  getDoc: (ref: Ref) => Promise<Snap>;
  getDocs: (q: any) => Promise<{ docs: Snap[] }>;
  setDoc: (ref: Ref, data: Record<string, unknown>) => Promise<void>;
  updateDoc: (ref: Ref, data: Record<string, unknown>) => Promise<void>;
  addDoc: (ref: Ref, data: Record<string, unknown>) => Promise<{ id: string }>;
  runTransaction: <T>(db: Db, fn: (t: Txn) => Promise<T>) => Promise<T>;
  writeBatch: (db: Db) => {
    set(ref: Ref, data: Record<string, unknown>): unknown;
    update(ref: Ref, data: Record<string, unknown>): unknown;
    commit(): Promise<void>;
  };
  serverTimestamp: () => unknown;
}

export type Lang = 'vi' | 'en';

/* ---------- Giới hạn (khớp firestore.rules) ---------- */

export const TOPUP_MIN = 100_000;
export const TOPUP_MAX = 500_000_000;
export const AD_BUDGET_MIN = 500_000;
export const KEY_MAX_MACHINES = 50;

/* ---------- Mã chuyển khoản & key ---------- */

/** Chữ và số dễ đọc: bỏ I, O, 0, 1 (dễ nhầm khi khách gõ nội dung chuyển khoản). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const randomChars = (n: number): string => {
  const out: string[] = [];
  const bytes = new Uint8Array(n * 2);
  crypto.getRandomValues(bytes);
  for (let i = 0; out.length < n; i++) {
    if (i >= bytes.length) {
      crypto.getRandomValues(bytes);
      i = 0;
    }
    // 256 chia hết cho 32: không lệch phân phối
    out.push(CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]);
  }
  return out.join('');
};

/** Mã nội dung chuyển khoản: "ADSN" + 6 ký tự, ví dụ ADSN7K3QPX. */
export const newTopupCode = (): string => `ADSN${randomChars(6)}`;
export const TOPUP_CODE_RE = /^ADSN[A-HJ-NP-Z2-9]{6}$/;

/** Key bản quyền ADS-NOLIMIT AI Office: AINO-XXXX-XXXX-XXXX. */
export const newKey = (): string => `AINO-${randomChars(4)}-${randomChars(4)}-${randomChars(4)}`;
export const KEY_RE = /^AINO-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

/* ---------- Lỗi nghiệp vụ (để giao diện báo rõ) ---------- */

export class LedgerError extends Error {
  code: string;
  shortfall: number;
  constructor(code: string, message?: string, shortfall = 0) {
    super(message ?? code);
    this.name = 'LedgerError';
    this.code = code;
    this.shortfall = shortfall;
  }
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/* ---------- Dữ liệu đơn hàng ---------- */

export interface PurchaseInput {
  uid: string;
  email: string;
  lang: Lang;
  /** 'product' = products/{id} (dịch vụ, ngân sách quảng cáo, key); 'course' = courses/{id} */
  kind: 'product' | 'course';
  productId: string;
  /** Tên hiển thị lưu kèm đơn (theo ngôn ngữ khách đang dùng) */
  name: string;
  qty?: number;
  /** Số tiền khách nhập cho sản phẩm giá thay đổi (ngân sách quảng cáo) */
  amount?: number;
  note?: string;
  adAccountId?: string;
  adAccountName?: string;
}

export interface PurchaseResult {
  orderId: string;
  total: number;
  balanceAfter: number;
}

export const makeOps = (sdk: Sdk, db: Db) => {
  const { doc, collection, serverTimestamp } = sdk;
  const now = () => serverTimestamp();

  /* ======================== KHÁCH ======================== */

  /** Tạo lệnh nạp "chờ chuyển khoản" với mã nội dung chuyển khoản duy nhất (id tài liệu = mã). */
  const createTopup = async (input: { uid: string; email: string; name?: string; amount: number; lang: Lang }) => {
    const { uid, email, name, amount, lang } = input;
    if (!isInt(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX || amount % 1000 !== 0)
      throw new LedgerError('invalid-amount');
    let lastError: unknown = null;
    // Mã trùng (cực hiếm) → luật từ chối (vì thành "sửa" tài liệu đã có) → thử mã khác.
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = newTopupCode();
      const data: Record<string, unknown> = { uid, email, amount, code, status: 'pending', lang, createdAt: now() };
      if (name) data.name = name.slice(0, 120);
      try {
        await sdk.setDoc(doc(db, 'topups', code), data);
        return { code, amount };
      } catch (err) {
        lastError = err;
        const c = String((err as { code?: string })?.code ?? '');
        if (!c.includes('permission-denied')) throw err;
      }
    }
    throw lastError;
  };

  const cancelTopup = (code: string) =>
    sdk.updateDoc(doc(db, 'topups', code), { status: 'cancelled', cancelledAt: now() });

  /**
   * Thanh toán bằng số dư — MỘT transaction: tạo đơn (đã thanh toán) + dòng sổ "thanh toán"
   * + trừ ví (+ quyền học nếu là khóa học). Giá lấy lại từ products/ hoặc courses/ ngay trong transaction.
   * Không đủ số dư: LedgerError('insufficient', …, số tiền còn thiếu).
   */
  const purchase = async (input: PurchaseInput): Promise<PurchaseResult> => {
    const { uid, email, lang, kind, productId } = input;
    const orderRef = doc(collection(db, 'orders'));
    const orderId: string = orderRef.id;
    const walletRef = doc(db, 'wallets', uid);
    return sdk.runTransaction(db, async (t) => {
      const wallet = await t.get(walletRef);
      const balance = wallet.exists() && isInt(wallet.data().balance) ? (wallet.data().balance as number) : 0;

      let type: string;
      let qty = 1;
      let unitPrice: number;
      let total: number;
      if (kind === 'course') {
        const course = await t.get(doc(db, 'courses', productId));
        if (!course.exists() || course.data().published !== true) throw new LedgerError('unavailable');
        const price = course.data().price;
        if (!isInt(price) || price <= 0) throw new LedgerError('unavailable');
        type = 'course';
        unitPrice = price;
        total = price;
      } else {
        const product = await t.get(doc(db, 'products', productId));
        if (!product.exists() || product.data().active !== true) throw new LedgerError('unavailable');
        const p = product.data();
        type = p.type;
        if (p.pricing === 'fixed') {
          qty = input.qty ?? 1;
          if (!isInt(qty) || qty < 1 || qty > (p.maxQty ?? 1)) throw new LedgerError('invalid-qty');
          unitPrice = p.price;
          total = p.price * qty;
        } else {
          const amount = input.amount ?? 0;
          if (!isInt(amount) || amount < p.minAmount || amount > p.maxAmount || amount % 1000 !== 0)
            throw new LedgerError('invalid-amount');
          unitPrice = amount;
          total = amount;
        }
      }
      if (balance < total) throw new LedgerError('insufficient', undefined, total - balance);

      const order: Record<string, unknown> = {
        uid,
        email,
        type,
        productId,
        name: input.name.slice(0, 200),
        qty,
        unitPrice,
        total,
        status: 'paid',
        lang,
        createdAt: now(),
        updatedAt: now(),
      };
      if (input.note) order.note = input.note.slice(0, 1000);
      if (input.adAccountId) order.adAccountId = input.adAccountId.slice(0, 64);
      if (input.adAccountName) order.adAccountName = input.adAccountName.slice(0, 120);

      const balanceAfter = balance - total;
      t.set(orderRef, order);
      t.set(doc(db, 'transactions', orderId), {
        uid,
        type: 'purchase',
        amount: -total,
        balanceAfter,
        refType: 'order',
        refId: orderId,
        createdAt: now(),
      });
      t.update(walletRef, { balance: balanceAfter, updatedAt: now(), lastTx: orderId });
      if (kind === 'course')
        t.set(doc(db, 'courseAccess', `${uid}_${productId}`), {
          uid,
          courseId: productId,
          source: 'purchase',
          orderId,
          createdAt: now(),
        });
      return { orderId, total, balanceAfter };
    });
  };

  /** Khóa học giá 0đ: tự mở quyền học. */
  const unlockFreeCourse = (uid: string, courseId: string) =>
    sdk.setDoc(doc(db, 'courseAccess', `${uid}_${courseId}`), { uid, courseId, source: 'free', createdAt: now() });

  /** Yêu cầu đổi máy (xóa danh sách máy đã kích hoạt) cho một key của mình. */
  const requestMachineReset = (input: { uid: string; email: string; keyId: string; note?: string; lang: Lang }) => {
    const data: Record<string, unknown> = {
      uid: input.uid,
      email: input.email,
      keyId: input.keyId,
      type: 'reset_machines',
      status: 'new',
      lang: input.lang,
      createdAt: now(),
    };
    if (input.note) data.note = input.note.slice(0, 500);
    return sdk.addDoc(collection(db, 'keyRequests'), data);
  };

  /* ======================== CHỦ (QUẢN TRỊ) ======================== */

  /** Duyệt lệnh nạp: lệnh → approved, ghi sổ "topup_<mã>", cộng ví — trong MỘT transaction. */
  const approveTopup = (adminUid: string, code: string) =>
    sdk.runTransaction(db, async (t) => {
      const topupRef = doc(db, 'topups', code);
      const snap = await t.get(topupRef);
      if (!snap.exists()) throw new LedgerError('not-found');
      const topup = snap.data();
      if (topup.status !== 'pending' && topup.status !== 'cancelled') throw new LedgerError('already-decided');
      const walletRef = doc(db, 'wallets', topup.uid);
      const wallet = await t.get(walletRef);
      const before = wallet.exists() ? (wallet.data().balance as number) : 0;
      const balanceAfter = before + (topup.amount as number);
      const txId = `topup_${code}`;
      t.set(doc(db, 'transactions', txId), {
        uid: topup.uid,
        type: 'topup',
        amount: topup.amount,
        balanceAfter,
        refType: 'topup',
        refId: code,
        createdAt: now(),
        by: adminUid,
      });
      t.set(walletRef, { uid: topup.uid, balance: balanceAfter, updatedAt: now(), lastTx: txId });
      t.update(topupRef, { status: 'approved', decidedAt: now(), decidedBy: adminUid, txId });
      return { uid: topup.uid as string, amount: topup.amount as number, balanceAfter };
    });

  const rejectTopup = (adminUid: string, code: string, reason: string) =>
    sdk.updateDoc(doc(db, 'topups', code), {
      status: 'rejected',
      decidedAt: now(),
      decidedBy: adminUid,
      reason: reason.trim().slice(0, 300),
    });

  /** Hoàn tiền đơn: đơn → refunded, ghi sổ "refund_<mã đơn>", cộng lại tổng đơn (khóa học: thu hồi quyền học). */
  const refundOrder = (adminUid: string, orderId: string, adminNote?: string) =>
    sdk.runTransaction(db, async (t) => {
      const orderRef = doc(db, 'orders', orderId);
      const snap = await t.get(orderRef);
      if (!snap.exists()) throw new LedgerError('not-found');
      const order = snap.data();
      if (order.status === 'refunded') throw new LedgerError('already-refunded');
      const walletRef = doc(db, 'wallets', order.uid);
      const wallet = await t.get(walletRef);
      const before = wallet.exists() ? (wallet.data().balance as number) : 0;
      const balanceAfter = before + (order.total as number);
      const txId = `refund_${orderId}`;
      t.set(doc(db, 'transactions', txId), {
        uid: order.uid,
        type: 'refund',
        amount: order.total,
        balanceAfter,
        refType: 'order',
        refId: orderId,
        createdAt: now(),
        by: adminUid,
        ...(adminNote ? { note: adminNote.slice(0, 300) } : {}),
      });
      t.set(walletRef, { uid: order.uid, balance: balanceAfter, updatedAt: now(), lastTx: txId });
      const patch: Record<string, unknown> = { status: 'refunded', updatedAt: now(), refundedAt: now() };
      if (adminNote) patch.adminNote = adminNote.slice(0, 500);
      t.update(orderRef, patch);
      if (order.type === 'course') t.delete(doc(db, 'courseAccess', `${order.uid}_${order.productId}`));
      return { uid: order.uid as string, amount: order.total as number, balanceAfter };
    });

  /** Điều chỉnh số dư bằng tay (cộng hoặc trừ), bắt buộc ghi chú; số dư không được âm. */
  const adjustBalance = (adminUid: string, uid: string, amount: number, note: string) => {
    if (!isInt(amount) || amount === 0) throw new LedgerError('invalid-amount');
    const text = note.trim();
    if (text.length < 3) throw new LedgerError('note-required');
    const txRef = doc(collection(db, 'transactions'));
    return sdk.runTransaction(db, async (t) => {
      const walletRef = doc(db, 'wallets', uid);
      const wallet = await t.get(walletRef);
      const before = wallet.exists() ? (wallet.data().balance as number) : 0;
      const balanceAfter = before + amount;
      if (balanceAfter < 0) throw new LedgerError('negative-balance', undefined, -balanceAfter);
      t.set(txRef, {
        uid,
        type: 'adjust',
        amount,
        balanceAfter,
        note: text.slice(0, 300),
        createdAt: now(),
        by: adminUid,
      });
      t.set(walletRef, { uid, balance: balanceAfter, updatedAt: now(), lastTx: txRef.id });
      return { txId: txRef.id as string, balanceAfter };
    });
  };

  /** Cấp key mới cho khách (id tài liệu = key, không trùng). */
  const issueKey = async (
    adminUid: string,
    input: { uid: string; email: string; plan: string; maxMachines: number; note?: string },
  ) => {
    if (!isInt(input.maxMachines) || input.maxMachines < 1 || input.maxMachines > KEY_MAX_MACHINES)
      throw new LedgerError('invalid-machines');
    return sdk.runTransaction(db, async (t) => {
      let key = newKey();
      for (let i = 0; i < 3; i++) {
        const existing = await t.get(doc(db, 'keys', key));
        if (!existing.exists()) break;
        key = newKey();
      }
      const data: Record<string, unknown> = {
        uid: input.uid,
        email: input.email,
        key,
        plan: input.plan.trim().slice(0, 60),
        maxMachines: input.maxMachines,
        machines: [],
        status: 'active',
        createdAt: now(),
        updatedAt: now(),
        issuedBy: adminUid,
      };
      if (input.note) data.note = input.note.trim().slice(0, 300);
      t.set(doc(db, 'keys', key), data);
      return key;
    });
  };

  const resetMachines = (key: string) => sdk.updateDoc(doc(db, 'keys', key), { machines: [], updatedAt: now() });

  const setKeyStatus = (key: string, status: 'active' | 'revoked') =>
    sdk.updateDoc(doc(db, 'keys', key), { status, updatedAt: now() });

  /** Ghi bảng giá (products/) từ danh mục trong code; sản phẩm không còn trong danh mục thì tắt. */
  const syncProducts = async (products: Record<string, unknown>[]) => {
    const existing = await sdk.getDocs(collection(db, 'products'));
    const ids = new Set(products.map((p) => p.id as string));
    const batch = sdk.writeBatch(db);
    products.forEach((p) => batch.set(doc(db, 'products', p.id as string), { ...p, updatedAt: now() }));
    existing.docs
      .filter((d) => !ids.has(d.id) && d.data().active !== false)
      .forEach((d) => batch.update(doc(db, 'products', d.id), { active: false, updatedAt: now() }));
    await batch.commit();
    return { written: products.length, disabled: existing.docs.filter((d) => !ids.has(d.id)).length };
  };

  return {
    createTopup,
    cancelTopup,
    purchase,
    unlockFreeCourse,
    requestMachineReset,
    approveTopup,
    rejectTopup,
    refundOrder,
    adjustBalance,
    issueKey,
    resetMachines,
    setKeyStatus,
    syncProducts,
  };
};

export type Ops = ReturnType<typeof makeOps>;
