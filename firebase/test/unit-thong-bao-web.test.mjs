// Phần thuần của mục "Thông báo" (src/lib/account/notify-format.ts): chuẩn hóa số Zalo, mã nối, đọc tùy chọn.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomFillSync } from 'node:crypto';
import { CODE_RE, DEFAULT_NOTIFY, makeCode, messengerLink, messengerText, normalizeZaloPhone, parseNotify, pendingValid } from '../../src/lib/account/notify-format.ts';

describe('normalizeZaloPhone', () => {
  test('số chuẩn giữ nguyên', () => {
    for (const p of ['0912345678', '0351234567', '0561234567', '0771234567', '0881234567']) assert.equal(normalizeZaloPhone(p), p);
  });
  test('có khoảng trắng, chấm, gạch, ngoặc → bỏ hết', () => {
    for (const raw of ['0912 345 678', '091.234.5678', '091-234-5678', '(091) 234 5678', '  0912345678  ', '0912 345 678']) {
      assert.equal(normalizeZaloPhone(raw), '0912345678', JSON.stringify(raw));
    }
  });
  test('+84 / 84 → 0 (có hoặc không có khoảng trắng, có số 0 thừa)', () => {
    for (const raw of ['+84912345678', '+84 912 345 678', '84912345678', '+84 (912) 345-678', '+84 0912345678', '+840912345678']) assert.equal(normalizeZaloPhone(raw), '0912345678', raw);
  });
  test('rỗng → "" (chưa nhập)', () => {
    assert.equal(normalizeZaloPhone(''), '');
    assert.equal(normalizeZaloPhone('   '), '');
  });
  test('sai → null: thiếu/thừa số, đầu số không phải di động, chữ, mã nước khác', () => {
    for (const raw of ['091234567', '09123456789', '0212345678', '0112345678', '0412345678', '0612345678', 'abc', '09123abc78', '+1 912 345 6789', '+85 912345678', '84', '+84', '0', '12345', '+84 12345678', '0912345678 ext 2']) {
      assert.equal(normalizeZaloPhone(raw), null, raw);
    }
  });
  test('kết quả luôn khớp luật Firestore (hoặc rỗng/null)', () => {
    for (const raw of ['0912 345 678', '+84 912 345 678', '84912345678']) assert.match(normalizeZaloPhone(raw), /^0[35789][0-9]{8}$/);
  });
});

describe('mã nối Messenger', () => {
  test('makeCode: đúng 10 ký tự A-Z0-9, khớp luật, không trùng trong 2000 lần', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const c = makeCode((b) => randomFillSync(b));
      assert.match(c, CODE_RE);
      seen.add(c);
    }
    assert.equal(seen.size, 2000);
  });
  test('makeCode: bỏ byte ≥ 252 (không lệch xác suất) và vẫn đủ 10 ký tự', () => {
    let n = 0;
    const c = makeCode((b) => b.forEach((_, i) => (b[i] = n++ % 2 ? 255 : i % 252)));
    assert.match(c, CODE_RE);
  });
  test('makeCode: dùng toàn bộ bảng chữ (byte 0..35 → A..Z0..9)', () => {
    let k = 0;
    const c = makeCode((b) => b.forEach((_, i) => (b[i] = k++ % 36)));
    assert.equal(c, 'ABCDEFGHIJ');
  });
  test('link m.me + tin mẫu đúng định dạng của kế hoạch', () => {
    assert.equal(messengerLink('AB12CD34EF'), 'https://m.me/adsnolimit.agency2610?ref=NOI-AB12CD34EF');
    assert.equal(messengerText('AB12CD34EF'), 'Nối thông báo NOI-AB12CD34EF');
  });
  test('pendingValid: dưới 7 ngày mới còn', () => {
    const now = 1_800_000_000_000;
    assert.equal(pendingValid(now - 86400000, now), true);
    assert.equal(pendingValid(now - 7 * 86400000, now), false);
    assert.equal(pendingValid(now + 1000, now), false);
    assert.equal(pendingValid(NaN, now), false);
  });
});

describe('parseNotify', () => {
  test('chưa có notify → mặc định (email bật, Messenger nhận khi nối, Zalo tắt)', () => {
    for (const d of [undefined, null, {}, { notify: null }, { notify: 'x' }, 5]) assert.deepEqual(parseNotify(d), DEFAULT_NOTIFY);
    assert.deepEqual(DEFAULT_NOTIFY, { email: true, messenger: true, zalo: false, zaloPhone: '' });
  });
  test('đọc đúng giá trị đã lưu', () => {
    assert.deepEqual(parseNotify({ notify: { email: false, messenger: false, zalo: true, zaloPhone: '0912345678' } }), { email: false, messenger: false, zalo: true, zaloPhone: '0912345678' });
  });
  test('Zalo bật nhưng số hỏng/rỗng → tắt (không hứa nhắc khi không có số)', () => {
    assert.equal(parseNotify({ notify: { email: true, messenger: true, zalo: true, zaloPhone: '' } }).zalo, false);
    assert.equal(parseNotify({ notify: { email: true, messenger: true, zalo: true, zaloPhone: '123' } }).zalo, false);
  });
});
