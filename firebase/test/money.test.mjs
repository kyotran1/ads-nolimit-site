// Test luật bảo mật cho phần TIỀN & NỘI DUNG (V4): ví, sổ giao dịch, nạp tiền, đơn hàng, hoàn tiền,
// bảng giá, khóa học, hướng dẫn, key & máy, cài đặt thanh toán, quản trị viên.
// Chạy: cd firebase && npm ci && npm test (Firebase Emulator, dự án giả "demo-ads-nolimit").
//
// Các thao tác hợp lệ dùng ĐÚNG code của website (src/lib/ledger/ops.ts) với SDK đầy đủ;
// các phép thử tấn công tự ghi tay (writeBatch / runTransaction) để chắc luật chặn được.
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  runTransaction,
  writeBatch,
  serverTimestamp,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { makeOps, LedgerError } from '../../src/lib/ledger/ops.ts';

let env;
const OWNER = { uid: 'owner', email: 'owner@example.com' };
const ALICE = { uid: 'alice', email: 'alice@example.com' };
const BOB = { uid: 'bob', email: 'bob@example.com' };
const CAROL = { uid: 'carol', email: 'carol@example.com' };

const sdk = { doc, collection, getDoc, getDocs, setDoc, updateDoc, addDoc, runTransaction, writeBatch, serverTimestamp };
const as = (u) => env.authenticatedContext(u.uid, { email: u.email, email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const opsFor = (u) => makeOps(sdk, as(u));
const T0 = Timestamp.fromDate(new Date('2026-11-01T08:00:00Z'));

/** Đọc dữ liệu bỏ qua luật (để kiểm tra kết quả). */
const peek = async (path) => {
  let data = null;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), path));
    data = snap.exists() ? snap.data() : null;
  });
  return data;
};
const seed = (fn) => env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
const balanceOf = async (uid) => (await peek(`wallets/${uid}`))?.balance ?? 0;

const product = (id, extra) => ({
  id,
  planId: id.split('-').slice(0, 2).join('-'),
  type: 'service',
  pricing: 'fixed',
  price: 990_000,
  priceUsd: 39,
  maxQty: 1,
  name: { vi: `SP ${id}`, en: `Item ${id}` },
  active: true,
  sort: 1,
  updatedAt: T0,
  ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ads-nolimit',
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});
after(async () => env && env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'admins/owner'), { name: 'Chủ' });
    await setDoc(doc(db, 'users/alice'), { displayName: 'Alice', email: ALICE.email, createdAt: T0, updatedAt: T0 });
    await setDoc(doc(db, 'users/bob'), { displayName: 'Bob', email: BOB.email, createdAt: T0, updatedAt: T0 });
    await setDoc(doc(db, 'wallets/alice'), { uid: 'alice', balance: 6_000_000, updatedAt: T0, lastTx: 'seed_alice' });
    await setDoc(doc(db, 'wallets/bob'), { uid: 'bob', balance: 300_000, updatedAt: T0, lastTx: 'seed_bob' });
    await setDoc(doc(db, 'transactions/seed_alice'), {
      uid: 'alice', type: 'adjust', amount: 6_000_000, balanceAfter: 6_000_000, note: 'seed', createdAt: T0, by: 'owner',
    });
    await setDoc(doc(db, 'transactions/seed_bob'), {
      uid: 'bob', type: 'adjust', amount: 300_000, balanceAfter: 300_000, note: 'seed', createdAt: T0, by: 'owner',
    });
    await setDoc(doc(db, 'products/ai-starter-setup'), product('ai-starter-setup', { price: 4_900_000, priceUsd: 189 }));
    await setDoc(doc(db, 'products/ai-starter-monthly'), product('ai-starter-monthly', { maxQty: 12 }));
    await setDoc(doc(db, 'products/training-workshop'), product('training-workshop', { maxQty: 20 }));
    await setDoc(doc(db, 'products/ad-budget'), {
      id: 'ad-budget', type: 'ad_budget', pricing: 'variable', minAmount: 500_000, maxAmount: 500_000_000,
      name: { vi: 'Nạp ngân sách quảng cáo', en: 'Ad budget top-up' }, active: true, sort: 9, updatedAt: T0,
    });
    await setDoc(doc(db, 'products/old-item'), product('old-item', { price: 100_000, active: false }));
    await setDoc(doc(db, 'courses/course-a'), { title: 'Khóa A', price: 1_000_000, published: true, sort: 1, updatedAt: T0 });
    await setDoc(doc(db, 'courses/course-free'), { title: 'Khóa miễn phí', price: 0, published: true, sort: 2, updatedAt: T0 });
    await setDoc(doc(db, 'courses/course-draft'), { title: 'Nháp', price: 500_000, published: false, sort: 3, updatedAt: T0 });
    await setDoc(doc(db, 'courses/course-a/lessons/l1'), { title: 'Bài 1', videoUrl: 'https://youtu.be/abc', duration: '10:00', sort: 1, updatedAt: T0 });
    await setDoc(doc(db, 'courses/course-free/lessons/l1'), { title: 'Bài 1', videoUrl: '', sort: 1, updatedAt: T0 });
    await setDoc(doc(db, 'courseAccess/bob_course-a'), { uid: 'bob', courseId: 'course-a', source: 'admin', by: 'owner', createdAt: T0 });
    await setDoc(doc(db, 'topups/ADSNAAAAAA'), { uid: 'alice', email: ALICE.email, amount: 1_000_000, code: 'ADSNAAAAAA', status: 'pending', lang: 'vi', createdAt: T0 });
    await setDoc(doc(db, 'topups/ADSNBBBBBB'), { uid: 'bob', email: BOB.email, amount: 500_000, code: 'ADSNBBBBBB', status: 'pending', lang: 'vi', createdAt: T0 });
    await setDoc(doc(db, 'topups/ADSNCCCCCC'), { uid: 'alice', email: ALICE.email, amount: 200_000, code: 'ADSNCCCCCC', status: 'cancelled', lang: 'vi', createdAt: T0 });
    await setDoc(doc(db, 'orders/order-bob'), {
      uid: 'bob', email: BOB.email, type: 'service', productId: 'training-workshop', name: 'Workshop', qty: 1, unitPrice: 990_000,
      total: 990_000, status: 'paid', lang: 'vi', createdAt: T0, updatedAt: T0,
    });
    await setDoc(doc(db, 'keys/AINO-AAAA-BBBB-CCCC'), {
      uid: 'alice', email: ALICE.email, key: 'AINO-AAAA-BBBB-CCCC', plan: 'Pro', maxMachines: 2,
      machines: [{ id: 'm1', name: 'PC văn phòng', activatedAt: T0 }], status: 'active', createdAt: T0, updatedAt: T0, issuedBy: 'owner',
    });
    await setDoc(doc(db, 'keys/AINO-DDDD-EEEE-FFFF'), {
      uid: 'bob', email: BOB.email, key: 'AINO-DDDD-EEEE-FFFF', plan: 'Basic', maxMachines: 1, machines: [], status: 'active',
      createdAt: T0, updatedAt: T0, issuedBy: 'owner',
    });
    await setDoc(doc(db, 'settings/payment'), {
      bankBin: '970436', bankName: 'Vietcombank', accountNumber: '0123456789', accountName: 'NGUYEN VAN A', updatedAt: T0, updatedBy: 'owner',
    });
    await setDoc(doc(db, 'guides/g1'), { title: 'Cách nạp tiền', category: 'Tài khoản', body: 'Nội dung', published: true, sort: 1, updatedAt: T0 });
    await setDoc(doc(db, 'guides/g2'), { title: 'Bản nháp', category: 'Tài khoản', body: '…', published: false, sort: 2, updatedAt: T0 });
    await setDoc(doc(db, 'requests/req-bob'), { uid: 'bob', planId: 'ads', note: 'x', lang: 'vi', status: 'new', createdAt: T0 });
  });
});

