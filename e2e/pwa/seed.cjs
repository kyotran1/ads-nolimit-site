// Seed data for V4 e2e (emulator only, written as "owner" so rules are bypassed).
const { emu } = require('./harness.cjs');

const DAY = 86400000;
const ago = (d) => new Date(Date.now() - d * DAY);

const products = [
  { id: 'ai-starter-setup', planId: 'ai-starter', type: 'service', pricing: 'fixed', price: 4900000, priceUsd: 189, maxQty: 1, name: { vi: 'AI Agent Khởi đầu — Cài đặt', en: 'AI Agent Starter — Setup' }, active: true, sort: 1 },
  { id: 'ai-starter-monthly', planId: 'ai-starter', type: 'service', pricing: 'fixed', price: 990000, priceUsd: 39, maxQty: 12, name: { vi: 'AI Agent Khởi đầu — Duy trì', en: 'AI Agent Starter — Monthly' }, unit: { vi: 'tháng', en: 'months' }, active: true, sort: 2 },
  { id: 'ai-sales-setup', planId: 'ai-sales', type: 'service', pricing: 'fixed', price: 12900000, priceUsd: 499, maxQty: 1, name: { vi: 'AI Agent Bán hàng — Cài đặt', en: 'AI Agent Sales — Setup' }, active: true, sort: 3 },
  { id: 'ai-sales-monthly', planId: 'ai-sales', type: 'service', pricing: 'fixed', price: 2490000, priceUsd: 99, maxQty: 12, name: { vi: 'AI Agent Bán hàng — Duy trì', en: 'AI Agent Sales — Monthly' }, unit: { vi: 'tháng', en: 'months' }, active: true, sort: 4 },
  { id: 'training-workshop', planId: 'training', type: 'service', pricing: 'fixed', price: 990000, priceUsd: 39, maxQty: 20, name: { vi: 'Đào tạo AI cho chủ shop — Học phí', en: 'AI training for shop owners — Fee' }, unit: { vi: 'người', en: 'people' }, active: true, sort: 5 },
  { id: 'ad-budget', planId: 'ad-budget', type: 'ad_budget', pricing: 'variable', minAmount: 500000, maxAmount: 500000000, name: { vi: 'Nạp ngân sách quảng cáo', en: 'Ad budget top-up' }, active: true, sort: 6 },
];

