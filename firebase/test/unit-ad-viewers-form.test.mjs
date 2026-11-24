// Test đơn vị thuần: src/lib/admin/viewers.ts (email người xem thêm của TKQC). Chạy: npm run test:unit
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseViewerEmails, readStrings, buildMembers, roleInAccount, MAX_VIEWERS } from '../../src/lib/admin/viewers.ts';

describe('parseViewerEmails', () => {
  test('nhiều dòng + dấu phẩy + chấm phẩy + khoảng trắng', () => {
    const r = parseViewerEmails('a@x.com\nb@x.com, c@x.com; d@x.com  e@x.com', 'main@x.com');
    assert.deepEqual(r.emails, ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com']);
    assert.deepEqual(r.errors, []);
  });
  test('chữ hoa → thường; trùng giữ một', () => {
    const r = parseViewerEmails('A@X.com\na@x.COM\nb@x.com', 'main@x.com');
    assert.deepEqual(r.emails, ['a@x.com', 'b@x.com']);
    assert.deepEqual(r.errors, []);
  });
  test('trùng email chính → lỗi nêu email đó', () => {
    const r = parseViewerEmails('Main@x.com\na@x.com', 'main@x.com');
    assert.equal(r.errors.length, 1);
    assert.ok(r.errors[0].includes('main@x.com'));
  });
  test('sai dạng email → lỗi nêu chuỗi đó', () => {
    const r = parseViewerEmails('khong-phai-email\na@x.com', 'main@x.com');
    assert.equal(r.errors.length, 1);
    assert.ok(r.errors[0].includes('khong-phai-email'));
  });
  test('11 email → lỗi tối đa 10', () => {
    const text = Array.from({ length: 11 }, (_, i) => `u${i}@x.com`).join('\n');
    const r = parseViewerEmails(text, 'main@x.com');
    assert.ok(r.errors.some((e) => e.includes('tối đa 10')));
    assert.equal(MAX_VIEWERS, 10);
  });
  test('đúng 10 email → không lỗi', () => {
    const text = Array.from({ length: 10 }, (_, i) => `u${i}@x.com`).join('\n');
    assert.deepEqual(parseViewerEmails(text, 'main@x.com').errors, []);
  });
  test('rỗng → emails rỗng, không lỗi', () => {
    assert.deepEqual(parseViewerEmails('  \n ,; ', 'main@x.com'), { emails: [], errors: [] });
    assert.deepEqual(parseViewerEmails('', 'main@x.com'), { emails: [], errors: [] });
  });
});

describe('readStrings', () => {
  test('không phải mảng → rỗng; bỏ phần tử không phải chuỗi/rỗng', () => {
    assert.deepEqual(readStrings(undefined), []);
    assert.deepEqual(readStrings('abc'), []);
    assert.deepEqual(readStrings({ 0: 'a' }), []);
    assert.deepEqual(readStrings(['a', 1, null, '', 'b']), ['a', 'b']);
  });
});

describe('buildMembers', () => {
  test('memberUids = [chính, ...xem], giữ thứ tự, email cùng độ dài', () => {
    const r = buildMembers('main', [{ uid: 'v1', email: 'a@x.com' }, { uid: 'v2', email: 'b@x.com' }]);
    assert.deepEqual(r, { viewerUids: ['v1', 'v2'], viewerEmails: ['a@x.com', 'b@x.com'], memberUids: ['main', 'v1', 'v2'] });
  });
  test('bỏ người xem trùng chính và trùng nhau', () => {
    const r = buildMembers('main', [{ uid: 'main', email: 'm@x.com' }, { uid: 'v1', email: 'a@x.com' }, { uid: 'v1', email: 'a2@x.com' }]);
    assert.deepEqual(r, { viewerUids: ['v1'], viewerEmails: ['a@x.com'], memberUids: ['main', 'v1'] });
  });
  test('không có người xem (tài liệu cũ) → memberUids = [uid]', () => {
    assert.deepEqual(buildMembers('main', []), { viewerUids: [], viewerEmails: [], memberUids: ['main'] });
  });
  test('đổi chính sang người từng là xem → chỉ còn là chính', () => {
    // v1 từng xem, nay thành chính; ô nhập vẫn còn v1 → bị bỏ khỏi danh sách xem
    const r = buildMembers('v1', [{ uid: 'v1', email: 'a@x.com' }, { uid: 'v2', email: 'b@x.com' }]);
    assert.deepEqual(r.memberUids, ['v1', 'v2']);
    assert.deepEqual(r.viewerUids, ['v2']);
  });
});

describe('roleInAccount', () => {
  test('chính / xem thêm / không', () => {
    assert.equal(roleInAccount({ uid: 'c', memberUids: ['c', 'v'] }, 'c'), 'main');
    assert.equal(roleInAccount({ uid: 'c', memberUids: ['c', 'v'] }, 'v'), 'viewer');
    assert.equal(roleInAccount({ uid: 'c', memberUids: ['c', 'v'] }, 'z'), null);
  });
  test('tài liệu cũ không có memberUids; viewerUids sai kiểu', () => {
    assert.equal(roleInAccount({ uid: 'c' }, 'c'), 'main');
    assert.equal(roleInAccount({ uid: 'c' }, 'v'), null);
    assert.equal(roleInAccount({ uid: 'c', memberUids: 'v' }, 'v'), null);
  });
});

test('parseViewerEmails: cùng một chỗ sai nhập lặp nhiều lần chỉ báo một lỗi', () => {
  const r = parseViewerEmails('sai\nsai\nchinh@x.com\nCHINH@x.com\nok@x.com', 'chinh@x.com');
  assert.deepEqual(r.emails, ['ok@x.com']);
  assert.equal(r.errors.length, 2);
});