/* ---------- Ghi tay một lần mua (để thử giả mạo) ---------- */
const forgeOrder = (u, oid, extra = {}) => ({
  uid: u.uid,
  email: u.email,
  type: 'service',
  productId: 'training-workshop',
  name: 'Workshop',
  qty: 1,
  unitPrice: 990_000,
  total: 990_000,
  status: 'paid',
  lang: 'vi',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
});
const forgeTx = (u, oid, amount, balanceAfter, extra = {}) => ({
  uid: u.uid,
  type: 'purchase',
  amount,
  balanceAfter,
  refType: 'order',
  refId: oid,
  createdAt: serverTimestamp(),
  ...extra,
});
/**
 * Một lần mua ghi tay: order + transaction + wallet (+ courseAccess).
 * `skip`: bỏ một phần ('order' | 'tx' | 'wallet'); các tham số khác ghi đè từng phần.
 */
const forgeBuy = (u, { oid = `f${Math.random().toString(36).slice(2, 10)}`, before, total = 990_000, order = {}, tx = {}, wallet = {}, access, skip = [] } = {}) => {
  const db = as(u);
  const b = writeBatch(db);
  const after = before - total;
  if (!skip.includes('order')) b.set(doc(db, 'orders', oid), forgeOrder(u, oid, { total, unitPrice: total, ...order }));
  if (!skip.includes('tx')) b.set(doc(db, 'transactions', oid), forgeTx(u, oid, -total, after, tx));
  if (!skip.includes('wallet')) b.update(doc(db, 'wallets', u.uid), { balance: after, updatedAt: serverTimestamp(), lastTx: oid, ...wallet });
  if (access) b.set(doc(db, 'courseAccess', `${u.uid}_${access.courseId}`), { uid: u.uid, source: 'purchase', orderId: oid, createdAt: serverTimestamp(), ...access });
  return b.commit();
};

// =====================================================================
describe('ví & sổ giao dịch: chỉ đọc của mình', () => {
  test('khách đọc ví của mình: được; ví người khác / liệt kê ví: bị chặn', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), 'wallets/alice')));
    await assertFails(getDoc(doc(as(ALICE), 'wallets/bob')));
    await assertFails(getDocs(collection(as(ALICE), 'wallets')));
    await assertFails(getDoc(doc(anon(), 'wallets/alice')));
  });
  test('quản trị viên liệt kê mọi ví: được', async () => {
    await assertSucceeds(getDocs(collection(as(OWNER), 'wallets')));
  });
  test('khách truy vấn sổ giao dịch của mình: được; của người khác / toàn bộ: bị chặn', async () => {
    const snap = await assertSucceeds(getDocs(query(collection(as(ALICE), 'transactions'), where('uid', '==', 'alice'))));
    assert.equal(snap.size, 1);
    await assertFails(getDocs(query(collection(as(ALICE), 'transactions'), where('uid', '==', 'bob'))));
    await assertFails(getDocs(collection(as(ALICE), 'transactions')));
    await assertFails(getDoc(doc(as(ALICE), 'transactions/seed_bob')));
  });
});

describe('giả mạo số dư: luôn bị chặn', () => {
  test('tự tăng số dư (không có đơn hàng): bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'wallets/alice'), { balance: 99_000_000, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as(ALICE), 'wallets/alice'), { balance: increment(1_000_000), updatedAt: serverTimestamp(), lastTx: 'x1' }));
  });
  test('tự giảm số dư mà không có đơn hàng: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'wallets/alice'), { balance: 5_000_000, updatedAt: serverTimestamp(), lastTx: 'nope' }));
  });
  test('tự tạo ví (chưa có ví) / tạo lại ví / xóa ví: bị chặn', async () => {
    await assertFails(setDoc(doc(as(CAROL), 'wallets/carol'), { uid: 'carol', balance: 1_000_000, updatedAt: serverTimestamp(), lastTx: 'x' }));
    await assertFails(setDoc(doc(as(ALICE), 'wallets/alice'), { uid: 'alice', balance: 9_000_000, updatedAt: serverTimestamp(), lastTx: 'x' }));
    await assertFails(deleteDoc(doc(as(ALICE), 'wallets/alice')));
  });
  test('ghi ví người khác: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'wallets/bob'), { balance: 0, updatedAt: serverTimestamp(), lastTx: 'x' }));
  });
  test('tự ghi sổ loại nạp / điều chỉnh / hoàn tiền: bị chặn', async () => {
    for (const type of ['topup', 'adjust', 'refund']) {
      await assertFails(
        setDoc(doc(as(ALICE), `transactions/fake-${type}`), {
          uid: 'alice', type, amount: 5_000_000, balanceAfter: 11_000_000, note: 'tự cộng', createdAt: serverTimestamp(),
        }),
      );
    }
  });
  test('tự cộng tiền kèm "đơn hàng" giá âm: bị chặn', async () => {
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, total: -1_000_000 }));
  });
  test('sửa / xóa một dòng sổ: bị chặn (kể cả quản trị viên)', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'transactions/seed_alice'), { amount: 9_000_000 }));
    await assertFails(deleteDoc(doc(as(ALICE), 'transactions/seed_alice')));
    await assertFails(updateDoc(doc(as(OWNER), 'transactions/seed_alice'), { amount: 9_000_000 }));
    await assertFails(deleteDoc(doc(as(OWNER), 'transactions/seed_alice')));
  });
});

