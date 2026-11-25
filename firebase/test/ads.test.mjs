// Test luật adAccounts / adReports (báo cáo TKQC cho khách). Chạy cùng npm test.
import { test, before, after, beforeEach, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';

let env;
const OWNER = { uid: 'owner', email: 'owner@example.com' };
const ALICE = { uid: 'alice', email: 'alice@example.com' };
const BOB = { uid: 'bob', email: 'bob@example.com' };
const as = (u) => env.authenticatedContext(u.uid, { email: u.email, email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const config = (extra = {}) => ({
  uid: 'alice',
  customerEmail: 'alice@example.com',
  accountName: '5263 - (TK1) Philippine',
  label: 'K-Aura',
  service: 'ads',
  tabPattern: 'Master Eva Truong - K-Aura',
  lowVnd: 3000000,
  lowDays: 3,
  emailAlerts: true,
  active: true,
  updatedAt: serverTimestamp(),
  updatedBy: 'owner',
  ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ads-nolimit',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => env && env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const t = Timestamp.fromDate(new Date('2026-11-23T10:00:00Z'));
    await setDoc(doc(db, 'admins/owner'), { createdAt: t });
    await setDoc(doc(db, 'adAccounts/act_11111'), { ...config(), updatedAt: t, latest: { balance: 500000, low: true } });
    await setDoc(doc(db, 'adAccounts/act_22222'), { ...config({ uid: 'bob', customerEmail: 'bob@example.com' }), updatedAt: t });
    await setDoc(doc(db, 'adReports/act_11111_2026-11'), { uid: 'alice', actId: 'act_11111', month: '2026-11', days: [] });
    await setDoc(doc(db, 'adReports/act_22222_2026-11'), { uid: 'bob', actId: 'act_22222', month: '2026-11', days: [] });
  });
});

describe('adAccounts', () => {
  test('khách đọc TKQC của mình, không đọc của người khác', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), 'adAccounts/act_11111')));
    await assertFails(getDoc(doc(as(ALICE), 'adAccounts/act_22222')));
    await assertSucceeds(getDocs(query(collection(as(ALICE), 'adAccounts'), where('uid', '==', 'alice'))));
    await assertFails(getDocs(collection(as(ALICE), 'adAccounts')));
    await assertFails(getDoc(doc(anon(), 'adAccounts/act_11111')));
  });

  test('khách không sửa được TKQC (kể cả số dư)', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'adAccounts/act_11111'), { lowVnd: 0, updatedAt: serverTimestamp(), updatedBy: 'alice' }));
    await assertFails(updateDoc(doc(as(ALICE), 'adAccounts/act_11111'), { 'latest.balance': 99999999 }));
    await assertFails(setDoc(doc(as(ALICE), 'adAccounts/act_99999'), config({ updatedBy: 'alice' })));
  });

  test('quản trị tạo, sửa cấu hình, đọc tất cả', async () => {
    const db = as(OWNER);
    await assertSucceeds(getDocs(collection(db, 'adAccounts')));
    await assertSucceeds(setDoc(doc(db, 'adAccounts/act_1409061213751323'), config()));
    await assertSucceeds(updateDoc(doc(db, 'adAccounts/act_11111'), { lowVnd: 2000000, updatedAt: serverTimestamp(), updatedBy: 'owner' }));
  });

  test('quản trị không ghi được số liệu (latest) và không tạo id sai', async () => {
    const db = as(OWNER);
    await assertFails(updateDoc(doc(db, 'adAccounts/act_11111'), { 'latest.balance': 1, updatedAt: serverTimestamp(), updatedBy: 'owner' }));
    await assertFails(setDoc(doc(db, 'adAccounts/5263'), config()));
    await assertFails(setDoc(doc(db, 'adAccounts/act_33333'), config({ service: 'web' })));
    await assertFails(setDoc(doc(db, 'adAccounts/act_33333'), config({ lowVnd: '3000000' })));
    await assertFails(setDoc(doc(db, 'adAccounts/act_33333'), config({ latest: { balance: 1 } })));
  });
});

