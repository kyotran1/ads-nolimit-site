// Test đơn vị: mergeById + parseMembers (src/lib/ads/members.ts). Chạy: npm run test:unit
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mergeById, mergeSettled, parseMembers } from '../../src/lib/ads/members.ts';

describe('mergeById', () => {
  test('trùng id chỉ giữ một, giữ thứ tự của a, thêm phần tử mới của b', () => {
    const a = [{ id: 'x', v: 1 }, { id: 'y', v: 2 }];
    const b = [{ id: 'z', v: 3 }, { id: 'x', v: 9 }];
    assert.deepEqual(mergeById(a, b), [{ id: 'x', v: 1 }, { id: 'y', v: 2 }, { id: 'z', v: 3 }]);
  });
  test('rỗng / không đổi đầu vào', () => {
    const a = [{ id: 'x' }];
    assert.deepEqual(mergeById([], []), []);
    assert.deepEqual(mergeById(a, []), [{ id: 'x' }]);
    assert.deepEqual(mergeById([], a), [{ id: 'x' }]);
    mergeById(a, [{ id: 'q' }]);
    assert.equal(a.length, 1);
  });
  test('trùng ngay trong b chỉ lấy một', () => {
    assert.deepEqual(mergeById([], [{ id: 'a' }, { id: 'a' }]), [{ id: 'a' }]);
  });
});

describe('parseMembers', () => {
  test('tài liệu cũ → [] / [] / [uid]', () => {
    assert.deepEqual(parseMembers({ uid: 'u1' }), { viewerUids: [], viewerEmails: [], memberUids: ['u1'] });
  });
  test('tài liệu mới giữ nguyên 3 trường', () => {
    const d = { uid: 'u1', viewerUids: ['a', 'b'], viewerEmails: ['a@e.com', 'b@e.com'], memberUids: ['u1', 'a', 'b'] };
    assert.deepEqual(parseMembers(d), { viewerUids: ['a', 'b'], viewerEmails: ['a@e.com', 'b@e.com'], memberUids: ['u1', 'a', 'b'] });
  });
  test('bỏ phần tử không phải chuỗi / rỗng', () => {
    const r = parseMembers({ uid: 'u1', viewerUids: ['a', 5, null, '', 'b'], viewerEmails: ['a@e.com', {}, 'b@e.com'], memberUids: ['u1', 'a', 7, 'b'] });
    assert.deepEqual(r.viewerUids, ['a', 'b']);
    assert.deepEqual(r.viewerEmails, ['a@e.com', 'b@e.com']);
    assert.deepEqual(r.memberUids, ['u1', 'a', 'b']);
  });
  test('không phải mảng → rỗng; memberUids luôn có uid chính ở đầu', () => {
    assert.deepEqual(parseMembers({ uid: 'u1', viewerUids: 'a', memberUids: 'u1' }), { viewerUids: [], viewerEmails: [], memberUids: ['u1'] });
    assert.deepEqual(parseMembers({ uid: 'u1', memberUids: ['a'] }).memberUids, ['u1', 'a']);
  });
});

describe('mergeSettled', () => {
  const ok = (value) => ({ status: 'fulfilled', value });
  const bad = (reason) => ({ status: 'rejected', reason });
  test('cả hai thành công → gộp không trùng', () => {
    assert.deepEqual(mergeSettled([ok([{ id: 'a' }]), ok([{ id: 'a' }, { id: 'b' }])]), [{ id: 'a' }, { id: 'b' }]);
  });
  test('một truy vấn lỗi → vẫn dùng truy vấn kia', () => {
    assert.deepEqual(mergeSettled([bad(new Error('x')), ok([{ id: 'b' }])]), [{ id: 'b' }]);
    assert.deepEqual(mergeSettled([ok([{ id: 'a' }]), bad(new Error('x'))]), [{ id: 'a' }]);
  });
  test('cả hai lỗi → ném lỗi (để giao diện báo lỗi, không im lặng)', () => {
    assert.throws(() => mergeSettled([bad(new Error('1')), bad(new Error('2'))]), /1/);
  });
});