// =====================================================================
describe('thanh toán bằng số dư', () => {
  test('mua gói giá cố định (code website): được, ví trừ đúng, có đơn + dòng sổ', async () => {
    const r = await assertSucceeds(
      opsFor(ALICE).purchase({ uid: 'alice', email: ALICE.email, lang: 'vi', kind: 'product', productId: 'ai-starter-setup', name: 'AI Agent Khởi đầu — Cài đặt' }),
    );
    assert.equal(r.total, 4_900_000);
    assert.equal(await balanceOf('alice'), 1_100_000);
    const order = await peek(`orders/${r.orderId}`);
    assert.equal(order.status, 'paid');
    assert.equal(order.total, 4_900_000);
    const tx = await peek(`transactions/${r.orderId}`);
    assert.equal(tx.amount, -4_900_000);
    assert.equal(tx.balanceAfter, 1_100_000);
    assert.equal((await peek('wallets/alice')).lastTx, r.orderId);
  });
  test('mua nhiều đơn vị (3 người học workshop): được', async () => {
    const r = await assertSucceeds(
      opsFor(ALICE).purchase({ uid: 'alice', email: ALICE.email, lang: 'vi', kind: 'product', productId: 'training-workshop', qty: 3, name: 'Workshop' }),
    );
    assert.equal(r.total, 2_970_000);
    assert.equal(await balanceOf('alice'), 3_030_000);
  });
  test('nạp ngân sách quảng cáo (số tiền khách nhập, có ID tài khoản): được', async () => {
    const r = await assertSucceeds(
      opsFor(ALICE).purchase({
        uid: 'alice', email: ALICE.email, lang: 'vi', kind: 'product', productId: 'ad-budget', amount: 1_500_000,
        name: 'Nạp ngân sách quảng cáo', adAccountId: 'act_123456789', adAccountName: 'Shop Alice', note: 'Chạy tết',
      }),
    );
    assert.equal(r.total, 1_500_000);
    assert.equal(await balanceOf('alice'), 4_500_000);
  });
  test('không đủ số dư: code website báo thiếu bao nhiêu, không ghi gì', async () => {
    await assert.rejects(
      opsFor(BOB).purchase({ uid: 'bob', email: BOB.email, lang: 'vi', kind: 'product', productId: 'training-workshop', name: 'W' }),
      (err) => err instanceof LedgerError && err.code === 'insufficient' && err.shortfall === 690_000,
    );
    assert.equal(await balanceOf('bob'), 300_000);
  });
  test('ghi tay khi không đủ số dư (số dư âm): bị chặn', async () => {
    await assertFails(forgeBuy(BOB, { before: 300_000, total: 990_000 }));
    assert.equal(await balanceOf('bob'), 300_000);
  });
  test('ghi tay đúng giá: được (đối chứng cho các phép thử bên dưới)', async () => {
    await assertSucceeds(forgeBuy(ALICE, { before: 6_000_000 }));
    assert.equal(await balanceOf('alice'), 5_010_000);
  });
  test('đổi giá (rẻ hơn bảng giá): bị chặn', async () => {
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, total: 1_000 }));
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, total: 990_000, order: { unitPrice: 1_000, total: 990_000 } }));
  });
  test('tổng đơn khác đơn giá × số lượng: bị chặn', async () => {
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, total: 990_000, order: { qty: 3 } }));
  });
  test('số lượng vượt mức tối đa / bằng 0: bị chặn', async () => {
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, total: 990_000 * 21, order: { qty: 21, unitPrice: 990_000 } }));
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, total: 0, order: { qty: 0, unitPrice: 990_000 } }));
  });
  test('sản phẩm đã tắt / không tồn tại / sai loại: bị chặn', async () => {
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, total: 100_000, order: { productId: 'old-item' } }));
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, total: 100_000, order: { productId: 'free-money' } }));
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, total: 990_000, order: { type: 'key' } }));
  });
  test('ngân sách quảng cáo dưới mức tối thiểu / lẻ nghìn / thiếu ID tài khoản: bị chặn', async () => {
    const ad = (total, extra = {}) => ({ type: 'ad_budget', productId: 'ad-budget', adAccountId: 'act_1', ...extra });
    await assertSucceeds(forgeBuy(ALICE, { before: 6_000_000, total: 500_000, order: ad(500_000) }));
    await assertFails(forgeBuy(ALICE, { before: 5_500_000, total: 400_000, order: ad(400_000) }));
    await assertFails(forgeBuy(ALICE, { before: 5_500_000, total: 500_500, order: ad(500_500) }));
    await assertFails(forgeBuy(ALICE, { before: 5_500_000, total: 600_000, order: { type: 'ad_budget', productId: 'ad-budget' } }));
  });
  test('đơn không trừ ví: bị chặn', async () => {
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, skip: ['wallet'] }));
  });
  test('đơn + trừ ví nhưng thiếu dòng sổ: bị chặn', async () => {
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, skip: ['tx'] }));
  });
  test('trừ ví + dòng sổ nhưng không có đơn: bị chặn', async () => {
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, skip: ['order'] }));
  });
  test('ví trừ ít hơn / nhiều hơn tổng đơn: bị chặn', async () => {
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, wallet: { balance: 5_500_000 }, tx: { balanceAfter: 5_500_000 } }));
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, wallet: { balance: 4_000_000 }, tx: { balanceAfter: 4_000_000 } }));
  });
  test('dòng sổ ghi sai số tiền / sai số dư sau / sai tham chiếu: bị chặn', async () => {
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, tx: { amount: -1 } }));
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, tx: { balanceAfter: 9_000_000 } }));
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, tx: { refId: 'order-bob' } }));
  });
  test('đơn trạng thái "hoàn thành"/"đã hoàn tiền" ngay khi tạo: bị chặn', async () => {
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, order: { status: 'done' } }));
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, order: { status: 'refunded' } }));
  });
  test('đơn mang uid / email người khác: bị chặn', async () => {
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, order: { uid: 'bob' } }));
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, order: { email: 'other@example.com' } }));
  });
  test('trừ ví người khác để trả đơn của mình: bị chặn', async () => {
    const db = as(ALICE);
    const b = writeBatch(db);
    b.set(doc(db, 'orders/steal1'), forgeOrder(ALICE, 'steal1'));
    b.set(doc(db, 'transactions/steal1'), forgeTx(ALICE, 'steal1', -990_000, 5_010_000));
    b.update(doc(db, 'wallets/bob'), { balance: 0, updatedAt: serverTimestamp(), lastTx: 'steal1' });
    await assertFails(b.commit());
  });
  test('dùng lại một đơn cũ để trừ ví lần nữa (lastTx = đơn đã có): bị chặn', async () => {
    const r = await opsFor(ALICE).purchase({ uid: 'alice', email: ALICE.email, lang: 'vi', kind: 'product', productId: 'training-workshop', name: 'W' });
    await assertFails(updateDoc(doc(as(ALICE), 'wallets/alice'), { balance: 5_010_000 - 990_000, updatedAt: serverTimestamp(), lastTx: r.orderId }));
  });
  test('tiêu hai lần cùng lúc (double-spend): chỉ một đơn thành công, số dư không âm', async () => {
    const buy = () =>
      opsFor(ALICE).purchase({ uid: 'alice', email: ALICE.email, lang: 'vi', kind: 'product', productId: 'ai-starter-setup', name: 'Setup' });
    const results = await Promise.allSettled([buy(), buy()]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    assert.equal(ok.length, 1, `một đơn thành công, nhận ${ok.length}`);
    assert.equal(await balanceOf('alice'), 1_100_000);
    let orders = 0;
    await seed(async (db) => {
      orders = (await getDocs(query(collection(db, 'orders'), where('uid', '==', 'alice')))).size;
    });
    assert.equal(orders, 1);
  });
  test('ghi tay từ số dư cũ sau khi đã tiêu (stale): bị chặn', async () => {
    await assertSucceeds(forgeBuy(ALICE, { before: 6_000_000 }));
    await assertFails(forgeBuy(ALICE, { before: 6_000_000 }));
    assert.equal(await balanceOf('alice'), 5_010_000);
  });
  test('đọc đơn của mình: được; của người khác / toàn bộ: bị chặn', async () => {
    await assertSucceeds(getDocs(query(collection(as(BOB), 'orders'), where('uid', '==', 'bob'))));
    await assertFails(getDoc(doc(as(ALICE), 'orders/order-bob')));
    await assertFails(getDocs(collection(as(ALICE), 'orders')));
  });
  test('khách tự đổi trạng thái / tổng tiền / xóa đơn của mình: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(BOB), 'orders/order-bob'), { status: 'done', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as(BOB), 'orders/order-bob'), { status: 'cancelled', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as(BOB), 'orders/order-bob'), { total: 1, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(as(BOB), 'orders/order-bob')));
  });
});

