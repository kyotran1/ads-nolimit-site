// Test luật bảo mật Firestore (../firestore.rules) trên Firebase Emulator.
// Chạy: cd firebase && npm ci && npm test
// Emulator chạy dự án giả "demo-ads-nolimit": không có dữ liệu nào rời khỏi máy.
import { test, before, after, beforeEach, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

let env;
const ALICE = { uid: 'alice', email: 'alice@example.com' };
const BOB = { uid: 'bob', email: 'bob@example.com' };

const as = (u) => env.authenticatedContext(u.uid, { email: u.email, email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const profile = (extra = {}) => ({
  displayName: 'Alice',
  phone: '0900 000 000',
  company: 'Shop Alice',
  industry: 'Mỹ phẩm',
  aiOfficeNews: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
});

const newRequest = (u, extra = {}) => ({
  uid: u.uid,
  planId: 'ai-starter',
  note: 'Shop cần trả lời tin nhắn buổi tối.',
  contact: '0900 000 000',
  lang: 'vi',
  status: 'new',
  createdAt: serverTimestamp(),
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
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const created = Timestamp.fromDate(new Date('2026-11-01T08:00:00Z'));
    await setDoc(doc(db, 'users/bob'), { displayName: 'Bob', phone: '0911111111', createdAt: created, updatedAt: created });
    await setDoc(doc(db, 'users/alice'), { displayName: 'Alice', createdAt: created, updatedAt: created });
    await setDoc(doc(db, 'requests/bob-1'), { uid: 'bob', planId: 'ads', note: 'Bob', lang: 'vi', status: 'new', createdAt: created });
    await setDoc(doc(db, 'requests/alice-new'), { uid: 'alice', planId: 'web', note: 'A', lang: 'vi', status: 'new', createdAt: created });
    await setDoc(doc(db, 'requests/alice-contacted'), {
      uid: 'alice',
      planId: 'training',
      note: 'B',
      lang: 'en',
      status: 'contacted',
      createdAt: created,
    });
    await setDoc(doc(db, 'settings/site'), { secret: 'x' });
  });
});

// ---------------- users/{uid} ----------------
describe('users/{uid} — hồ sơ khách', () => {
  test('tạo hồ sơ của mình: được', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'users/alice')));
    await assertSucceeds(setDoc(doc(as(ALICE), 'users/alice'), profile()));
  });
  test('tạo hồ sơ chỉ có thời gian (các trường khác bỏ trống): được', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'users/alice')));
    await assertSucceeds(setDoc(doc(as(ALICE), 'users/alice'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });
  test('đọc hồ sơ của mình: được', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), 'users/alice')));
  });
  test('sửa hồ sơ của mình: được', async () => {
    await assertSucceeds(
      updateDoc(doc(as(ALICE), 'users/alice'), { phone: '+84 900 000 000', company: 'Shop A', updatedAt: serverTimestamp() }),
    );
  });
  test('setDoc merge lên hồ sơ của mình (giữ createdAt): được', async () => {
    await assertSucceeds(
      setDoc(doc(as(ALICE), 'users/alice'), { displayName: 'Alice N.', aiOfficeNews: false, updatedAt: serverTimestamp() }, { merge: true }),
    );
  });
  test('đọc hồ sơ người khác: bị chặn', async () => {
    await assertFails(getDoc(doc(as(ALICE), 'users/bob')));
  });
  test('tạo hồ sơ cho người khác: bị chặn', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'users/carol'), profile()));
  });
  test('sửa hồ sơ người khác: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'users/bob'), { company: 'X', updatedAt: serverTimestamp() }));
  });
  test('liệt kê toàn bộ users: bị chặn', async () => {
    await assertFails(getDocs(collection(as(ALICE), 'users')));
  });
  test('tạo hồ sơ có trường lạ (role): bị chặn', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'users/alice')));
    await assertFails(setDoc(doc(as(ALICE), 'users/alice'), profile({ role: 'admin' })));
  });
  test('sửa hồ sơ thêm trường lạ (email): bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'users/alice'), { email: 'x@example.com', updatedAt: serverTimestamp() }));
  });
  test('chuỗi dài hơn 120 ký tự: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'users/alice'), { company: 'x'.repeat(121), updatedAt: serverTimestamp() }));
  });
  test('đúng 120 ký tự: được', async () => {
    await assertSucceeds(updateDoc(doc(as(ALICE), 'users/alice'), { industry: 'x'.repeat(120), updatedAt: serverTimestamp() }));
  });
  test('số điện thoại dài hơn 20 ký tự: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'users/alice'), { phone: '0'.repeat(21), updatedAt: serverTimestamp() }));
  });
  test('số điện thoại có chữ: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'users/alice'), { phone: '090abc', updatedAt: serverTimestamp() }));
  });
  test('aiOfficeNews không phải true/false: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'users/alice'), { aiOfficeNews: 'yes', updatedAt: serverTimestamp() }));
  });
  test('displayName không phải chuỗi: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'users/alice'), { displayName: 42, updatedAt: serverTimestamp() }));
  });
  test('sửa mà không cập nhật updatedAt bằng giờ máy chủ: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'users/alice'), { company: 'Y' }));
    await assertFails(updateDoc(doc(as(ALICE), 'users/alice'), { company: 'Y', updatedAt: Timestamp.fromDate(new Date('2020-01-01')) }));
  });
  test('đổi createdAt: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'users/alice'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });
  test('tạo hồ sơ với createdAt do trình duyệt tự đặt: bị chặn', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'users/alice')));
    await assertFails(
      setDoc(doc(as(ALICE), 'users/alice'), profile({ createdAt: Timestamp.fromDate(new Date('2020-01-01')) })),
    );
  });
  test('xóa hồ sơ của mình (khi xóa tài khoản): được', async () => {
    await assertSucceeds(deleteDoc(doc(as(ALICE), 'users/alice')));
  });
  test('xóa hồ sơ người khác: bị chặn', async () => {
    await assertFails(deleteDoc(doc(as(ALICE), 'users/bob')));
  });
});