async function seedGlobal({ payment = true, content = true } = {}) {
  for (const p of products) await emu.set(`products/${p.id}`, { ...p, updatedAt: ago(1) });
  if (payment)
    await emu.set('settings/payment', {
      bankBin: '970436',
      bankName: 'Vietcombank',
      accountNumber: '0123456789',
      accountName: 'ADS NOLIMIT TEST',
      note: 'Tài khoản thử nghiệm (emulator).',
      updatedAt: ago(1),
      updatedBy: 'owner-test',
    });
  if (content) {
    await emu.set('courses/ai-co-ban', {
      title: 'AI cho chủ shop: từ số 0 đến trợ lý bán hàng',
      titleEn: 'AI for shop owners: from zero to a sales assistant',
      description: 'Dùng ChatGPT, Claude và AI Agent để trả lời khách, viết nội dung và báo cáo quảng cáo mỗi ngày.',
      descriptionEn: 'Use ChatGPT, Claude and AI agents to answer customers, write content and report on ads every day.',
      price: 990000, priceUsd: 39, cover: 'aurora', published: true, sort: 1,
      outline: [
        { title: 'AI Agent là gì, dùng vào việc gì', titleEn: 'What an AI agent is and what it is for', duration: '12:30' },
        { title: 'Viết câu lệnh (prompt) cho shop', titleEn: 'Writing prompts for your shop', duration: '18:05' },
        { title: 'Tự động trả lời tin nhắn fanpage', titleEn: 'Auto-replying to page messages', duration: '24:40' },
      ],
      updatedAt: ago(2),
    });
    await emu.set('courses/ai-co-ban/lessons/l1', { title: 'AI Agent là gì, dùng vào việc gì', titleEn: 'What an AI agent is and what it is for', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', duration: '12:30', sort: 1, updatedAt: ago(2) });
    await emu.set('courses/ai-co-ban/lessons/l2', { title: 'Viết câu lệnh (prompt) cho shop', titleEn: 'Writing prompts for your shop', videoUrl: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view', duration: '18:05', sort: 2, updatedAt: ago(2) });
    await emu.set('courses/ai-co-ban/lessons/l3', { title: 'Tự động trả lời tin nhắn fanpage', titleEn: 'Auto-replying to page messages', videoUrl: '', duration: '24:40', sort: 3, updatedAt: ago(2) });
    await emu.set('courses/quang-cao-thuc-chien', {
      title: 'Quảng cáo Facebook thực chiến 2026',
      titleEn: 'Hands-on Facebook ads 2026',
      description: 'Dựng chiến dịch, đọc số liệu, tối ưu ngân sách và tránh vi phạm chính sách.',
      descriptionEn: 'Build campaigns, read the numbers, optimise budgets and stay within policy.',
      price: 1490000, priceUsd: 59, cover: 'sunset', published: true, sort: 2,
      outline: [
        { title: 'Cấu trúc chiến dịch', duration: '15:00' },
        { title: 'Đọc báo cáo', duration: '21:10' },
      ],
      updatedAt: ago(2),
    });
    await emu.set('courses/quang-cao-thuc-chien/lessons/l1', { title: 'Cấu trúc chiến dịch', videoUrl: 'https://youtu.be/abcdefghijk', duration: '15:00', sort: 1, updatedAt: ago(2) });
    await emu.set('courses/khoa-nhap', { title: 'Bản nháp chưa đăng', price: 500000, published: false, sort: 9, updatedAt: ago(2) });
    await emu.set('guides/nap-tien', {
      title: 'Cách nạp tiền vào số dư',
      titleEn: 'How to top up your balance',
      category: 'Tài khoản & số dư',
      categoryEn: 'Account & balance',
      body: '# Nạp tiền bằng VietQR\n\n1. Vào mục **Nạp tiền & Số dư**.\n2. Chọn số tiền rồi bấm *Tạo lệnh nạp*.\n3. Quét mã QR bằng app ngân hàng.\n\nGhi đúng nội dung `ADSN…` để được cộng nhanh. Xem thêm [điều khoản](https://www.ads-nolimit.agency/dieu-khoan/).',
      bodyEn: '# Top up with VietQR\n\n1. Open **Top up & balance**.\n2. Choose an amount and press *Create top-up*.\n3. Scan the QR code with your banking app.',
      videoUrl: '',
      published: true, sort: 1, updatedAt: ago(1),
    });
    await emu.set('guides/doi-may', { title: 'Đổi máy cho key AI Office', titleEn: 'Moving your AI Office key to a new device', category: 'Key & phần mềm', categoryEn: 'Keys & software', body: 'Bấm **Yêu cầu đổi máy** ở mục Key & máy.\n\n- ADS-Nolimit gỡ máy cũ\n- Bạn kích hoạt lại trên máy mới', videoUrl: 'https://youtu.be/abcdefghijk', published: true, sort: 2, updatedAt: ago(1) });
    await emu.set('guides/nhap', { title: 'Nháp', category: 'Khác', body: 'x', published: false, sort: 3, updatedAt: ago(1) });
  }
}

async function seedCustomer(uid, email, { rich = true } = {}) {
  await emu.set(`users/${uid}`, { displayName: 'Lan Nguyễn', email, phone: '0912 345 678', company: 'Shop Lan', createdAt: ago(30), updatedAt: ago(1) });
  if (!rich) return;
  await emu.set(`wallets/${uid}`, { uid, balance: 3010000, updatedAt: ago(0.2), lastTx: 'adj-seed' });
  await emu.set(`transactions/topup_ADSNSEED22`, { uid, type: 'topup', amount: 5000000, balanceAfter: 5000000, refType: 'topup', refId: 'ADSNSEED22', createdAt: ago(6), by: 'owner-test' });
  await emu.set(`transactions/order-seed-1`, { uid, type: 'purchase', amount: -990000, balanceAfter: 4010000, refType: 'order', refId: 'order-seed-1', createdAt: ago(5) });
  await emu.set(`transactions/order-seed-2`, { uid, type: 'purchase', amount: -1980000, balanceAfter: 2030000, refType: 'order', refId: 'order-seed-2', createdAt: ago(3) });
  await emu.set(`transactions/refund_order-seed-1`, { uid, type: 'refund', amount: 990000, balanceAfter: 3020000, refType: 'order', refId: 'order-seed-1', createdAt: ago(2), by: 'owner-test' });
  await emu.set(`transactions/adj-seed`, { uid, type: 'adjust', amount: -10000, balanceAfter: 3010000, note: 'Phí chuyển khoản liên ngân hàng', createdAt: ago(0.2), by: 'owner-test' });
  await emu.set(`topups/ADSNSEED22`, { uid, email, amount: 5000000, code: 'ADSNSEED22', status: 'approved', lang: 'vi', createdAt: ago(6.1), decidedAt: ago(6), decidedBy: 'owner-test', txId: 'topup_ADSNSEED22' });
  await emu.set(`topups/ADSNPEND23`, { uid, email, amount: 2000000, code: 'ADSNPEND23', status: 'pending', lang: 'vi', createdAt: ago(0.1) });
  await emu.set(`topups/ADSNREJ234`, { uid, email, amount: 300000, code: 'ADSNREJ234', status: 'rejected', reason: 'Chưa nhận được tiền sau 3 ngày', lang: 'vi', createdAt: ago(10), decidedAt: ago(7), decidedBy: 'owner-test' });
  await emu.set(`orders/order-seed-1`, { uid, email, type: 'service', productId: 'training-workshop', name: 'Đào tạo AI cho chủ shop — Học phí', qty: 1, unitPrice: 990000, total: 990000, status: 'refunded', lang: 'vi', createdAt: ago(5), updatedAt: ago(2), refundedAt: ago(2), adminNote: 'Lớp đổi lịch, đã hoàn tiền.' });
  await emu.set(`orders/order-seed-2`, { uid, email, type: 'service', productId: 'ai-starter-monthly', name: 'AI Agent Khởi đầu — Duy trì', qty: 2, unitPrice: 990000, total: 1980000, status: 'processing', lang: 'vi', note: 'Gia hạn 2 tháng cho fanpage chính.', createdAt: ago(3), updatedAt: ago(1) });
  await emu.set(`keys/AINO-K7QP-2XRT-9MZA`, {
    uid, email, key: 'AINO-K7QP-2XRT-9MZA', plan: 'AI Office Pro', maxMachines: 3,
    machines: [ { id: 'm-1', name: 'PC văn phòng (Windows 11)', activatedAt: ago(4) }, { id: 'm-2', name: 'Laptop Lan', activatedAt: ago(1) } ],
    status: 'active', createdAt: ago(5), updatedAt: ago(1), issuedBy: 'owner-test',
  });
  await emu.set(`courseAccess/${uid}_ai-co-ban`, { uid, courseId: 'ai-co-ban', source: 'admin', by: 'owner-test', createdAt: ago(4) });
  await emu.set(`requests/req-seed-1`, { uid, planId: 'automation', note: 'Muốn tự động báo cáo quảng cáo mỗi sáng.', contact: 'Zalo 0912 345 678', lang: 'vi', status: 'contacted', createdAt: ago(8) });
}

module.exports = { seedGlobal, seedCustomer, products, ago };
