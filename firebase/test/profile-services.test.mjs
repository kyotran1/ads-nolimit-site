// Test luật users.avatar + customerServices (V4.2). Chạy cùng npm test.
import { test, before, after, beforeEach, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

let env;
const OWNER = { uid: 'owner', email: 'owner@example.com' };
const ALICE = { uid: 'alice', email: 'alice@example.com' };
const BOB = { uid: 'bob', email: 'bob@example.com' };
const as = (u) => env.authenticatedContext(u.uid, { email: u.email, email_verified: true }).firestore();

const profile = (extra = {}) => ({ displayName: 'Alice', email: 'alice@example.com', createdAt: Timestamp.fromDate(new Date('2026-11-01T00:00:00Z')), updatedAt: serverTimestamp(), ...extra });
const cs = (extra = {}) => ({
  services: [{ id: 'ads', label: 'Quảng cáo hiệu suất', status: 'active', since: '2026-11-24', note: '', source: 'manual' }],
  access: { ads: true, courses: false, keys: false, guides: false },
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
    const t = Timestamp.fromDate(new Date('2026-11-01T00:00:00Z'));
    await setDoc(doc(db, 'admins/owner'), { createdAt: t });
    await setDoc(doc(db, 'users/alice'), { displayName: 'Alice', email: 'alice@example.com', createdAt: t, updatedAt: t });
    await setDoc(doc(db, 'customerServices/alice'), { ...cs(), updatedAt: t });
  });
});

describe('users.avatar', () => {
  const png = 'data:image/webp;base64,' + 'A'.repeat(2000);
  test('khách lưu ảnh data:image ≤ 32000 ký tự, xóa bằng chuỗi rỗng', async () => {
    await assertSucceeds(updateDoc(doc(as(ALICE), 'users/alice'), { avatar: png, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as(ALICE), 'users/alice'), { avatar: '', updatedAt: serverTimestamp() }));
  });
  test('ảnh là URL https, quá dài, hoặc không phải chuỗi → từ chối', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'users/alice'), { avatar: 'https://x.test/a.png', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as(ALICE), 'users/alice'), { avatar: 'data:image/png;base64,' + 'A'.repeat(32000), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as(ALICE), 'users/alice'), { avatar: 123, updatedAt: serverTimestamp() }));
  });
  test('tạo hồ sơ mới kèm ảnh', async () => {
    await assertSucceeds(setDoc(doc(as(BOB), 'users/bob'), profile({ displayName: 'Bob', email: 'bob@example.com', avatar: png, createdAt: serverTimestamp() })));
  });
});

describe('customerServices', () => {
  test('khách đọc của mình; không đọc của người khác; không ghi', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), 'customerServices/alice')));
    await assertFails(getDoc(doc(as(BOB), 'customerServices/alice')));
    await assertFails(setDoc(doc(as(ALICE), 'customerServices/alice'), cs({ updatedBy: 'alice' })));
    await assertFails(updateDoc(doc(as(ALICE), 'customerServices/alice'), { access: { ads: true, courses: true, keys: true, guides: true } }));
  });
  test('quản trị ghi đúng dạng; xóa được', async () => {
    await assertSucceeds(setDoc(doc(as(OWNER), 'customerServices/bob'), cs()));
    await assertSucceeds(setDoc(doc(as(OWNER), 'customerServices/alice'), cs({ services: [], access: { ads: false } })));
    await assertSucceeds(deleteDoc(doc(as(OWNER), 'customerServices/alice')));
  });
  test('quản trị ghi sai dạng → từ chối', async () => {
    const db = as(OWNER);
    await assertFails(setDoc(doc(db, 'customerServices/bob'), cs({ services: Array.from({ length: 31 }, () => cs().services[0]) })));
    await assertFails(setDoc(doc(db, 'customerServices/bob'), cs({ services: 'ads' })));
    await assertFails(setDoc(doc(db, 'customerServices/bob'), cs({ access: { ads: true, orders: true } })));
    await assertFails(setDoc(doc(db, 'customerServices/bob'), cs({ access: { ads: 'yes' } })));
    await assertFails(setDoc(doc(db, 'customerServices/bob'), cs({ updatedBy: 'alice' })));
    await assertFails(setDoc(doc(db, 'customerServices/bob'), cs({ updatedAt: Timestamp.now() })));
    await assertFails(setDoc(doc(db, 'customerServices/bob'), cs({ extra: 1 })));
  });
});