// =====================================================================
describe('khóa học: mở khóa bằng số dư, bài học chỉ đọc khi có quyền', () => {
  const buyCourse = (u, courseId) =>
    opsFor(u).purchase({ uid: u.uid, email: u.email, lang: 'vi', kind: 'course', productId: courseId, name: `Khóa ${courseId}` });

  test('chưa mua: đọc bài học bị chặn; đọc thông tin khóa (đã đăng): được', async () => {
    await assertFails(getDocs(collection(as(ALICE), 'courses/course-a/lessons')));
    await assertSucceeds(getDoc(doc(as(ALICE), 'courses/course-a')));
    await assertSucceeds(getDocs(query(collection(as(ALICE), 'courses'), where('published', '==', true))));
  });
  test('khóa chưa đăng: khách không đọc được, quản trị viên đọc được', async () => {
    await assertFails(getDoc(doc(as(ALICE), 'courses/course-draft')));
    await assertFails(getDocs(collection(as(ALICE), 'courses')));
    await assertSucceeds(getDocs(collection(as(OWNER), 'courses')));
  });
  test('mua khóa học (code website): được, có quyền học, đọc được bài học', async () => {
    const r = await assertSucceeds(buyCourse(ALICE, 'course-a'));
    assert.equal(r.total, 1_000_000);
    assert.equal(await balanceOf('alice'), 5_000_000);
    assert.ok(await peek('courseAccess/alice_course-a'));
    await assertSucceeds(getDocs(collection(as(ALICE), 'courses/course-a/lessons')));
  });
  test('mua lại khóa đã có: bị chặn, không trừ tiền', async () => {
    await buyCourse(ALICE, 'course-a');
    await assertFails(buyCourse(ALICE, 'course-a'));
    assert.equal(await balanceOf('alice'), 5_000_000);
  });
  test('mua khóa chưa đăng: bị chặn', async () => {
    await assert.rejects(buyCourse(ALICE, 'course-draft'));
    const r = await forgeBuy(ALICE, {
      before: 6_000_000, total: 500_000, order: { type: 'course', productId: 'course-draft' }, access: { courseId: 'course-draft' },
    }).then(() => 'ok', () => 'denied');
    assert.equal(r, 'denied');
  });
  test('đơn khóa học nhưng không tạo quyền học / giá sai: bị chặn', async () => {
    await assertFails(forgeBuy(ALICE, { before: 6_000_000, total: 1_000_000, order: { type: 'course', productId: 'course-a' } }));
    await assertFails(
      forgeBuy(ALICE, { before: 6_000_000, total: 1_000, order: { type: 'course', productId: 'course-a' }, access: { courseId: 'course-a' } }),
    );
  });
  test('tự tạo quyền học (không mua / trỏ tới đơn cũ / nguồn "admin"): bị chặn', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'courseAccess/alice_course-a'), { uid: 'alice', courseId: 'course-a', source: 'purchase', orderId: 'order-bob', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as(ALICE), 'courseAccess/alice_course-a'), { uid: 'alice', courseId: 'course-a', source: 'admin', by: 'owner', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as(ALICE), 'courseAccess/alice_course-a'), { uid: 'alice', courseId: 'course-a', source: 'free', createdAt: serverTimestamp() }));
  });
  test('khóa miễn phí: tự mở được; đọc bài học được', async () => {
    await assertSucceeds(opsFor(ALICE).unlockFreeCourse('alice', 'course-free'));
    await assertSucceeds(getDocs(collection(as(ALICE), 'courses/course-free/lessons')));
  });
  test('được quản trị viên cấp quyền: đọc bài học được; người khác không', async () => {
    await assertSucceeds(getDocs(collection(as(BOB), 'courses/course-a/lessons')));
    await assertFails(getDocs(collection(as(CAROL), 'courses/course-a/lessons')));
  });
  test('khách xóa / sửa quyền học, sửa khóa học, thêm bài học: bị chặn', async () => {
    await assertFails(deleteDoc(doc(as(BOB), 'courseAccess/bob_course-a')));
    await assertFails(updateDoc(doc(as(BOB), 'courseAccess/bob_course-a'), { courseId: 'x' }));
    await assertFails(updateDoc(doc(as(ALICE), 'courses/course-a'), { price: 1, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as(ALICE), 'courses/course-a/lessons/l9'), { title: 'x', updatedAt: serverTimestamp() }));
  });
  test('quản trị viên tạo / sửa khóa học, bài học, cấp và thu hồi quyền: được', async () => {
    const db = as(OWNER);
    await assertSucceeds(setDoc(doc(db, 'courses/course-b'), { title: 'Khóa B', price: 2_000_000, priceUsd: 79, cover: 'aurora', published: true, sort: 4, outline: [{ title: 'Bài 1', duration: '05:00' }], updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(db, 'courses/course-b/lessons/l1'), { title: 'Bài 1', videoUrl: 'https://youtu.be/x', duration: '05:00', sort: 1, updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(db, 'courseAccess/alice_course-b'), { uid: 'alice', courseId: 'course-b', source: 'admin', by: 'owner', createdAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(db, 'courseAccess/bob_course-a')));
  });
  test('quản trị viên: link video không phải https / giá âm: bị chặn', async () => {
    await assertFails(setDoc(doc(as(OWNER), 'courses/course-a/lessons/l2'), { title: 'x', videoUrl: 'javascript:alert(1)', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as(OWNER), 'courses/course-x'), { title: 'x', price: -5, published: true, updatedAt: serverTimestamp() }));
  });
});

// =====================================================================
describe('lệnh nạp tiền', () => {
  const topup = (u, extra = {}, code = 'ADSNZZZZ22') =>
    setDoc(doc(as(u), `topups/${code}`), {
      uid: u.uid, email: u.email, amount: 1_000_000, code, status: 'pending', lang: 'vi', createdAt: serverTimestamp(), ...extra,
    });

  test('tạo lệnh nạp (code website): được, mã ADSN + 6 ký tự, trạng thái chờ', async () => {
    const r = await assertSucceeds(opsFor(ALICE).createTopup({ uid: 'alice', email: ALICE.email, name: 'Alice', amount: 2_000_000, lang: 'vi' }));
    assert.match(r.code, /^ADSN[A-HJ-NP-Z2-9]{6}$/);
    const t = await peek(`topups/${r.code}`);
    assert.equal(t.status, 'pending');
    assert.equal(t.amount, 2_000_000);
  });
  test('số tiền ngoài giới hạn / lẻ nghìn / không phải số nguyên: bị chặn', async () => {
    await assertSucceeds(topup(ALICE, { amount: 100_000 }, 'ADSNZZZZ23'));
    await assertSucceeds(topup(ALICE, { amount: 500_000_000 }, 'ADSNZZZZ24'));
    await assertFails(topup(ALICE, { amount: 99_000 }));
    await assertFails(topup(ALICE, { amount: 500_001_000 }));
    await assertFails(topup(ALICE, { amount: 150_500 }));
    await assertFails(topup(ALICE, { amount: 100_000.5 }));
    await assertFails(topup(ALICE, { amount: '1000000' }));
  });
  test('tạo lệnh đã duyệt / mang uid, email người khác / mã sai / giờ tự đặt / trường lạ: bị chặn', async () => {
    await assertFails(topup(ALICE, { status: 'approved' }));
    await assertFails(topup(ALICE, { uid: 'bob' }));
    await assertFails(topup(ALICE, { email: BOB.email }));
    await assertFails(topup(ALICE, { code: 'ADSNOTHER2' }));
    await assertFails(topup(ALICE, { code: 'ADSN0000I1' }, 'ADSN0000I1'));
    await assertFails(topup(ALICE, { createdAt: T0 }));
    await assertFails(topup(ALICE, { bonus: 1 }));
  });
  test('mã trùng một lệnh đã có: bị chặn (không ghi đè lệnh của người khác)', async () => {
    await assertFails(topup(ALICE, { code: 'ADSNBBBBBB' }, 'ADSNBBBBBB'));
    assert.equal((await peek('topups/ADSNBBBBBB')).uid, 'bob');
  });
  test('đọc lệnh nạp của mình: được; của người khác: bị chặn', async () => {
    const snap = await assertSucceeds(getDocs(query(collection(as(ALICE), 'topups'), where('uid', '==', 'alice'))));
    assert.equal(snap.size, 2);
    await assertFails(getDoc(doc(as(ALICE), 'topups/ADSNBBBBBB')));
    await assertFails(getDocs(collection(as(ALICE), 'topups')));
  });
  test('khách hủy lệnh chờ của mình: được; hủy lệnh người khác: bị chặn', async () => {
    await assertSucceeds(opsFor(ALICE).cancelTopup('ADSNAAAAAA'));
    await assertFails(opsFor(ALICE).cancelTopup('ADSNBBBBBB'));
  });
  test('khách tự duyệt / đổi số tiền / hủy lệnh đã duyệt: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'topups/ADSNAAAAAA'), { status: 'approved' }));
    await assertFails(updateDoc(doc(as(ALICE), 'topups/ADSNAAAAAA'), { amount: 9_000_000 }));
    await assertFails(updateDoc(doc(as(ALICE), 'topups/ADSNAAAAAA'), { status: 'cancelled', cancelledAt: serverTimestamp(), amount: 1 }));
    await opsFor(OWNER).approveTopup('owner', 'ADSNAAAAAA');
    await assertFails(opsFor(ALICE).cancelTopup('ADSNAAAAAA'));
  });
  test('khách chạy thao tác "duyệt" của trang quản trị: bị chặn, số dư không đổi', async () => {
    await assertFails(opsFor(ALICE).approveTopup('alice', 'ADSNAAAAAA'));
    assert.equal(await balanceOf('alice'), 6_000_000);
    assert.equal((await peek('topups/ADSNAAAAAA')).status, 'pending');
  });
  test('khách tự ghi trọn bộ "duyệt" (lệnh + sổ + ví): bị chặn', async () => {
    const db = as(ALICE);
    const b = writeBatch(db);
    b.update(doc(db, 'topups/ADSNAAAAAA'), { status: 'approved', decidedAt: serverTimestamp(), decidedBy: 'alice', txId: 'topup_ADSNAAAAAA' });
    b.set(doc(db, 'transactions/topup_ADSNAAAAAA'), {
      uid: 'alice', type: 'topup', amount: 1_000_000, balanceAfter: 7_000_000, refType: 'topup', refId: 'ADSNAAAAAA', createdAt: serverTimestamp(), by: 'alice',
    });
    b.set(doc(db, 'wallets/alice'), { uid: 'alice', balance: 7_000_000, updatedAt: serverTimestamp(), lastTx: 'topup_ADSNAAAAAA' });
    await assertFails(b.commit());
  });
  test('quản trị viên duyệt (code website): lệnh approved, ví cộng, có dòng sổ topup_<mã>', async () => {
    const r = await assertSucceeds(opsFor(OWNER).approveTopup('owner', 'ADSNAAAAAA'));
    assert.equal(r.balanceAfter, 7_000_000);
    assert.equal(await balanceOf('alice'), 7_000_000);
    const t = await peek('topups/ADSNAAAAAA');
    assert.equal(t.status, 'approved');
    assert.equal(t.txId, 'topup_ADSNAAAAAA');
    const tx = await peek('transactions/topup_ADSNAAAAAA');
    assert.equal(tx.type, 'topup');
    assert.equal(tx.amount, 1_000_000);
    assert.equal(tx.by, 'owner');
  });
  test('duyệt hai lần: lần hai bị chặn, chỉ cộng một lần', async () => {
    await opsFor(OWNER).approveTopup('owner', 'ADSNAAAAAA');
    await assert.rejects(opsFor(OWNER).approveTopup('owner', 'ADSNAAAAAA'));
    // ép ghi tay lần hai
    const db = as(OWNER);
    await assertFails(
      runTransaction(db, async (t) => {
        t.set(doc(db, 'transactions/topup_ADSNAAAAAA'), {
          uid: 'alice', type: 'topup', amount: 1_000_000, balanceAfter: 8_000_000, refType: 'topup', refId: 'ADSNAAAAAA', createdAt: serverTimestamp(), by: 'owner',
        });
        t.set(doc(db, 'wallets/alice'), { uid: 'alice', balance: 8_000_000, updatedAt: serverTimestamp(), lastTx: 'topup_ADSNAAAAAA' });
        t.update(doc(db, 'topups/ADSNAAAAAA'), { status: 'approved', decidedAt: serverTimestamp(), decidedBy: 'owner', txId: 'topup_ADSNAAAAAA' });
      }),
    );
    assert.equal(await balanceOf('alice'), 7_000_000);
  });
  test('duyệt cho khách chưa có ví: tạo ví mới đúng số tiền', async () => {
    await seed((db) => setDoc(doc(db, 'topups/ADSNDDDDDD'), { uid: 'carol', email: CAROL.email, amount: 300_000, code: 'ADSNDDDDDD', status: 'pending', lang: 'en', createdAt: T0 }));
    await assertSucceeds(opsFor(OWNER).approveTopup('owner', 'ADSNDDDDDD'));
    assert.equal(await balanceOf('carol'), 300_000);
  });
  test('duyệt lệnh khách đã hủy nhầm: được', async () => {
    await assertSucceeds(opsFor(OWNER).approveTopup('owner', 'ADSNCCCCCC'));
    assert.equal(await balanceOf('alice'), 6_200_000);
  });
  test('quản trị viên duyệt nhưng cộng sai số tiền / không cộng ví / không ghi sổ: bị chặn', async () => {
    const db = as(OWNER);
    const attempt = (amount, { wallet = true, tx = true } = {}) =>
      runTransaction(db, async (t) => {
        if (tx)
          t.set(doc(db, 'transactions/topup_ADSNAAAAAA'), {
            uid: 'alice', type: 'topup', amount, balanceAfter: 6_000_000 + amount, refType: 'topup', refId: 'ADSNAAAAAA', createdAt: serverTimestamp(), by: 'owner',
          });
        if (wallet) t.set(doc(db, 'wallets/alice'), { uid: 'alice', balance: 6_000_000 + amount, updatedAt: serverTimestamp(), lastTx: 'topup_ADSNAAAAAA' });
        t.update(doc(db, 'topups/ADSNAAAAAA'), { status: 'approved', decidedAt: serverTimestamp(), decidedBy: 'owner', txId: 'topup_ADSNAAAAAA' });
      });
    await assertFails(attempt(10_000_000));
    await assertFails(attempt(1_000_000, { wallet: false }));
    await assertFails(attempt(1_000_000, { tx: false }));
    assert.equal(await balanceOf('alice'), 6_000_000);
    // đối chứng: đúng số tiền thì được
    await assertSucceeds(attempt(1_000_000));
    assert.equal(await balanceOf('alice'), 7_000_000);
  });
  test('từ chối có lý do: được; không lý do / từ chối lệnh đã duyệt: bị chặn', async () => {
    await assertFails(opsFor(OWNER).rejectTopup('owner', 'ADSNAAAAAA', '   '));
    await assertSucceeds(opsFor(OWNER).rejectTopup('owner', 'ADSNAAAAAA', 'Chưa nhận được tiền'));
    assert.equal((await peek('topups/ADSNAAAAAA')).status, 'rejected');
    await opsFor(OWNER).approveTopup('owner', 'ADSNBBBBBB');
    await assertFails(opsFor(OWNER).rejectTopup('owner', 'ADSNBBBBBB', 'x'));
  });
  test('khách từ chối lệnh của mình: bị chặn', async () => {
    await assertFails(opsFor(ALICE).rejectTopup('alice', 'ADSNAAAAAA', 'x'));
  });
});

