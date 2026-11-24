// Nhiều người cùng xem một TKQC (viewerUids / viewerEmails / memberUids). Chạy: cd firebase && npm test
import { test, before, after, beforeEach, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';

let env;
const OWNER = { uid: 'owner', email: 'owner@example.com' };
const CHINH = { uid: 'chinh', email: 'chinh@example.com' };
const XEM1 = { uid: 'xem1', email: 'x1@e.com' };
const NGOAI = { uid: 'ngoai', email: 'ngoai@example.com' };
const as = (u) => env.authenticatedContext(u.uid, { email: u.email, email_verified: true }).firestore();

const members = (extra = {}) => ({ viewerUids: ['xem1'], viewerEmails: ['x1@e.com'], memberUids: ['chinh', 'xem1'], ...extra });
const config = (extra = {}) => ({
  uid: 'chinh',
  customerEmail: 'chinh@example.com',
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
  ...members(),
  ...extra,
});
const without = (o, ...keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

const adTop = (extra = {}) => ({
  uid: 'xem1',
  email: 'x1@e.com',
  name: 'Xem Một',
  actId: 'act_11111',
  accountLabel: 'K-Aura',
  amount: 11000000,
  budget: 10000000,
  feePercent: 10,
  day: '2026-11-24',
  code: 'ADSBK7Q3PX',
  status: 'pending',
  lang: 'vi',
  createdAt: serverTimestamp(),
  ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ads-nolimit',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: Number(process.env.EMU_PORT || 8080) },
  });
});
after(async () => env && env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const t = Timestamp.fromDate(new Date('2026-11-24T10:00:00Z'));
    await setDoc(doc(db, 'admins/owner'), { createdAt: t });
    await setDoc(doc(db, 'adAccounts/act_11111'), { ...config(), updatedAt: t });
    // Tài liệu cũ: chưa có 3 trường mới
    await setDoc(doc(db, 'adAccounts/act_33333'), { ...without(config(), 'viewerUids', 'viewerEmails', 'memberUids'), updatedAt: t });
    await setDoc(doc(db, 'adReports/act_11111_2026-11'), { uid: 'chinh', memberUids: ['chinh', 'xem1'], actId: 'act_11111', month: '2026-11', days: [] });
    await setDoc(doc(db, 'adReports/act_33333_2026-11'), { uid: 'chinh', actId: 'act_33333', month: '2026-11', days: [] });
  });
});

const both = ['adAccounts', 'adReports'];

describe('đọc adAccounts / adReports theo memberUids', () => {
  for (const c of both) {
    const id = c === 'adAccounts' ? 'act_11111' : 'act_11111_2026-11';
    test(`${c}: người xem thêm get + list array-contains`, async () => {
      const db = as(XEM1);
      await assertSucceeds(getDoc(doc(db, `${c}/${id}`)));
      const snap = await assertSucceeds(getDocs(query(collection(db, c), where('memberUids', 'array-contains', 'xem1'))));
      if (snap.size !== 1) throw new Error(`mong 1 tài liệu, nhận ${snap.size}`);
      // truy vấn uid == mình hợp lệ nhưng không có gì (người xem thêm không phải chủ)
      const asOwner = await assertSucceeds(getDocs(query(collection(db, c), where('uid', '==', 'xem1'))));
      if (asOwner.size !== 0) throw new Error('uid == xem1 phải rỗng');
      await assertFails(getDocs(query(collection(db, c), where('uid', '==', 'chinh'))));
    });

    test(`${c}: tài khoản chính list bằng uid == và array-contains`, async () => {
      const db = as(CHINH);
      await assertSucceeds(getDoc(doc(db, `${c}/${id}`)));
      await assertSucceeds(getDocs(query(collection(db, c), where('uid', '==', 'chinh'))));
      const snap = await assertSucceeds(getDocs(query(collection(db, c), where('memberUids', 'array-contains', 'chinh'))));
      if (snap.size !== 1) throw new Error(`mong 1 tài liệu (chỉ tài liệu mới có memberUids), nhận ${snap.size}`);
    });

    test(`${c}: người ngoài không get, không list lấn quyền, không list rộng`, async () => {
      const db = as(NGOAI);
      await assertFails(getDoc(doc(db, `${c}/${id}`)));
      const own = await assertSucceeds(getDocs(query(collection(db, c), where('memberUids', 'array-contains', 'ngoai'))));
      if (own.size !== 0) throw new Error('người ngoài phải nhận danh sách rỗng');
      await assertFails(getDocs(query(collection(db, c), where('memberUids', 'array-contains', 'xem1'))));
      await assertFails(getDocs(query(collection(db, c), where('uid', '==', 'chinh'))));
      await assertFails(getDocs(collection(db, c)));
    });

    test(`${c}: người xem thêm không list rộng, quản trị đọc tất cả`, async () => {
      await assertFails(getDocs(collection(as(XEM1), c)));
      await assertSucceeds(getDocs(collection(as(OWNER), c)));
    });
  }

  test('tài liệu cũ (không có memberUids): chủ đọc được, người xem thêm không', async () => {
    await assertSucceeds(getDoc(doc(as(CHINH), 'adAccounts/act_33333')));
    await assertSucceeds(getDoc(doc(as(CHINH), 'adReports/act_33333_2026-11')));
    await assertSucceeds(getDocs(query(collection(as(CHINH), 'adAccounts'), where('uid', '==', 'chinh'))));
    await assertFails(getDoc(doc(as(XEM1), 'adAccounts/act_33333')));
    await assertFails(getDoc(doc(as(XEM1), 'adReports/act_33333_2026-11')));
  });

  test('người xem thêm không ghi được gì', async () => {
    await assertFails(updateDoc(doc(as(XEM1), 'adAccounts/act_11111'), { lowVnd: 0 }));
    await assertFails(setDoc(doc(as(XEM1), 'adReports/act_11111_2026-12'), { uid: 'xem1', memberUids: ['xem1'] }));
  });
});