// ---------------- requests/{id} ----------------
describe('requests/{id} — yêu cầu dịch vụ', () => {
  test('tạo yêu cầu của mình, trạng thái new: được', async () => {
    await assertSucceeds(addDoc(collection(as(ALICE), 'requests'), newRequest(ALICE)));
  });
  test('tạo yêu cầu không có contact, gói "other", tiếng Anh: được', async () => {
    const { contact, ...rest } = newRequest(ALICE, { planId: 'other', lang: 'en' });
    await assertSucceeds(addDoc(collection(as(ALICE), 'requests'), rest));
  });
  test('mọi id gói trong pricing.ts đều tạo được', async () => {
    for (const planId of ['ai-starter', 'ai-sales', 'ads', 'agency-account', 'automation', 'web', 'training', 'other']) {
      await assertSucceeds(addDoc(collection(as(ALICE), 'requests'), newRequest(ALICE, { planId })));
    }
  });
  test('tạo yêu cầu với trạng thái done: bị chặn', async () => {
    await assertFails(addDoc(collection(as(ALICE), 'requests'), newRequest(ALICE, { status: 'done' })));
  });
  test('tạo yêu cầu mang uid người khác: bị chặn', async () => {
    await assertFails(addDoc(collection(as(ALICE), 'requests'), newRequest(BOB)));
  });
  test('gói không có trong bảng giá: bị chặn', async () => {
    await assertFails(addDoc(collection(as(ALICE), 'requests'), newRequest(ALICE, { planId: 'free-money' })));
  });
  test('ghi chú dài hơn 1000 ký tự: bị chặn', async () => {
    await assertFails(addDoc(collection(as(ALICE), 'requests'), newRequest(ALICE, { note: 'x'.repeat(1001) })));
  });
  test('ghi chú đúng 1000 ký tự: được', async () => {
    await assertSucceeds(addDoc(collection(as(ALICE), 'requests'), newRequest(ALICE, { note: 'x'.repeat(1000) })));
  });
  test('liên hệ dài hơn 120 ký tự: bị chặn', async () => {
    await assertFails(addDoc(collection(as(ALICE), 'requests'), newRequest(ALICE, { contact: 'x'.repeat(121) })));
  });
  test('thiếu ghi chú: bị chặn', async () => {
    const { note, ...rest } = newRequest(ALICE);
    await assertFails(addDoc(collection(as(ALICE), 'requests'), rest));
  });
  test('ngôn ngữ khác vi/en: bị chặn', async () => {
    await assertFails(addDoc(collection(as(ALICE), 'requests'), newRequest(ALICE, { lang: 'fr' })));
  });
  test('trường lạ (price): bị chặn', async () => {
    await assertFails(addDoc(collection(as(ALICE), 'requests'), newRequest(ALICE, { price: 0 })));
  });
  test('createdAt do trình duyệt tự đặt: bị chặn', async () => {
    await assertFails(
      addDoc(collection(as(ALICE), 'requests'), newRequest(ALICE, { createdAt: Timestamp.fromDate(new Date('2020-01-01')) })),
    );
  });
  test('đọc yêu cầu của mình (where uid == mình, sắp theo createdAt): được', async () => {
    const snap = await assertSucceeds(getDocs(query(collection(as(ALICE), 'requests'), where('uid', '==', 'alice'))));
    if (snap.size !== 2) throw new Error(`mong đợi 2 yêu cầu, nhận ${snap.size}`);
    await assertSucceeds(
      getDocs(query(collection(as(ALICE), 'requests'), where('uid', '==', 'alice'), orderBy('createdAt', 'desc'))),
    );
  });
  test('đọc một yêu cầu của mình theo id: được', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), 'requests/alice-new')));
  });
  test('đọc yêu cầu của người khác theo id: bị chặn', async () => {
    await assertFails(getDoc(doc(as(ALICE), 'requests/bob-1')));
  });
  test('truy vấn yêu cầu của người khác: bị chặn', async () => {
    await assertFails(getDocs(query(collection(as(ALICE), 'requests'), where('uid', '==', 'bob'))));
  });
  test('truy vấn toàn bộ requests không lọc uid: bị chặn', async () => {
    await assertFails(getDocs(collection(as(ALICE), 'requests')));
  });
  test('hủy yêu cầu new của mình: được', async () => {
    await assertSucceeds(updateDoc(doc(as(ALICE), 'requests/alice-new'), { status: 'cancelled' }));
  });
  test('tự đổi trạng thái thành done: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'requests/alice-new'), { status: 'done' }));
  });
  test('tự đổi trạng thái thành contacted / in_progress: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'requests/alice-new'), { status: 'contacted' }));
    await assertFails(updateDoc(doc(as(ALICE), 'requests/alice-new'), { status: 'in_progress' }));
  });
  test('hủy kèm sửa ghi chú: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'requests/alice-new'), { status: 'cancelled', note: 'sửa' }));
  });
  test('sửa ghi chú (không hủy): bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'requests/alice-new'), { note: 'sửa' }));
  });
  test('hủy yêu cầu đã được liên hệ (không còn new): bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'requests/alice-contacted'), { status: 'cancelled' }));
  });
  test('hủy yêu cầu của người khác: bị chặn', async () => {
    await assertFails(updateDoc(doc(as(ALICE), 'requests/bob-1'), { status: 'cancelled' }));
  });
  test('xóa yêu cầu của mình: bị chặn', async () => {
    await assertFails(deleteDoc(doc(as(ALICE), 'requests/alice-new')));
  });
  test('xóa yêu cầu của người khác: bị chặn', async () => {
    await assertFails(deleteDoc(doc(as(ALICE), 'requests/bob-1')));
  });
});