// =====================================================================
describe('hoàn tiền & trạng thái đơn (quản trị viên)', () => {
  test('hoàn tiền (code website): đơn refunded, ví cộng lại đúng, có dòng sổ refund_<mã đơn>', async () => {
    const r = await assertSucceeds(opsFor(OWNER).refundOrder('owner', 'order-bob', 'Khách đổi ý'));
    assert.equal(r.balanceAfter, 1_290_000);
    assert.equal(await balanceOf('bob'), 1_290_000);
    assert.equal((await peek('orders/order-bob')).status, 'refunded');
    assert.equal((await peek('transactions/refund_order-bob')).amount, 990_000);
  });
  test('hoàn tiền hai lần: bị chặn', async () => {
    await opsFor(OWNER).refundOrder('owner', 'order-bob');
    await assert.rejects(opsFor(OWNER).refundOrder('owner', 'order-bob'));
    assert.equal(await balanceOf('bob'), 1_290_000);
  });
  test('hoàn tiền sai số tiền (ghi tay): bị chặn; đúng số tiền: được', async () => {
    const db = as(OWNER);
    const raw = (amount) =>
      runTransaction(db, async (t) => {
        t.set(doc(db, 'transactions/refund_order-bob'), {
          uid: 'bob', type: 'refund', amount, balanceAfter: 300_000 + amount, refType: 'order', refId: 'order-bob', createdAt: serverTimestamp(), by: 'owner',
        });
        t.set(doc(db, 'wallets/bob'), { uid: 'bob', balance: 300_000 + amount, updatedAt: serverTimestamp(), lastTx: 'refund_order-bob' });
        t.update(doc(db, 'orders/order-bob'), { status: 'refunded', updatedAt: serverTimestamp(), refundedAt: serverTimestamp() });
      });
    await assertFails(raw(5_000_000));
    await assertSucceeds(raw(990_000));
  });
  test('khách tự hoàn tiền đơn của mình: bị chặn', async () => {
    await assertFails(opsFor(BOB).refundOrder('bob', 'order-bob'));
    assert.equal(await balanceOf('bob'), 300_000);
  });
  test('hoàn tiền khóa học: thu hồi quyền học', async () => {
    const r = await opsFor(ALICE).purchase({ uid: 'alice', email: ALICE.email, lang: 'vi', kind: 'course', productId: 'course-a', name: 'Khóa A' });
    await assertSucceeds(opsFor(OWNER).refundOrder('owner', r.orderId));
    assert.equal(await peek('courseAccess/alice_course-a'), null);
    assert.equal(await balanceOf('alice'), 6_000_000);
  });
  test('quản trị viên đổi trạng thái đơn: được; đặt "refunded" không kèm hoàn tiền / sửa tổng: bị chặn', async () => {
    const db = as(OWNER);
    await assertSucceeds(updateDoc(doc(db, 'orders/order-bob'), { status: 'processing', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, 'orders/order-bob'), { status: 'done', updatedAt: serverTimestamp(), adminNote: 'Đã bàn giao' }));
    await assertFails(updateDoc(doc(db, 'orders/order-bob'), { status: 'refunded', updatedAt: serverTimestamp(), refundedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'orders/order-bob'), { total: 1, updatedAt: serverTimestamp() }));
  });
  test('quản trị viên đọc mọi đơn: được', async () => {
    await assertSucceeds(getDocs(collection(as(OWNER), 'orders')));
  });
});