describe('adReports', () => {
  test('khách đọc báo cáo của mình; không ai ghi từ trình duyệt', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), 'adReports/act_11111_2026-11')));
    await assertFails(getDoc(doc(as(ALICE), 'adReports/act_22222_2026-11')));
    await assertSucceeds(getDocs(query(collection(as(ALICE), 'adReports'), where('uid', '==', 'alice'))));
    await assertFails(setDoc(doc(as(ALICE), 'adReports/act_11111_2026-12'), { uid: 'alice' }));
    await assertFails(setDoc(doc(as(OWNER), 'adReports/act_11111_2026-12'), { uid: 'alice' }));
    await assertSucceeds(getDoc(doc(as(OWNER), 'adReports/act_22222_2026-11')));
    await assertFails(deleteDoc(doc(as(OWNER), 'adReports/act_22222_2026-11')));
    await assertFails(getDoc(doc(as(BOB), 'adReports/act_11111_2026-11')));
  });
});

// ---------- Nạp ngân sách TKQC (adTopups, settings/adTopup) ----------

const adTop = (extra = {}) => ({
  uid: 'alice',
  email: 'alice@example.com',
  name: 'Alice',
  actId: 'act_11111',
  accountLabel: 'K-Aura',
  amount: 11000000,
  budget: 10000000,
  feePercent: 10,
  day: '2026-11-23',
  code: 'ADSBK7Q3PX',
  status: 'pending',
  lang: 'vi',
  createdAt: serverTimestamp(),
  ...extra,
});
const seedAdTop = (extra = {}) =>
  env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), `adTopups/${extra.code ?? 'ADSBK7Q3PX'}`), { ...adTop(extra), createdAt: Timestamp.now() }),
  );
const settings = (extra = {}) => ({
  presets: [11000000, 22000000],
  min: 11000000,
  max: 110000000,
  feePercent: 10,
  updatedAt: serverTimestamp(),
  updatedBy: 'owner',
  ...extra,
});

describe('adTopups — khách tạo', () => {
  test('khách tạo lệnh nạp cho TKQC của mình theo mặc định (chưa có settings)', async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), 'adTopups/ADSBK7Q3PX'), adTop()));
  });

  test('budget làm tròn ±1 được; lệch nhiều bị từ chối', async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAA2'), adTop({ code: 'ADSBAAAAA2', amount: 15000000, budget: 13636364 })));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAA3'), adTop({ code: 'ADSBAAAAA3', amount: 15000000, budget: 15000000 })));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAA4'), adTop({ code: 'ADSBAAAAA4', budget: 10500000 })));
  });

  test('ngoài tối thiểu/tối đa, lẻ nghìn, sai % phí → từ chối', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAA5'), adTop({ code: 'ADSBAAAAA5', amount: 5500000, budget: 5000000 })));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAA6'), adTop({ code: 'ADSBAAAAA6', amount: 121000000, budget: 110000000 })));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAA7'), adTop({ code: 'ADSBAAAAA7', amount: 11000500, budget: 10000455 })));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAA8'), adTop({ code: 'ADSBAAAAA8', feePercent: 0, budget: 11000000 })));
  });

  test('theo settings/adTopup của quản trị', async () => {
    await assertSucceeds(setDoc(doc(as(OWNER), 'settings/adTopup'), settings({ min: 5250000, feePercent: 5 })));
    await assertSucceeds(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAA9'), adTop({ code: 'ADSBAAAAA9', amount: 5250000, budget: 5000000, feePercent: 5 })));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAB2'), adTop({ code: 'ADSBAAAAB2' }))); // phí 10% không còn đúng
  });

  test('TKQC của người khác, TKQC đang ẩn, uid/email/mã/trạng thái sai → từ chối', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAB3'), adTop({ code: 'ADSBAAAAB3', actId: 'act_22222' })));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAB4'), adTop({ code: 'ADSBAAAAB4', actId: 'act_99999' })));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAB5'), adTop({ code: 'ADSBAAAAB5', uid: 'bob' })));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAB6'), adTop({ code: 'ADSBAAAAB6', email: 'x@example.com' })));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAB7'), adTop({ code: 'ADSBAAAAB8' })));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSN0AAAB9'), adTop({ code: 'ADSN0AAAB9' })));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAC2'), adTop({ code: 'ADSBAAAAC2', status: 'approved' })));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAC3'), adTop({ code: 'ADSBAAAAC3', written: true })));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAC4'), adTop({ code: 'ADSBAAAAC4', day: '2026-13-01' })));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'adAccounts/act_11111'), { active: false }));
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBAAAAC5'), adTop({ code: 'ADSBAAAAC5' })));
    await assertFails(setDoc(doc(anon(), 'adTopups/ADSBAAAAC6'), adTop({ code: 'ADSBAAAAC6' })));
  });

  test('mã trùng (đã có) không ghi đè được', async () => {
    await seedAdTop();
    await assertFails(setDoc(doc(as(ALICE), 'adTopups/ADSBK7Q3PX'), adTop()));
  });
});

