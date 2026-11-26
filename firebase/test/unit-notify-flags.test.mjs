// Cờ PUBLIC_MESSENGER_NOTIFY (src/config/notify-flags.ts): off | test | on, và quyết định hiện thẻ Messenger ở chế độ thử.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { messengerDecision, messengerMode, notifyTestDecision, parseMessengerMode, NOTIFY_TEST_KEY } from '../../src/config/notify-flags.ts';

describe('parseMessengerMode', () => {
  test('on / test giữ nguyên; thiếu, rỗng, viết hoa, giá trị lạ → off (an toàn)', () => {
    assert.equal(parseMessengerMode('on'), 'on');
    assert.equal(parseMessengerMode('test'), 'test');
    for (const v of [undefined, null, '', 'off', 'ON', 'Test', 'true', '1', 'yes', 5]) assert.equal(parseMessengerMode(v), 'off', String(v));
  });
  test('chạy trong Node (không có import.meta.env) → off', () => {
    assert.equal(messengerMode, 'off');
  });
  test('khóa lưu trình duyệt', () => {
    assert.equal(NOTIFY_TEST_KEY, 'adsnl-tbtest');
  });
});

describe('notifyTestDecision (?tbtest=1 bật, ?tbtest=0 tắt)', () => {
  test('?tbtest=1 → bật và ghi', () => assert.deepEqual(notifyTestDecision('?tbtest=1', null), { enabled: true, write: '1' }));
  test('?tbtest=0 → tắt và xóa, dù đã bật trước đó', () => assert.deepEqual(notifyTestDecision('?tbtest=0', '1'), { enabled: false, write: 'remove' }));
  test('không có tham số → theo giá trị đã ghi, không ghi thêm', () => {
    assert.deepEqual(notifyTestDecision('', '1'), { enabled: true, write: null });
    assert.deepEqual(notifyTestDecision('', null), { enabled: false, write: null });
    assert.deepEqual(notifyTestDecision('?x=1', '0'), { enabled: false, write: null });
  });
  test('tham số nằm giữa chuỗi; giá trị lạ bị bỏ qua; tên gần giống không tính', () => {
    assert.equal(notifyTestDecision('?a=1&tbtest=1&b=2', null).enabled, true);
    assert.equal(notifyTestDecision('?tbtest=2', null).enabled, false);
    assert.equal(notifyTestDecision('?xtbtest=1', null).enabled, false);
    assert.equal(notifyTestDecision('?fbtest=1', null).enabled, false);
  });
});

describe('messengerDecision: hiện thẻ Messenger theo chế độ', () => {
  test('off: không hiện, kể cả có ?tbtest=1 và khóa đã ghi', () => {
    assert.deepEqual(messengerDecision('off', '?tbtest=1', '1'), { show: false, write: null });
  });
  test('on: hiện cho mọi khách, không đụng khóa thử', () => {
    assert.deepEqual(messengerDecision('on', '', null), { show: true, write: null });
    assert.deepEqual(messengerDecision('on', '?tbtest=0', null), { show: true, write: null });
  });
  test('test: chỉ hiện khi đã bật (?tbtest=1 hoặc khóa đã ghi); ?tbtest=0 tắt', () => {
    assert.equal(messengerDecision('test', '', null).show, false);
    assert.deepEqual(messengerDecision('test', '?tbtest=1', null), { show: true, write: '1' });
    assert.equal(messengerDecision('test', '', '1').show, true);
    assert.deepEqual(messengerDecision('test', '?tbtest=0', '1'), { show: false, write: 'remove' });
  });
});