// =====================================================================
describe('điều chỉnh số dư bằng tay (quản trị viên)', () => {
  test('cộng / trừ có ghi chú: được, sổ khớp ví', async () => {
    const ops = opsFor(OWNER);
    const r1 = await assertSucceeds(ops.adjustBalance('owner', 'bob', 500_000, 'Khuyến mãi khai trương'));
    assert.equal(r1.balanceAfter, 800_000);
    const r2 = await assertSucceeds(ops.adjustBalance('owner', 'bob', -200_000, 'Trừ phí chuyển khoản'));
    assert.equal(r2.balanceAfter, 600_000);
    assert.equal(await balanceOf('bob'), 600_000);
    assert.equal((await peek(`transactions/${r2.txId}`)).amount, -200_000);
  });
  test('cộng cho khách chưa có ví: tạo ví', async () => {
    await assertSucceeds(opsFor(OWNER).adjustBalance('owner', 'carol', 100_000, 'Tặng dùng thử'));
    assert.equal(await balanceOf('carol'), 100_000);
  });
  test('không ghi chú / làm số dư âm: bị chặn', async () => {
    const db = as(OWNER);
    const raw = (amount, note) =>
      runTransaction(db, async (t) => {
        const ref = doc(collection(db, 'transactions'));
        t.set(ref, { uid: 'bob', type: 'adjust', amount, balanceAfter: 300_000 + amount, ...(note ? { note } : {}), createdAt: serverTimestamp(), by: 'owner' });
        t.set(doc(db, 'wallets/bob'), { uid: 'bob', balance: 300_000 + amount, updatedAt: serverTimestamp(), lastTx: ref.id });
      });
    await assertFails(raw(100_000));
    await assertFails(raw(-400_000, 'trừ quá'));
    await assertSucceeds(raw(-100_000, 'đối chứng: trừ hợp lệ'));
    await assert.rejects(opsFor(OWNER).adjustBalance('owner', 'bob', -400_000, 'trừ quá'), (e) => e.code === 'negative-balance');
  });
  test('ví và sổ lệch nhau (sổ ghi 100k, ví cộng 1 triệu): bị chặn', async () => {
    const db = as(OWNER);
    await assertFails(
      runTransaction(db, async (t) => {
        t.set(doc(db, 'transactions/adj-x'), { uid: 'bob', type: 'adjust', amount: 100_000, balanceAfter: 400_000, note: 'lệch', createdAt: serverTimestamp(), by: 'owner' });
        t.set(doc(db, 'wallets/bob'), { uid: 'bob', balance: 1_300_000, updatedAt: serverTimestamp(), lastTx: 'adj-x' });
      }),
    );
  });
  test('khách tự điều chỉnh: bị chặn', async () => {
    await assertFails(opsFor(ALICE).adjustBalance('alice', 'alice', 1_000_000, 'tự cộng'));
  });
});