describe('quản trị ghi 3 trường người xem', () => {
  const put = (extra, drop = []) => setDoc(doc(as(OWNER), 'adAccounts/act_44444'), without(config(extra), ...drop));
  test('hợp lệ: có người xem, không có người xem, tài liệu cũ không có 3 khóa', async () => {
    await assertSucceeds(put({}));
    await assertSucceeds(put({ viewerUids: [], viewerEmails: [], memberUids: ['chinh'] }));
    await assertSucceeds(put({}, ['viewerUids', 'viewerEmails', 'memberUids']));
    const ten = Array.from({ length: 10 }, (_, i) => `v${i}`);
    await assertSucceeds(put({ viewerUids: ten, viewerEmails: ten.map((x) => `${x}@e.com`), memberUids: ['chinh', ...ten] }));
  });
  test('sửa TKQC cũ: lưu thêm 3 trường được', async () => {
    await assertSucceeds(updateDoc(doc(as(OWNER), 'adAccounts/act_33333'), { ...members(), updatedAt: serverTimestamp(), updatedBy: 'owner' }));
  });
  test('memberUids[0] != uid → từ chối', async () => {
    await assertFails(put({ memberUids: ['xem1', 'chinh'] }));
  });
  test('thiếu một người xem trong memberUids → từ chối', async () => {
    await assertFails(put({ viewerUids: ['xem1', 'xem2'], viewerEmails: ['x1@e.com', 'x2@e.com'], memberUids: ['chinh', 'xem1', 'khac'] }));
    await assertFails(put({ viewerUids: ['xem1', 'xem2'], viewerEmails: ['x1@e.com', 'x2@e.com'], memberUids: ['chinh', 'xem1'] }));
  });
  test('thừa người trong memberUids → từ chối', async () => {
    await assertFails(put({ memberUids: ['chinh', 'xem1', 'lạ'] }));
  });
  test('11 người xem → từ chối', async () => {
    const v = Array.from({ length: 11 }, (_, i) => `v${i}`);
    await assertFails(put({ viewerUids: v, viewerEmails: v.map((x) => `${x}@e.com`), memberUids: ['chinh', ...v] }));
  });
  test('viewerEmails lệch độ dài → từ chối', async () => {
    await assertFails(put({ viewerEmails: [] }));
    await assertFails(put({ viewerEmails: ['a@e.com', 'b@e.com'] }));
  });
  test('trùng người xem, người xem trùng tài khoản chính, thiếu một–hai khóa → từ chối', async () => {
    await assertFails(put({ viewerUids: ['xem1', 'xem1'], viewerEmails: ['a@e.com', 'b@e.com'], memberUids: ['chinh', 'xem1', 'xem1'] }));
    await assertFails(put({ viewerUids: ['chinh'], viewerEmails: ['chinh@example.com'], memberUids: ['chinh', 'chinh'] }));
    await assertFails(put({}, ['memberUids']));
    await assertFails(put({}, ['viewerEmails']));
    await assertFails(put({ viewerUids: 'xem1' }));
  });
});

