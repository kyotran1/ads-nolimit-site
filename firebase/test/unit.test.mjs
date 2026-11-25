// Test đơn vị thuần (không cần emulator): services.ts, avatar-image.ts. Chạy: npm run test:unit
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseCustomerServices, mergeServices, activeServiceCount, isOpen, serviceOfOrder, EMPTY_FACTS, EMPTY_SERVICES } from '../../src/lib/customer/services.ts';
import { cropSquare } from '../../src/lib/ui/avatar-image.ts';

describe('cropSquare', () => {
  test('ảnh ngang/dọc/vuông', () => {
    assert.deepEqual(cropSquare(400, 300), { sx: 50, sy: 0, size: 300 });
    assert.deepEqual(cropSquare(300, 400), { sx: 0, sy: 50, size: 300 });
    assert.deepEqual(cropSquare(128, 128), { sx: 0, sy: 0, size: 128 });
  });
});

describe('parseCustomerServices', () => {
  test('bỏ phần tử sai id / status / since; quyền thiếu → false', () => {
    const cs = parseCustomerServices({
      services: [
        { id: 'ads', label: 'A', status: 'active', since: '2026-11-24', note: '' },
        { id: 'xyz', status: 'active', since: '2026-11-24' },
        { id: 'web', status: 'done', since: '2026-11-24' },
        { id: 'web', status: 'ended', since: '24/11/2026' },
      ],
      access: { ads: true, orders: true, courses: 'yes' },
      updatedBy: 'owner',
    });
    assert.equal(cs.services.length, 1);
    assert.equal(cs.services[0].id, 'ads');
    assert.deepEqual(cs.access, { ads: true, courses: false, keys: false, guides: false });
  });
  test('không có tài liệu → rỗng', () => {
    assert.deepEqual(parseCustomerServices(undefined).services, []);
  });
});

describe('mergeServices / isOpen', () => {
  const manual = { ...EMPTY_SERVICES, services: [{ id: 'ads', label: 'Chạy ads K-Aura', status: 'active', since: '2026-11-01', note: '', source: 'manual' }, { id: 'web', label: '', status: 'ended', since: '2026-10-01', note: '', source: 'manual' }] };
  test('trùng id với đơn → một thẻ, ưu tiên gán tay, ghi +1 đơn', () => {
    const cards = mergeServices(manual, { ...EMPTY_FACTS, paidOrders: [{ type: 'product', productId: 'ads', name: 'x', createdAt: new Date('2026-11-20T00:00:00Z') }] }, 'vi');
    assert.equal(cards.filter((c) => c.id === 'ads').length, 1);
    assert.equal(cards[0].id, 'ads');
    assert.equal(cards[0].label, 'Chạy ads K-Aura');
    assert.equal(cards[0].extra, '+1 đơn');
  });
  test('active trước ended; TKQC → thẻ ads có tên TKQC; khóa học → training', () => {
    const cards = mergeServices(manual, { ...EMPTY_FACTS, adAccounts: [{ label: 'K-Aura', service: 'ads' }], courses: 2 }, 'vi');
    assert.deepEqual(cards.map((c) => c.id), ['ads', 'training', 'web']);
    assert.equal(cards[0].extra, 'K-Aura');
    assert.equal(cards[1].goto, 'courses');
  });
  test('đơn ad-budget → ad-budget; đơn khóa học → training; lạ → other', () => {
    assert.equal(serviceOfOrder('product', 'ad-budget'), 'ad-budget');
    assert.equal(serviceOfOrder('course', 'c1'), 'training');
    assert.equal(serviceOfOrder('product', 'abc'), 'other');
    assert.equal(serviceOfOrder('service', 'ai-starter-setup'), 'ai-starter');
    assert.equal(serviceOfOrder('service', 'ai-sales-monthly'), 'ai-sales');
    assert.equal(serviceOfOrder('service', 'training-workshop'), 'training');
  });
  test('isOpen: TKQC mở ads dù chưa cấp; guides chỉ theo quyền', () => {
    assert.equal(isOpen('ads', EMPTY_SERVICES, { ...EMPTY_FACTS, adAccounts: [{ label: 'x', service: 'ads' }] }), true);
    assert.equal(isOpen('ads', EMPTY_SERVICES, EMPTY_FACTS), false);
    assert.equal(isOpen('guides', EMPTY_SERVICES, { ...EMPTY_FACTS, keys: 3 }), false);
    assert.equal(isOpen('guides', { ...EMPTY_SERVICES, access: { ads: false, courses: false, keys: false, guides: true } }, EMPTY_FACTS), true);
  });
});

describe('activeServiceCount (số dịch vụ ở danh sách khách phải khớp trang chi tiết)', () => {
  const manual = parseCustomerServices({ services: [{ id: 'ad-budget', label: 'Nạp ngân sách quảng cáo', status: 'active', since: '2026-11-24', note: '', source: 'manual' }], access: {} });
  test('1 gán tay + TKQC (dịch vụ khác id) → 2', () => {
    assert.equal(activeServiceCount(manual, { ...EMPTY_FACTS, adAccounts: [{ label: 'A', service: 'ads' }, { label: 'B', service: 'ads' }] }), 2);
  });
  test('chỉ có TKQC → 1 (nhiều TKQC cùng loại vẫn là một dịch vụ)', () => {
    assert.equal(activeServiceCount(EMPTY_SERVICES, { ...EMPTY_FACTS, adAccounts: [{ label: 'A', service: 'ads' }, { label: 'B', service: 'ads' }] }), 1);
  });
  test('gán tay trùng id với TKQC → không đếm đôi; dịch vụ đã kết thúc không đếm', () => {
    const cs = parseCustomerServices({ services: [{ id: 'ads', label: '', status: 'active', since: '2026-11-01', note: '', source: 'manual' }, { id: 'web', label: '', status: 'ended', since: '2026-10-01', note: '', source: 'manual' }], access: {} });
    assert.equal(activeServiceCount(cs, { ...EMPTY_FACTS, adAccounts: [{ label: 'A', service: 'ads' }] }), 1);
  });
  test('không có gì → 0', () => assert.equal(activeServiceCount(EMPTY_SERVICES, EMPTY_FACTS), 0));
});