// =====================================================================
describe('bảng giá products/', () => {
  test('đã đăng nhập đọc được; chưa đăng nhập: bị chặn', async () => {
    await assertSucceeds(getDocs(collection(as(ALICE), 'products')));
    await assertFails(getDocs(collection(anon(), 'products')));
  });
  test('khách sửa giá / tạo sản phẩm: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'products/ai-starter-setup'), { price: 1_000, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as(ALICE), 'products/cheap'), product('cheap', { price: 1, updatedAt: serverTimestamp() })));
  });
  test('quản trị viên đồng bộ bảng giá (code website): được, sản phẩm thừa bị tắt', async () => {
    const r = await assertSucceeds(
      opsFor(OWNER).syncProducts([
        { ...product('ai-starter-setup', { price: 4_900_000 }), updatedAt: undefined },
        { id: 'ad-budget', type: 'ad_budget', pricing: 'variable', minAmount: 500_000, maxAmount: 500_000_000, name: { vi: 'Nạp', en: 'Top up' }, active: true, sort: 9 },
      ].map(({ updatedAt, ...p }) => p)),
    );
    assert.equal(r.written, 2);
    assert.equal((await peek('products/training-workshop')).active, false);
  });
  test('quản trị viên ghi sản phẩm sai dạng (giá 0 / loại lạ): bị chặn', async () => {
    await assertFails(setDoc(doc(as(OWNER), 'products/x'), { ...product('x', { price: 0 }), updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as(OWNER), 'products/x'), { ...product('x', { type: 'gift' }), updatedAt: serverTimestamp() }));
  });
});