describe('adTopups — đọc, hủy, duyệt', () => {
  test('khách đọc lệnh của mình, không đọc của người khác', async () => {
    await seedAdTop();
    await seedAdTop({ code: 'ADSBBBBBB2', uid: 'bob', email: 'bob@example.com', actId: 'act_22222' });
    await assertSucceeds(getDoc(doc(as(ALICE), 'adTopups/ADSBK7Q3PX')));
    await assertFails(getDoc(doc(as(ALICE), 'adTopups/ADSBBBBBB2')));
    await assertSucceeds(getDocs(query(collection(as(ALICE), 'adTopups'), where('uid', '==', 'alice'))));
    await assertFails(getDocs(collection(as(ALICE), 'adTopups')));
    await assertSucceeds(getDocs(collection(as(OWNER), 'adTopups')));
  });

  test('khách chỉ hủy lệnh đang chờ; không tự duyệt, không sửa số tiền', async () => {
    await seedAdTop();
    const db = as(ALICE);
    await assertFails(updateDoc(doc(db, 'adTopups/ADSBK7Q3PX'), { status: 'approved', decidedAt: serverTimestamp(), decidedBy: 'alice' }));
    await assertFails(updateDoc(doc(db, 'adTopups/ADSBK7Q3PX'), { amount: 22000000 }));
    await assertFails(updateDoc(doc(db, 'adTopups/ADSBK7Q3PX'), { written: true }));
    await assertSucceeds(updateDoc(doc(db, 'adTopups/ADSBK7Q3PX'), { status: 'cancelled', cancelledAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, 'adTopups/ADSBK7Q3PX')));
  });

  test('quản trị duyệt một lần (được sửa ngày), không sửa số tiền, không đánh dấu đã ghi', async () => {
    await seedAdTop();
    const db = as(OWNER);
    await assertFails(updateDoc(doc(db, 'adTopups/ADSBK7Q3PX'), { status: 'approved', decidedAt: serverTimestamp(), decidedBy: 'owner', budget: 1 }));
    await assertFails(updateDoc(doc(db, 'adTopups/ADSBK7Q3PX'), { status: 'approved', decidedAt: serverTimestamp(), decidedBy: 'owner', written: true }));
    await assertFails(updateDoc(doc(db, 'adTopups/ADSBK7Q3PX'), { status: 'approved', decidedAt: serverTimestamp(), decidedBy: 'owner', day: '24/11/2026' }));
    await assertSucceeds(updateDoc(doc(db, 'adTopups/ADSBK7Q3PX'), { status: 'approved', decidedAt: serverTimestamp(), decidedBy: 'owner', day: '2026-11-24' }));
    await assertFails(updateDoc(doc(db, 'adTopups/ADSBK7Q3PX'), { status: 'approved', decidedAt: serverTimestamp(), decidedBy: 'owner' }));
    await assertFails(updateDoc(doc(db, 'adTopups/ADSBK7Q3PX'), { status: 'rejected', decidedAt: serverTimestamp(), decidedBy: 'owner', reason: 'x' }));
  });

  test('quản trị duyệt được lệnh khách đã hủy; từ chối cần lý do; khách khác không duyệt được', async () => {
    await seedAdTop({ status: 'cancelled' });
    await seedAdTop({ code: 'ADSBBBBBB3' });
    await assertFails(updateDoc(doc(as(BOB), 'adTopups/ADSBBBBBB3'), { status: 'approved', decidedAt: serverTimestamp(), decidedBy: 'bob' }));
    await assertFails(updateDoc(doc(as(OWNER), 'adTopups/ADSBBBBBB3'), { status: 'rejected', decidedAt: serverTimestamp(), decidedBy: 'owner' }));
    await assertSucceeds(updateDoc(doc(as(OWNER), 'adTopups/ADSBBBBBB3'), { status: 'rejected', decidedAt: serverTimestamp(), decidedBy: 'owner', reason: 'Chưa nhận được tiền' }));
    await assertSucceeds(updateDoc(doc(as(OWNER), 'adTopups/ADSBK7Q3PX'), { status: 'approved', decidedAt: serverTimestamp(), decidedBy: 'owner' }));
  });

  test('lệnh đã ghi trang tính thì không duyệt lại', async () => {
    await seedAdTop({ status: 'cancelled', written: true });
    await assertFails(updateDoc(doc(as(OWNER), 'adTopups/ADSBK7Q3PX'), { status: 'approved', decidedAt: serverTimestamp(), decidedBy: 'owner' }));
  });
});

