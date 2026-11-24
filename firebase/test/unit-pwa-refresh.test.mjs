// Tự làm mới số liệu khi khách quay lại trang (src/lib/pwa/refresh.ts). Chạy: npm run test:unit
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRefresh, REFRESH_AFTER_MS } from '../../src/lib/pwa/refresh.ts';

describe('shouldRefresh', () => {
  const t0 = 1_800_000_000_000;
  test('chưa từng ẩn → không', () => assert.equal(shouldRefresh(0, t0, true), false));
  test('ẩn chưa đủ 5 phút → không', () => assert.equal(shouldRefresh(t0, t0 + REFRESH_AFTER_MS - 1, true), false));
  test('ẩn đủ 5 phút, có mạng → có', () => assert.equal(shouldRefresh(t0, t0 + REFRESH_AFTER_MS, true), true));
  test('ẩn lâu nhưng mất mạng → không (giữ số liệu đang có, không hiện lỗi)', () => assert.equal(shouldRefresh(t0, t0 + 3_600_000, false), false));
  test('đồng hồ máy lùi lại → không', () => assert.equal(shouldRefresh(t0, t0 - 1000, true), false));
});