// =====================================================================
describe('key & máy', () => {
  test('quản trị viên cấp key (code website): được, dạng AINO-XXXX-XXXX-XXXX', async () => {
    const key = await assertSucceeds(opsFor(OWNER).issueKey('owner', { uid: 'carol', email: CAROL.email, plan: 'Pro', maxMachines: 3 }));
    assert.match(key, /^AINO-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const k = await peek(`keys/${key}`);
    assert.equal(k.uid, 'carol');
    assert.deepEqual(k.machines, []);
  });
  test('khách đọc key của mình: được; của người khác / toàn bộ: bị chặn', async () => {
    const snap = await assertSucceeds(getDocs(query(collection(as(ALICE), 'keys'), where('uid', '==', 'alice'))));
    assert.equal(snap.size, 1);
    await assertFails(getDoc(doc(as(ALICE), 'keys/AINO-DDDD-EEEE-FFFF')));
    await assertFails(getDocs(collection(as(ALICE), 'keys')));
  });
  test('khách tự tạo key / sửa máy / tăng số máy / xóa key: bị chặn', async () => {
    await assertFails(
      setDoc(doc(as(ALICE), 'keys/AINO-GGGG-HHHH-JJJJ'), {
        uid: 'alice', email: ALICE.email, key: 'AINO-GGGG-HHHH-JJJJ', plan: 'Pro', maxMachines: 50, machines: [], status: 'active',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(), issuedBy: 'alice',
      }),
    );
    await assertFails(updateDoc(doc(as(ALICE), 'keys/AINO-AAAA-BBBB-CCCC'), { machines: [], updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as(ALICE), 'keys/AINO-AAAA-BBBB-CCCC'), { maxMachines: 50, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(as(ALICE), 'keys/AINO-AAAA-BBBB-CCCC')));
  });
  test('quản trị viên đặt lại máy, thu hồi key: được; xóa key / id sai dạng: bị chặn', async () => {
    const ops = opsFor(OWNER);
    await assertSucceeds(ops.resetMachines('AINO-AAAA-BBBB-CCCC'));
    assert.deepEqual((await peek('keys/AINO-AAAA-BBBB-CCCC')).machines, []);
    await assertSucceeds(ops.setKeyStatus('AINO-AAAA-BBBB-CCCC', 'revoked'));
    await assertFails(deleteDoc(doc(as(OWNER), 'keys/AINO-AAAA-BBBB-CCCC')));
    await assertFails(
      setDoc(doc(as(OWNER), 'keys/KEY-1'), {
        uid: 'alice', email: ALICE.email, key: 'KEY-1', plan: 'Pro', maxMachines: 1, machines: [], status: 'active',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(), issuedBy: 'owner',
      }),
    );
  });
  test('yêu cầu đổi máy cho key của mình: được; key người khác / trạng thái lạ: bị chặn', async () => {
    await assertSucceeds(opsFor(ALICE).requestMachineReset({ uid: 'alice', email: ALICE.email, keyId: 'AINO-AAAA-BBBB-CCCC', note: 'Đổi laptop', lang: 'vi' }));
    await assertFails(opsFor(ALICE).requestMachineReset({ uid: 'alice', email: ALICE.email, keyId: 'AINO-DDDD-EEEE-FFFF', lang: 'vi' }));
    await assertFails(
      addDoc(collection(as(ALICE), 'keyRequests'), {
        uid: 'alice', email: ALICE.email, keyId: 'AINO-AAAA-BBBB-CCCC', type: 'reset_machines', status: 'done', lang: 'vi', createdAt: serverTimestamp(),
      }),
    );
  });
  test('yêu cầu đổi máy: khách đọc của mình, không tự đánh dấu xong; quản trị viên xử lý được', async () => {
    const ref = await opsFor(ALICE).requestMachineReset({ uid: 'alice', email: ALICE.email, keyId: 'AINO-AAAA-BBBB-CCCC', lang: 'vi' });
    await assertSucceeds(getDocs(query(collection(as(ALICE), 'keyRequests'), where('uid', '==', 'alice'))));
    await assertFails(getDocs(query(collection(as(BOB), 'keyRequests'), where('uid', '==', 'alice'))));
    await assertFails(updateDoc(doc(as(ALICE), `keyRequests/${ref.id}`), { status: 'done', decidedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as(OWNER), `keyRequests/${ref.id}`), { status: 'done', decidedAt: serverTimestamp(), adminNote: 'Đã đặt lại' }));
  });
});

// =====================================================================
describe('cài đặt thanh toán settings/payment', () => {
  const payment = (extra = {}) => ({
    bankBin: '970422', bankName: 'MB Bank', accountNumber: '9988776655', accountName: 'ADS NOLIMIT', note: 'Ghi đúng nội dung', updatedAt: serverTimestamp(), updatedBy: 'owner', ...extra,
  });
  test('đã đăng nhập đọc được; chưa đăng nhập: bị chặn', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), 'settings/payment')));
    await assertFails(getDoc(doc(anon(), 'settings/payment')));
  });
  test('khách sửa thông tin nhận tiền (đổi số tài khoản): bị chặn', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'settings/payment'), payment({ updatedBy: 'alice' })));
    await assertFails(updateDoc(doc(as(ALICE), 'settings/payment'), { accountNumber: '111111111', updatedAt: serverTimestamp() }));
  });
  test('quản trị viên lưu: được; số tài khoản có chữ / tên có dấu / BIN sai / tài liệu khác: bị chặn', async () => {
    await assertSucceeds(setDoc(doc(as(OWNER), 'settings/payment'), payment()));
    await assertFails(setDoc(doc(as(OWNER), 'settings/payment'), payment({ accountNumber: '12AB5678' })));
    await assertFails(setDoc(doc(as(OWNER), 'settings/payment'), payment({ accountName: 'Nguyễn Văn A' })));
    await assertFails(setDoc(doc(as(OWNER), 'settings/payment'), payment({ bankBin: '97042' })));
    await assertFails(setDoc(doc(as(OWNER), 'settings/other'), payment()));
  });
});

// =====================================================================
describe('quản trị viên, hồ sơ, hướng dẫn, yêu cầu tư vấn', () => {
  test('tự thêm mình làm quản trị viên: bị chặn; đọc admins/<mình>: được; đọc người khác: bị chặn', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'admins/alice'), { name: 'Alice' }));
    await assertSucceeds(getDoc(doc(as(ALICE), 'admins/alice')));
    await assertFails(getDoc(doc(as(ALICE), 'admins/owner')));
    await assertFails(getDocs(collection(as(OWNER), 'admins')));
    await assertFails(setDoc(doc(as(OWNER), 'admins/alice'), { name: 'Alice' }));
  });
  test('khách đọc hồ sơ người khác / liệt kê khách: bị chặn; quản trị viên: được', async () => {
    await assertFails(getDoc(doc(as(ALICE), 'users/bob')));
    await assertFails(getDocs(collection(as(ALICE), 'users')));
    await assertSucceeds(getDocs(collection(as(OWNER), 'users')));
    await assertSucceeds(getDoc(doc(as(OWNER), 'users/bob')));
  });
  test('quản trị viên không sửa được hồ sơ khách', async () => {
    await assertFails(updateDoc(doc(as(OWNER), 'users/bob'), { displayName: 'X', updatedAt: serverTimestamp() }));
  });
  test('xóa hồ sơ khi còn số dư: bị chặn; số dư 0 hoặc chưa có ví: được', async () => {
    await assertFails(deleteDoc(doc(as(ALICE), 'users/alice')));
    await seed((db) => setDoc(doc(db, 'wallets/bob'), { uid: 'bob', balance: 0, updatedAt: T0, lastTx: 'x' }));
    await assertSucceeds(deleteDoc(doc(as(BOB), 'users/bob')));
    await assertSucceeds(deleteDoc(doc(as(CAROL), 'users/carol')));
  });
  test('hướng dẫn: đọc bài đã đăng được; bản nháp / liệt kê tất cả: bị chặn; quản trị viên viết được', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), 'guides/g1')));
    await assertSucceeds(getDocs(query(collection(as(ALICE), 'guides'), where('published', '==', true))));
    await assertFails(getDoc(doc(as(ALICE), 'guides/g2')));
    await assertFails(getDocs(collection(as(ALICE), 'guides')));
    await assertFails(getDoc(doc(anon(), 'guides/g1')));
    await assertFails(setDoc(doc(as(ALICE), 'guides/g3'), { title: 'x', category: 'y', published: true, updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(as(OWNER), 'guides/g3'), { title: 'Đổi máy', category: 'Key', body: 'Bước 1…', videoUrl: 'https://youtu.be/x', published: true, sort: 3, updatedAt: serverTimestamp() }));
    await assertSucceeds(getDocs(collection(as(OWNER), 'guides')));
  });
  test('yêu cầu tư vấn: quản trị viên đọc tất cả và đổi trạng thái; khách không đổi được', async () => {
    await assertSucceeds(getDocs(collection(as(OWNER), 'requests')));
    await assertSucceeds(updateDoc(doc(as(OWNER), 'requests/req-bob'), { status: 'contacted', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as(OWNER), 'requests/req-bob'), { status: 'weird', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as(OWNER), 'requests/req-bob'), { note: 'sửa', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as(BOB), 'requests/req-bob'), { status: 'contacted', updatedAt: serverTimestamp() }));
  });
});