// ---------------- chưa đăng nhập & bộ sưu tập khác ----------------
describe('chưa đăng nhập và đường dẫn khác', () => {
  test('chưa đăng nhập: đọc hồ sơ bị chặn', async () => {
    await assertFails(getDoc(doc(anon(), 'users/alice')));
  });
  test('chưa đăng nhập: tạo hồ sơ bị chặn', async () => {
    await assertFails(setDoc(doc(anon(), 'users/alice'), profile()));
  });
  test('chưa đăng nhập: sửa / xóa hồ sơ bị chặn', async () => {
    await assertFails(updateDoc(doc(anon(), 'users/alice'), { company: 'X', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(anon(), 'users/alice')));
  });
  test('chưa đăng nhập: tạo yêu cầu bị chặn', async () => {
    await assertFails(addDoc(collection(anon(), 'requests'), newRequest(ALICE)));
  });
  test('chưa đăng nhập: đọc / truy vấn yêu cầu bị chặn', async () => {
    await assertFails(getDoc(doc(anon(), 'requests/alice-new')));
    await assertFails(getDocs(query(collection(anon(), 'requests'), where('uid', '==', 'alice'))));
  });
  test('chưa đăng nhập: hủy / xóa yêu cầu bị chặn', async () => {
    await assertFails(updateDoc(doc(anon(), 'requests/alice-new'), { status: 'cancelled' }));
    await assertFails(deleteDoc(doc(anon(), 'requests/alice-new')));
  });
  test('chưa đăng nhập: bộ sưu tập khác bị chặn', async () => {
    await assertFails(getDoc(doc(anon(), 'settings/site')));
    await assertFails(setDoc(doc(anon(), 'anything/x'), { a: 1 }));
  });
  test('đã đăng nhập: bộ sưu tập khác vẫn bị chặn', async () => {
    await assertFails(getDoc(doc(as(ALICE), 'settings/site')));
    await assertFails(setDoc(doc(as(ALICE), 'settings/site'), { secret: 'y' }));
    await assertFails(setDoc(doc(as(ALICE), 'admins/alice'), { role: 'admin' }));
    await assertFails(setDoc(doc(as(ALICE), 'users/alice/private/x'), { a: 1 }));
  });
});
