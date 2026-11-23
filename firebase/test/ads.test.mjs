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
