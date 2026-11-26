// Thông báo ngân sách thấp qua Messenger + Zalo: users.notify, notifyCodes, notifyLinks, notifyPrivate, zaloQueue.
// Chạy: cd firebase && npm test (cổng emulator lấy từ EMU_PORT, mặc định 8080)
import { test, before, after, beforeEach, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp, Timestamp, deleteField } from 'firebase/firestore';

let env;
const OWNER = { uid: 'owner', email: 'owner@example.com' };
const LAN = { uid: 'lan', email: 'lan@example.com' };
const NAM = { uid: 'nam', email: 'nam@example.com' };
const as = (u) => env.authenticatedContext(u.uid, { email: u.email, email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const notify = (extra = {}) => ({ email: true, messenger: false, zalo: false, zaloPhone: '', ...extra });
const without = (o, ...keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
const profile = (extra = {}) => ({ displayName: 'Lan', email: 'lan@example.com', createdAt: Timestamp.fromDate(new Date('2026-11-01T00:00:00Z')), updatedAt: serverTimestamp(), ...extra });
const CODE = 'AB12CD34EF';
const newCode = (extra = {}) => ({ uid: 'lan', createdAt: serverTimestamp(), ...extra });
const queueDoc = (extra = {}) => ({
  uid: 'lan', actId: 'act_11111', name: 'K-Aura', phone: '0912345678',
  text: 'ADS-Nolimit thông báo: TKQC K-Aura còn khoảng 1.000.000 đ, đủ chạy khoảng 1 ngày.',
  createdAt: Timestamp.fromDate(new Date('2026-11-26T01:00:00Z')), status: 'cho', ...extra,
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
    const t = Timestamp.fromDate(new Date('2026-11-26T01:00:00Z'));
    await setDoc(doc(db, 'admins/owner'), { createdAt: t });
    await setDoc(doc(db, 'users/lan'), { displayName: 'Lan', email: 'lan@example.com', createdAt: t, updatedAt: t });
    await setDoc(doc(db, 'users/nam'), { displayName: 'Nam', email: 'nam@example.com', createdAt: t, updatedAt: t, notify: notify({ zalo: true, zaloPhone: '0988777666' }) });
    await setDoc(doc(db, `notifyCodes/${CODE}`), { uid: 'lan', createdAt: t });
    await setDoc(doc(db, 'notifyLinks/lan'), { messenger: { linked: true, linkedAt: t, name: 'Lan N' } });
    await setDoc(doc(db, 'notifyLinks/nam'), { messenger: { linked: true, linkedAt: t } });
    await setDoc(doc(db, 'notifyPrivate/lan'), { psid: '1234567890', linkedAt: t });
    await setDoc(doc(db, 'zaloQueue/act_11111_lan_2026-11-26'), queueDoc());
    await setDoc(doc(db, 'zaloQueue/act_22222_nam_2026-11-26'), queueDoc({ uid: 'nam', actId: 'act_22222', phone: '0988777666', status: 'da-gui', doneAt: t }));
  });
});

describe('users/{uid}.notify (khách tự ghi)', () => {
  test('1. khách bật/tắt các công tắc và lưu số Zalo hợp lệ', async () => {
    await assertSucceeds(updateDoc(doc(as(LAN), 'users/lan'), { notify: notify({ messenger: true, zalo: true, zaloPhone: '0912345678' }), updatedAt: serverTimestamp() }));
  });
  test('2. mọi đầu số di động hợp lệ (03/05/07/08/09) được lưu', async () => {
    for (const p of ['0351234567', '0561234567', '0771234567', '0881234567', '0991234567']) {
      await assertSucceeds(updateDoc(doc(as(LAN), 'users/lan'), { notify: notify({ zalo: true, zaloPhone: p }), updatedAt: serverTimestamp() }));
    }
  });
  test('3. số Zalo rỗng được (chưa nhập)', async () => {
    await assertSucceeds(updateDoc(doc(as(NAM), 'users/nam'), { notify: notify({ zaloPhone: '' }), updatedAt: serverTimestamp() }));
  });
  test('4. số Zalo sai định dạng bị từ chối (khoảng trắng, +84, thiếu số, đầu số 01/02/04/06)', async () => {
    for (const p of ['0912 345 678', '+84912345678', '091234567', '09123456789', '0212345678', '0112345678', '0412345678', '0612345678', 'abcdefghij', '0912345678\n']) {
      await assertFails(updateDoc(doc(as(LAN), 'users/lan'), { notify: notify({ zalo: true, zaloPhone: p }), updatedAt: serverTimestamp() }));
    }
  });
  test('5. thiếu trường, thừa trường, sai kiểu đều bị từ chối', async () => {
    const bad = [
      without(notify(), 'zaloPhone'),
      without(notify(), 'email'),
      notify({ extra: true }),
      notify({ email: 'true' }),
      notify({ messenger: 1 }),
      notify({ zalo: null }),
      notify({ zaloPhone: 912345678 }),
      'bat',
      ['email'],
    ];
    for (const n of bad) await assertFails(updateDoc(doc(as(LAN), 'users/lan'), { notify: n, updatedAt: serverTimestamp() }));
  });
  test('6. đổi notify mà không kèm updatedAt = request.time bị từ chối (cùng luật hồ sơ)', async () => {
    await assertFails(updateDoc(doc(as(LAN), 'users/lan'), { notify: notify() }));
  });
  test('7. khách tạo hồ sơ mới có notify', async () => {
    await assertSucceeds(setDoc(doc(as({ uid: 'moi', email: 'moi@example.com' }), 'users/moi'), profile({ email: 'moi@example.com', createdAt: serverTimestamp(), notify: notify() })));
  });
  test('8. khách khác không sửa notify của người khác', async () => {
    await assertFails(updateDoc(doc(as(NAM), 'users/lan'), { notify: notify({ messenger: true }), updatedAt: serverTimestamp() }));
  });
  test('9. chưa đăng nhập không ghi notify', async () => {
    await assertFails(updateDoc(doc(anon(), 'users/lan'), { notify: notify(), updatedAt: serverTimestamp() }));
  });
  test('10. hồ sơ cũ (không có notify) vẫn lưu được như trước', async () => {
    await assertSucceeds(updateDoc(doc(as(LAN), 'users/lan'), { displayName: 'Lan Mới', updatedAt: serverTimestamp() }));
  });
  test('11. trường lạ ngoài notify vẫn bị chặn (luật hồ sơ không bị nới)', async () => {
    await assertFails(updateDoc(doc(as(LAN), 'users/lan'), { notify: notify(), thongBao: true, updatedAt: serverTimestamp() }));
  });
});

describe('notifyCodes/{mã}', () => {
  const NEWCODE = 'ZX98YW76VU';
  test('12. khách tạo mã 10 ký tự A-Z0-9 cho chính mình', async () => {
    await assertSucceeds(setDoc(doc(as(LAN), `notifyCodes/${NEWCODE}`), newCode()));
  });
  test('13. mã sai định dạng bị từ chối (ngắn, dài, chữ thường, ký tự lạ)', async () => {
    for (const c of ['AB12CD34E', 'AB12CD34EF1', 'ab12cd34ef', 'AB12CD34E-', 'AB12CD 4EF']) {
      await assertFails(setDoc(doc(as(LAN), `notifyCodes/${c}`), newCode()));
    }
  });
  test('14. không tạo mã mang uid của người khác', async () => {
    await assertFails(setDoc(doc(as(NAM), `notifyCodes/${NEWCODE}`), newCode({ uid: 'lan' })));
  });
  test('15. createdAt phải là giờ máy chủ; thừa trường bị từ chối', async () => {
    await assertFails(setDoc(doc(as(LAN), `notifyCodes/${NEWCODE}`), newCode({ createdAt: Timestamp.fromDate(new Date('2020-01-01')) })));
    await assertFails(setDoc(doc(as(LAN), `notifyCodes/${NEWCODE}`), newCode({ psid: '1' })));
    await assertFails(setDoc(doc(as(LAN), `notifyCodes/${NEWCODE}`), { uid: 'lan' }));
  });
  test('16. không ghi đè mã đã có của người khác', async () => {
    await assertFails(setDoc(doc(as(NAM), `notifyCodes/${CODE}`), newCode({ uid: 'nam' })));
  });
  test('17. không ai đọc được mã: chủ mã, người khác, quản trị, khách vãng lai, cả list', async () => {
    for (const db of [as(LAN), as(NAM), as(OWNER), anon()]) {
      await assertFails(getDoc(doc(db, `notifyCodes/${CODE}`)));
      await assertFails(getDocs(collection(db, 'notifyCodes')));
    }
  });
  test('18. không ai sửa mã (kể cả chủ mã và quản trị)', async () => {
    await assertFails(updateDoc(doc(as(LAN), `notifyCodes/${CODE}`), { uid: 'nam' }));
    await assertFails(updateDoc(doc(as(OWNER), `notifyCodes/${CODE}`), { uid: 'owner' }));
  });
  test('19. chủ mã xóa được mã của mình; người khác không xóa được', async () => {
    await assertFails(deleteDoc(doc(as(NAM), `notifyCodes/${CODE}`)));
    await assertFails(deleteDoc(doc(anon(), `notifyCodes/${CODE}`)));
    await assertSucceeds(deleteDoc(doc(as(LAN), `notifyCodes/${CODE}`)));
  });
  test('20. chưa đăng nhập không tạo được mã', async () => {
    await assertFails(setDoc(doc(anon(), `notifyCodes/${NEWCODE}`), newCode()));
  });
});

describe('notifyLinks/{uid}', () => {
  test('21. khách đọc được doc của mình', async () => {
    await assertSucceeds(getDoc(doc(as(LAN), 'notifyLinks/lan')));
  });
  test('22. khách không đọc doc của người khác, không list; vãng lai không đọc', async () => {
    await assertFails(getDoc(doc(as(NAM), 'notifyLinks/lan')));
    await assertFails(getDocs(collection(as(LAN), 'notifyLinks')));
    await assertFails(getDoc(doc(anon(), 'notifyLinks/lan')));
  });
  test('23. khách bỏ nối: ghi { messenger: { linked: false } }', async () => {
    await assertSucceeds(setDoc(doc(as(LAN), 'notifyLinks/lan'), { messenger: { linked: false } }));
    await assertSucceeds(updateDoc(doc(as(NAM), 'notifyLinks/nam'), { messenger: { linked: false } }));
  });
  test('24. khách chưa từng nối ghi { linked: false } cũng được (không đổi gì)', async () => {
    await assertSucceeds(setDoc(doc(as({ uid: 'moi', email: 'm@e.com' }), 'notifyLinks/moi'), { messenger: { linked: false } }));
  });
  test('25. khách không tự đặt linked: true (không giả vờ đã nối)', async () => {
    await assertFails(setDoc(doc(as(LAN), 'notifyLinks/lan'), { messenger: { linked: true } }));
    await assertFails(setDoc(doc(as({ uid: 'moi', email: 'm@e.com' }), 'notifyLinks/moi'), { messenger: { linked: true, linkedAt: serverTimestamp() } }));
  });
  test('26. khách không ghi thêm trường nào khác (name, linkedAt, trường ngoài messenger)', async () => {
    await assertFails(setDoc(doc(as(LAN), 'notifyLinks/lan'), { messenger: { linked: false, name: 'x' } }));
    await assertFails(setDoc(doc(as(LAN), 'notifyLinks/lan'), { messenger: { linked: false }, psid: '9' }));
    await assertFails(setDoc(doc(as(LAN), 'notifyLinks/lan'), { messenger: false }));
    await assertFails(setDoc(doc(as(LAN), 'notifyLinks/lan'), {}));
  });
  test('27. khách không ghi vào doc người khác; vãng lai không ghi; không ai xóa', async () => {
    await assertFails(setDoc(doc(as(NAM), 'notifyLinks/lan'), { messenger: { linked: false } }));
    await assertFails(setDoc(doc(anon(), 'notifyLinks/lan'), { messenger: { linked: false } }));
    await assertFails(deleteDoc(doc(as(LAN), 'notifyLinks/lan')));
    await assertFails(deleteDoc(doc(as(OWNER), 'notifyLinks/lan')));
  });
});

describe('notifyPrivate/{uid} (PSID, trình duyệt bị cấm hoàn toàn)', () => {
  test('28. chính khách, khách khác, quản trị, vãng lai đều không đọc được', async () => {
    for (const db of [as(LAN), as(NAM), as(OWNER), anon()]) {
      await assertFails(getDoc(doc(db, 'notifyPrivate/lan')));
      await assertFails(getDocs(collection(db, 'notifyPrivate')));
    }
  });
  test('29. không ai ghi, sửa hay xóa được', async () => {
    for (const db of [as(LAN), as(OWNER), anon()]) {
      await assertFails(setDoc(doc(db, 'notifyPrivate/lan'), { psid: '1' }));
      await assertFails(updateDoc(doc(db, 'notifyPrivate/lan'), { psid: '2' }));
      await assertFails(deleteDoc(doc(db, 'notifyPrivate/lan')));
    }
    await assertFails(setDoc(doc(as(NAM), 'notifyPrivate/nam'), { psid: '1' }));
  });
});

describe('zaloQueue/{id}', () => {
  const ID = 'act_11111_lan_2026-11-26';
  test('30. quản trị đọc từng tài liệu và danh sách', async () => {
    await assertSucceeds(getDoc(doc(as(OWNER), `zaloQueue/${ID}`)));
    const snap = await assertSucceeds(getDocs(collection(as(OWNER), 'zaloQueue')));
    if (snap.size !== 2) throw new Error(`mong 2, nhận ${snap.size}`);
  });
  test('31. khách thường (kể cả chủ của tin) không đọc, không list; vãng lai không đọc', async () => {
    await assertFails(getDoc(doc(as(LAN), `zaloQueue/${ID}`)));
    await assertFails(getDocs(collection(as(LAN), 'zaloQueue')));
    await assertFails(getDoc(doc(as(NAM), `zaloQueue/${ID}`)));
    await assertFails(getDoc(doc(anon(), `zaloQueue/${ID}`)));
  });
  test('32. quản trị đánh dấu Đã gửi: status + doneAt = giờ máy chủ', async () => {
    await assertSucceeds(updateDoc(doc(as(OWNER), `zaloQueue/${ID}`), { status: 'da-gui', doneAt: serverTimestamp() }));
  });
  test('33. quản trị đánh dấu Bỏ qua', async () => {
    await assertSucceeds(updateDoc(doc(as(OWNER), `zaloQueue/${ID}`), { status: 'bo-qua', doneAt: serverTimestamp() }));
  });
  test('34. quản trị hoàn tác về chờ (bỏ doneAt)', async () => {
    await assertSucceeds(updateDoc(doc(as(OWNER), 'zaloQueue/act_22222_nam_2026-11-26'), { status: 'cho', doneAt: deleteField() }));
  });
  test('35. không đánh dấu xử lý mà thiếu doneAt hoặc sai giờ; không status lạ', async () => {
    await assertFails(updateDoc(doc(as(OWNER), `zaloQueue/${ID}`), { status: 'da-gui' }));
    await assertFails(updateDoc(doc(as(OWNER), `zaloQueue/${ID}`), { status: 'da-gui', doneAt: Timestamp.fromDate(new Date('2020-01-01')) }));
    await assertFails(updateDoc(doc(as(OWNER), `zaloQueue/${ID}`), { status: 'xong', doneAt: serverTimestamp() }));
  });
  test('36. quản trị không sửa nội dung, số điện thoại, uid của tin', async () => {
    await assertFails(updateDoc(doc(as(OWNER), `zaloQueue/${ID}`), { status: 'da-gui', doneAt: serverTimestamp(), text: 'khác' }));
    await assertFails(updateDoc(doc(as(OWNER), `zaloQueue/${ID}`), { phone: '0900000000' }));
    await assertFails(updateDoc(doc(as(OWNER), `zaloQueue/${ID}`), { uid: 'nam', status: 'da-gui', doneAt: serverTimestamp() }));
  });
  test('37. khách thường không sửa trạng thái; vãng lai không sửa', async () => {
    await assertFails(updateDoc(doc(as(LAN), `zaloQueue/${ID}`), { status: 'da-gui', doneAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(anon(), `zaloQueue/${ID}`), { status: 'da-gui', doneAt: serverTimestamp() }));
  });
  test('38. không ai tạo hay xóa tin trong hàng đợi qua trình duyệt (kể cả quản trị)', async () => {
    await assertFails(setDoc(doc(as(OWNER), 'zaloQueue/moi'), queueDoc()));
    await assertFails(setDoc(doc(as(LAN), 'zaloQueue/moi'), queueDoc()));
    await assertFails(deleteDoc(doc(as(OWNER), `zaloQueue/${ID}`)));
  });
});