describe('adTopups — quản trị xóa lệnh (25/11/2026)', () => {
  test('quản trị xóa được lệnh đang chờ, đã hủy, đã từ chối', async () => {
    await seedAdTop({ code: 'ADSBXXXXX1', status: 'pending' });
    await seedAdTop({ code: 'ADSBXXXXX2', status: 'cancelled' });
    await seedAdTop({ code: 'ADSBXXXXX3', status: 'rejected', reason: 'thử' });
    for (const c of ['ADSBXXXXX1', 'ADSBXXXXX2', 'ADSBXXXXX3']) await assertSucceeds(deleteDoc(doc(as(OWNER), `adTopups/${c}`)));
  });
  test('không xóa được lệnh đã nhận tiền (kể cả chưa ghi trang tính)', async () => {
    await seedAdTop({ code: 'ADSBXXXXX4', status: 'approved' });
    await seedAdTop({ code: 'ADSBXXXXX5', status: 'approved', written: true });
    await assertFails(deleteDoc(doc(as(OWNER), 'adTopups/ADSBXXXXX4')));
    await assertFails(deleteDoc(doc(as(OWNER), 'adTopups/ADSBXXXXX5')));
  });
  test('không xóa được lệnh hệ thống đã thấy tiền về hoặc đã đụng trang tính, dù chưa duyệt', async () => {
    await seedAdTop({ code: 'ADSBXXXXX6', status: 'pending', sepayId: '123', paidAmount: 5000000 });
    await seedAdTop({ code: 'ADSBXXXXX7', status: 'cancelled', paidAmount: 11000000 });
    await seedAdTop({ code: 'ADSBXXXXX8', status: 'cancelled', written: false });
    for (const c of ['ADSBXXXXX6', 'ADSBXXXXX7', 'ADSBXXXXX8']) await assertFails(deleteDoc(doc(as(OWNER), `adTopups/${c}`)));
  });
  test('khách (kể cả chủ lệnh) và người lạ không xóa được', async () => {
    await seedAdTop({ status: 'rejected', reason: 'x' });
    await assertFails(deleteDoc(doc(as(ALICE), 'adTopups/ADSBK7Q3PX')));
    await assertFails(deleteDoc(doc(as(BOB), 'adTopups/ADSBK7Q3PX')));
    await assertFails(deleteDoc(doc(env.unauthenticatedContext().firestore(), 'adTopups/ADSBK7Q3PX')));
  });
});

describe('settings/adTopup', () => {
  test('khách đọc, không ghi; quản trị ghi đúng dạng', async () => {
    await assertSucceeds(setDoc(doc(as(OWNER), 'settings/adTopup'), settings()));
    await assertSucceeds(getDoc(doc(as(ALICE), 'settings/adTopup')));
    await assertFails(getDoc(doc(anon(), 'settings/adTopup')));
    await assertFails(setDoc(doc(as(ALICE), 'settings/adTopup'), settings({ updatedBy: 'alice' })));
    await assertFails(setDoc(doc(as(OWNER), 'settings/adTopup'), settings({ min: 2000000, max: 1000000 })));
    await assertFails(setDoc(doc(as(OWNER), 'settings/adTopup'), settings({ feePercent: 60 })));
    await assertFails(setDoc(doc(as(OWNER), 'settings/adTopup'), settings({ presets: [] })));
    await assertFails(setDoc(doc(as(OWNER), 'settings/adTopup'), settings({ min: 11000500 })));
    await assertFails(setDoc(doc(as(OWNER), 'settings/other'), settings()));
  });
});