describe('adTopups — người xem thêm', () => {
  test('người xem thêm tạo được lệnh nạp cho TKQC đó; người ngoài không', async () => {
    await assertSucceeds(setDoc(doc(as(XEM1), 'adTopups/ADSBK7Q3PX'), adTop()));
    await assertFails(setDoc(doc(as(NGOAI), 'adTopups/ADSBAAAAA2'), adTop({ code: 'ADSBAAAAA2', uid: 'ngoai', email: 'ngoai@example.com' })));
  });
  test('người xem thêm không giả uid người khác; không tạo cho TKQC khác', async () => {
    await assertFails(setDoc(doc(as(XEM1), 'adTopups/ADSBAAAAA3'), adTop({ code: 'ADSBAAAAA3', uid: 'chinh', email: 'chinh@example.com' })));
    await assertFails(setDoc(doc(as(XEM1), 'adTopups/ADSBAAAAA4'), adTop({ code: 'ADSBAAAAA4', actId: 'act_33333' })));
  });
  test('tài khoản chính vẫn tạo được', async () => {
    await assertSucceeds(setDoc(doc(as(CHINH), 'adTopups/ADSBAAAAA5'), adTop({ code: 'ADSBAAAAA5', uid: 'chinh', email: 'chinh@example.com' })));
  });
  test('bị gỡ khỏi TKQC thì hết quyền tạo và hết quyền đọc', async () => {
    await assertSucceeds(updateDoc(doc(as(OWNER), 'adAccounts/act_11111'), { viewerUids: [], viewerEmails: [], memberUids: ['chinh'], updatedAt: serverTimestamp(), updatedBy: 'owner' }));
    await assertFails(setDoc(doc(as(XEM1), 'adTopups/ADSBAAAAA6'), adTop({ code: 'ADSBAAAAA6' })));
    await assertFails(getDoc(doc(as(XEM1), 'adAccounts/act_11111')));
  });
  test('mỗi người chỉ đọc lệnh nạp do mình tạo', async () => {
    await assertSucceeds(setDoc(doc(as(XEM1), 'adTopups/ADSBK7Q3PX'), adTop()));
    await assertFails(getDoc(doc(as(CHINH), 'adTopups/ADSBK7Q3PX')));
    await assertSucceeds(getDoc(doc(as(XEM1), 'adTopups/ADSBK7Q3PX')));
  });
});

describe('người xem thêm phải xác minh email; ghi lệch và TKQC ẩn', () => {
  const chuaXacMinh = () => env.authenticatedContext('xem1', { email: 'x1@e.com', email_verified: false }).firestore();
  test('người xem thêm CHƯA xác minh email: không get, không list, không tạo lệnh nạp', async () => {
    const db = chuaXacMinh();
    await assertFails(getDoc(doc(db, 'adAccounts/act_11111')));
    await assertFails(getDoc(doc(db, 'adReports/act_11111_2026-11')));
    await assertFails(getDocs(query(collection(db, 'adAccounts'), where('memberUids', 'array-contains', 'xem1'))));
    await assertFails(getDocs(query(collection(db, 'adReports'), where('memberUids', 'array-contains', 'xem1'))));
    await assertFails(setDoc(doc(db, 'adTopups/ADSBK7Q3PX'), adTop()));
  });
  test('tài khoản chính chưa xác minh email vẫn đọc được như trước (không đổi hành vi cũ)', async () => {
    const db = env.authenticatedContext('chinh', { email: 'chinh@example.com', email_verified: false }).firestore();
    await assertSucceeds(getDoc(doc(db, 'adAccounts/act_11111')));
    await assertSucceeds(getDocs(query(collection(db, 'adReports'), where('uid', '==', 'chinh'))));
  });
  test('quản trị chỉ đổi uid (để memberUids cũ) → từ chối; xóa lẻ một khóa → từ chối', async () => {
    const db = as(OWNER);
    await assertFails(updateDoc(doc(db, 'adAccounts/act_11111'), { uid: 'ngoai', customerEmail: 'ngoai@example.com', updatedAt: serverTimestamp(), updatedBy: 'owner' }));
    await assertFails(setDoc(doc(db, 'adAccounts/act_11111'), without(config(), 'viewerEmails')));
  });
  test('TKQC đang ẩn (active = false): người xem thêm không tạo được lệnh nạp', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'adAccounts/act_11111'), { active: false });
    });
    await assertFails(setDoc(doc(as(XEM1), 'adTopups/ADSBK7Q3PX'), adTop()));
  });
});
