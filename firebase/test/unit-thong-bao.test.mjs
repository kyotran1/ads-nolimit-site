// Chạy apps-script/bot3-thong-bao/thong-bao.gs trong Node với bản giả của dịch vụ Google và của các hàm có sẵn của bot 3
// (fsGet/fsSet/fsCall/thanhVien/traLoi), để kiểm logic nối mã, gửi Messenger, hàng đợi Zalo trước khi dán lên Apps Script thật.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../apps-script/bot3-thong-bao/thong-bao.gs', import.meta.url), 'utf8');

const NOW = Date.parse('2026-11-26T03:00:00Z'); // 10:00 giờ Việt Nam, 26/11/2026
const DAY = 864e5;

const makeEnv = ({ props = {}, graph = () => ({ status: 200, body: { message_id: 'm.1' } }) } = {}) => {
  const store = new Map(); // đường dẫn Firestore → dữ liệu
  const writes = []; // {op, path, data}
  const fetches = []; // gọi Graph
  const mails = [];
  const cache = new Map();
  const properties = new Map(Object.entries({ PAGE_ID: 'PAGE1', PAGE_TOKEN: 'TOKEN_THU', GAS_KEY: 'KHOA_THU', ...props }));
  const ctx = {
    console: { log: () => {}, error: () => {} },
    JSON, Math, Number, String, Object, Array, RegExp, isNaN, encodeURIComponent,
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (properties.has(k) ? properties.get(k) : null) }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, String(v)) }) },
    UrlFetchApp: {
      fetch: (url, opts) => {
        fetches.push({ url, opts });
        const r = graph(url, opts);
        if (r.throw) throw new Error(r.throw);
        return { getResponseCode: () => r.status, getContentText: () => JSON.stringify(r.body ?? {}) };
      },
    },
    MailApp: { sendEmail: (m) => mails.push(m) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'chu@example.com' }) },
    // các hàm có sẵn của bot 3 (bản giả trong bộ nhớ)
    fsGet: (path) => (store.has(path) ? { updateTime: 't', data: structuredClone(store.get(path)) } : null),
    fsSet: (path, obj) => { writes.push({ op: 'set', path, data: obj }); store.set(path, obj); },
    fsCall: (method, path) => { if (method === 'delete') { writes.push({ op: 'delete', path }); store.delete(path); } return {}; },
    thanhVien: (d) => [...new Set([d.uid, ...(Array.isArray(d.memberUids) ? d.memberUids : [])])],
    traLoi: (o) => ({ s: JSON.stringify(o) }),
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const env = { ctx, store, writes, fetches, mails, properties, cache };
  env.sets = (prefix) => writes.filter((w) => w.op === 'set' && w.path.startsWith(prefix));
  env.graphBodies = () => fetches.map((f) => JSON.parse(f.opts.payload));
  return env;
};
const call = (env, fn, ...a) => JSON.parse(JSON.stringify(env.ctx[fn](...a)));
const evText = (text, extra = {}) => ({ sender: { id: 'PSID9' }, recipient: { id: 'PAGE1' }, timestamp: NOW, message: { mid: 'mid.' + Math.random(), text }, ...extra });
const hook = (...events) => ({ key: 'KHOA_THU', body: { object: 'page', entry: [{ id: 'PAGE1', messaging: events }] } });
const CODE = 'AB12CD34EF';
const seedCode = (env, createdAt = new Date(NOW - 1000), uid = 'lan') => env.store.set('notifyCodes/' + CODE, { uid, createdAt });

describe('hàm thuần', () => {
  const env = makeEnv();
  test('trichMaNoi_: lấy mã từ referral.ref, postback.referral.ref và chữ trong tin', () => {
    assert.equal(env.ctx.trichMaNoi_({ referral: { ref: 'NOI-' + CODE } }), CODE);
    assert.equal(env.ctx.trichMaNoi_({ postback: { payload: 'GET_STARTED', referral: { ref: 'NOI-' + CODE } } }), CODE);
    assert.equal(env.ctx.trichMaNoi_({ message: { text: 'Nối thông báo NOI-' + CODE } }), CODE);
    assert.equal(env.ctx.trichMaNoi_({ message: { text: 'noi-' + CODE.toLowerCase() } }), CODE);
    assert.equal(env.ctx.trichMaNoi_({ referral: { ref: 'KHAC' }, message: { text: 'NOI-' + CODE } }), CODE);
  });
  test('trichMaNoi_: không có / sai dạng → null (thiếu, dư ký tự, ký tự lạ, sự kiện lạ)', () => {
    for (const ev of [null, undefined, {}, 'x', { message: {} }, { message: { text: 'xin chào' } }, { message: { text: 'NOI-AB12CD34E' } }, { message: { text: 'NOI-AB12CD34EFG' } }, { message: { text: 'NOI-AB12CD34E!' } }, { message: { text: 'XNOI-' + CODE } }, { referral: { ref: 123 } }]) {
      assert.equal(env.ctx.trichMaNoi_(ev), null, JSON.stringify(ev));
    }
  });
  test('dinhDangTien_ giống email: dấu chấm hàng nghìn + " đ"; làm tròn; rỗng → 0 đ', () => {
    assert.equal(env.ctx.dinhDangTien_(1234567.4), '1.234.567 đ');
    assert.equal(env.ctx.dinhDangTien_(999), '999 đ');
    assert.equal(env.ctx.dinhDangTien_(0), '0 đ');
    assert.equal(env.ctx.dinhDangTien_(undefined), '0 đ');
    assert.equal(env.ctx.dinhDangTien_(1000), '1.000 đ');
  });
  test('soNgayCon_: làm tròn xuống, tối thiểu 0, không tính được → null', () => {
    assert.equal(env.ctx.soNgayCon_({ daysLeft: 2.9 }), 2);
    assert.equal(env.ctx.soNgayCon_({ daysLeft: 0 }), 0);
    assert.equal(env.ctx.soNgayCon_({ daysLeft: -3 }), 0);
    assert.equal(env.ctx.soNgayCon_({ daysLeft: null }), null);
    assert.equal(env.ctx.soNgayCon_({}), null);
    assert.equal(env.ctx.soNgayCon_({ daysLeft: 'abc' }), null);
  });
  test('hopLeSoZalo_: đúng 0xxxxxxxxx đầu số di động', () => {
    for (const ok of ['0912345678', '0351234567', '0881234567']) assert.equal(env.ctx.hopLeSoZalo_(ok), true, ok);
    for (const bad of ['', '0912 345 678', '+84912345678', '84912345678', '091234567', '0212345678', null, 912345678]) assert.equal(env.ctx.hopLeSoZalo_(bad), false, String(bad));
  });
  test('maConHan_: ≤ 7 ngày còn hạn, quá 7 ngày / thiếu / hỏng thì hết hạn', () => {
    const now = new Date(NOW);
    assert.equal(env.ctx.maConHan_(new Date(NOW - 6.9 * DAY), now), true);
    assert.equal(env.ctx.maConHan_(new Date(NOW - 7 * DAY), now), true);
    assert.equal(env.ctx.maConHan_(new Date(NOW - 7 * DAY - 1000), now), false);
    assert.equal(env.ctx.maConHan_(undefined, now), false);
    assert.equal(env.ctx.maConHan_('2026-11-25', now), false);
    assert.equal(env.ctx.maConHan_(new Date(NOW + 10 * 60000), now), false, 'mã "từ tương lai" không hợp lệ');
  });
  test('thamSoMessenger_: tên, số dư, số ngày; chưa tính được ngày → "vài"', () => {
    assert.deepEqual([...env.ctx.thamSoMessenger_({ label: 'K-Aura', accountName: 'x' }, { balance: 2500000, daysLeft: 1.6 })], ['K-Aura', '2.500.000 đ', '1']);
    assert.deepEqual([...env.ctx.thamSoMessenger_({ accountName: '5263 TK1' }, { balance: 100, daysLeft: null })], ['5263 TK1', '100 đ', 'vài']);
  });
  test('noiDungZalo_: đúng mẫu của thiết kế; thiếu số ngày thì bỏ vế "đủ chạy"', () => {
    assert.equal(
      env.ctx.noiDungZalo_({ label: 'K-Aura' }, { balance: 2500000, daysLeft: 2 }),
      'ADS-Nolimit thông báo: TKQC K-Aura còn khoảng 2.500.000 đ, đủ chạy khoảng 2 ngày. Bạn xem báo cáo và nạp thêm tại www.ads-nolimit.agency/tai-khoan/#bao-cao-ads',
    );
    assert.equal(
      env.ctx.noiDungZalo_({ label: 'K-Aura' }, { balance: 2500000, daysLeft: null }),
      'ADS-Nolimit thông báo: TKQC K-Aura còn khoảng 2.500.000 đ. Bạn xem báo cáo và nạp thêm tại www.ads-nolimit.agency/tai-khoan/#bao-cao-ads',
    );
  });
  test('thanMessengerThap_: messaging_type UTILITY, mẫu + ngôn ngữ + 3 tham số văn bản, PSID ở recipient.id', () => {
    const b = JSON.parse(JSON.stringify(env.ctx.thanMessengerThap_('PSID1', 'mau_x', 'vi', { label: 'K-Aura' }, { balance: 1000, daysLeft: 0 })));
    assert.deepEqual(b, {
      recipient: { id: 'PSID1' },
      messaging_type: 'UTILITY',
      message: { template: { name: 'mau_x', language: { code: 'vi' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'K-Aura' }, { type: 'text', text: '1.000 đ' }, { type: 'text', text: '0' }] }] } },
    });
  });
  test('ngayVn_ tính theo giờ Việt Nam (qua nửa đêm UTC vẫn đúng ngày)', () => {
    assert.equal(env.ctx.ngayVn_(new Date('2026-11-25T17:30:00Z')), '2026-11-26');
    assert.equal(env.ctx.ngayVn_(new Date('2026-11-26T16:59:00Z')), '2026-11-26');
  });
  test('moTaTrangThaiMau_ chỉ nhận message_template_status_update', () => {
    assert.match(env.ctx.moTaTrangThaiMau_({ field: 'message_template_status_update', value: { message_template_name: 'm', event: 'APPROVED' } }), /APPROVED/);
    assert.equal(env.ctx.moTaTrangThaiMau_({ field: 'messages', value: {} }), null);
  });
});

describe('xuLyMeta_ (webhook từ Worker)', () => {
  test('sai khóa hoặc thiếu khóa → bỏ qua hoàn toàn: không đọc/ghi Firestore, không gọi Graph', () => {
    for (const key of ['SAI', undefined, '']) {
      const env = makeEnv();
      seedCode(env);
      const r = call(env, 'xuLyMeta_', { ...hook(evText('NOI-' + CODE)), key });
      assert.equal(r.ok, false);
      assert.equal(env.writes.length, 0);
      assert.equal(env.fetches.length, 0);
      assert.ok(env.store.has('notifyCodes/' + CODE), 'mã chưa bị đụng');
    }
  });
  test('chưa đặt GAS_KEY trong Thuộc tính → luôn từ chối (không cho "khóa rỗng" khớp)', () => {
    const env = makeEnv({ props: { GAS_KEY: '' } });
    seedCode(env);
    assert.equal(call(env, 'xuLyMeta_', { ...hook(evText('NOI-' + CODE)), key: '' }).ok, false);
    assert.equal(env.writes.length, 0);
  });
  test('mã đúng, còn hạn → ghi notifyPrivate (PSID) + notifyLinks, xóa mã, chào lại bằng RESPONSE', () => {
    const env = makeEnv();
    seedCode(env);
    const r = call(env, 'xuLyMeta_', hook(evText('Nối thông báo NOI-' + CODE)));
    assert.equal(r.noi, 1);
    const priv = env.store.get('notifyPrivate/lan');
    assert.equal(priv.psid, 'PSID9');
    const link = env.store.get('notifyLinks/lan');
    assert.equal(link.messenger.linked, true);
    assert.ok(link.messenger.linkedAt instanceof Date);
    assert.equal(JSON.stringify(link).includes('PSID9'), false, 'PSID không nằm trong notifyLinks (trình duyệt đọc được)');
    assert.equal(env.store.has('notifyCodes/' + CODE), false);
    const greet = env.fetches.find((f) => f.url.endsWith('/PAGE1/messages'));
    assert.ok(greet);
    assert.deepEqual(JSON.parse(greet.opts.payload), { recipient: { id: 'PSID9' }, messaging_type: 'RESPONSE', message: { text: 'Đã nối thông báo tài khoản ADS-Nolimit ✓' } });
    assert.equal(greet.opts.headers.Authorization, 'Bearer TOKEN_THU');
    assert.equal(greet.url.includes('TOKEN_THU'), false, 'token không nằm trong URL');
  });
  test('mã nằm trong referral.ref hoặc postback.referral.ref cũng nối được', () => {
    for (const ev of [{ sender: { id: 'P1' }, referral: { ref: 'NOI-' + CODE } }, { sender: { id: 'P1' }, postback: { payload: 'GET_STARTED', referral: { ref: 'NOI-' + CODE } } }]) {
      const env = makeEnv();
      seedCode(env);
      assert.equal(call(env, 'xuLyMeta_', hook(ev)).noi, 1);
      assert.equal(env.store.get('notifyPrivate/lan').psid, 'P1');
    }
  });
  test('mã hết hạn (> 7 ngày) → không nối, xóa mã, báo khách tạo mã mới', () => {
    const env = makeEnv();
    seedCode(env, new Date(NOW - 8 * DAY));
    const r = call(env, 'xuLyMeta_', hook(evText('NOI-' + CODE)));
    assert.equal(r.noi, 0);
    assert.equal(env.store.has('notifyPrivate/lan'), false);
    assert.equal(env.store.has('notifyLinks/lan'), false);
    assert.equal(env.store.has('notifyCodes/' + CODE), false);
    assert.match(env.graphBodies()[0].message.text, /hết hạn/);
  });
  test('mã không tồn tại (đoán bừa) → không ghi gì, chỉ trả lời nhắc tạo mã mới', () => {
    const env = makeEnv();
    const r = call(env, 'xuLyMeta_', hook(evText('NOI-ZZZZZZZZZZ')));
    assert.equal(r.noi, 0);
    assert.equal(env.writes.length, 0);
    assert.match(env.graphBodies()[0].message.text, /không đúng|đã dùng/);
  });
  test('mã dùng rồi (đã bị xóa): gửi lại cùng mã không nối thêm', () => {
    const env = makeEnv();
    seedCode(env);
    call(env, 'xuLyMeta_', hook(evText('NOI-' + CODE)));
    env.store.delete('notifyPrivate/lan');
    call(env, 'xuLyMeta_', hook(evText('NOI-' + CODE)));
    assert.equal(env.store.has('notifyPrivate/lan'), false);
  });
  test('Meta gửi lại cùng sự kiện (cùng mid) → chỉ xử lý một lần', () => {
    const env = makeEnv();
    seedCode(env);
    const ev = evText('NOI-' + CODE, { message: { mid: 'mid.same', text: 'NOI-' + CODE } });
    call(env, 'xuLyMeta_', hook(ev));
    const n = env.writes.length;
    call(env, 'xuLyMeta_', hook(ev));
    assert.equal(env.writes.length, n);
  });
  test('tin do chính page gửi (is_echo), tin không có mã, thiếu sender → bỏ qua', () => {
    const env = makeEnv();
    seedCode(env);
    call(env, 'xuLyMeta_', hook(evText('NOI-' + CODE, { message: { mid: 'm1', is_echo: true, text: 'NOI-' + CODE } }), evText('xin chào'), { message: { text: 'NOI-' + CODE } }));
    assert.equal(env.writes.length, 0);
    assert.equal(env.fetches.length, 0);
  });
  test('một sự kiện lỗi không làm hỏng các sự kiện khác trong cùng gói', () => {
    const env = makeEnv();
    seedCode(env);
    const hong = { get sender() { throw new Error('hong'); } };
    const r = call(env, 'xuLyMeta_', hook(hong, evText('NOI-' + CODE)));
    assert.equal(r.noi, 1);
  });
  test('thay đổi trạng thái mẫu tin được nhận (không lỗi)', () => {
    const env = makeEnv();
    const r = call(env, 'xuLyMeta_', { key: 'KHOA_THU', body: { entry: [{ changes: [{ field: 'message_template_status_update', value: { message_template_name: 'm', event: 'APPROVED' } }] }] } });
    assert.equal(r.ok, true);
    assert.equal(r.mau.length, 1);
  });
  test('gói rỗng / thân lạ không gây lỗi', () => {
    const env = makeEnv();
    for (const body of [undefined, {}, { entry: null }, { entry: [null, {}] }, { entry: [{ messaging: 'x' }] }]) assert.equal(call(env, 'xuLyMeta_', { key: 'KHOA_THU', body }).ok, true);
  });
  test('Graph lỗi khi chào lại → vẫn nối xong (chỉ ghi nhật ký)', () => {
    const env = makeEnv({ graph: () => ({ status: 400, body: { error: { code: 190, message: 'token hong' } } }) });
    seedCode(env);
    assert.equal(call(env, 'xuLyMeta_', hook(evText('NOI-' + CODE))).noi, 1);
    assert.equal(env.store.get('notifyPrivate/lan').psid, 'PSID9');
  });
  test('doPostMeta_: thân hỏng → {ok:false}; thân đúng → {ok:true}; không ném lỗi', () => {
    const env = makeEnv();
    seedCode(env);
    assert.deepEqual(JSON.parse(env.ctx.doPostMeta_({ postData: { contents: '{hong' } }).s), { ok: false });
    assert.deepEqual(JSON.parse(env.ctx.doPostMeta_({ postData: { contents: JSON.stringify(hook(evText('NOI-' + CODE))) } }).s), { ok: true });
    assert.deepEqual(JSON.parse(env.ctx.doPostMeta_({ postData: { contents: JSON.stringify({ ...hook(), key: 'SAI' }) } }).s), { ok: false });
  });
});

const tk = { uid: 'lan', memberUids: ['lan', 'nam'], label: 'K-Aura', accountName: '5263 TK1', customerEmail: 'lan@example.com' };
const latest = { balance: 2500000, daysLeft: 1.7, avg7: 1500000, spendYesterday: 1400000, low: true };
const user = (notify, extra = {}) => ({ displayName: 'Tên', email: 'x@e.com', ...(notify ? { notify } : {}), ...extra });
const linkedFor = (env, uid, psid = 'PSID_' + uid) => {
  env.store.set('notifyLinks/' + uid, { messenger: { linked: true, linkedAt: new Date(NOW - DAY) } });
  env.store.set('notifyPrivate/' + uid, { psid, linkedAt: new Date(NOW - DAY) });
};

describe('guiMessengerThap_', () => {
  test('gửi mẫu tin tiện ích cho từng thành viên đã nối: URL, header, thân đúng', () => {
    const env = makeEnv({ props: { THONG_BAO_TEMPLATE: 'mau_that', THONG_BAO_LANG: 'vi' } });
    for (const uid of ['lan', 'nam']) { env.store.set('users/' + uid, user({ email: true, messenger: true, zalo: false, zaloPhone: '' })); linkedFor(env, uid); }
    const kq = call(env, 'guiMessengerThap_', tk, latest, ['lan', 'nam']);
    assert.equal(kq.gui, 2);
    assert.equal(env.fetches.length, 2);
    assert.ok(env.fetches[0].url.endsWith('/PAGE1/messages'));
    assert.equal(env.fetches[0].url.startsWith('https://graph.facebook.com/'), true);
    assert.equal(env.fetches[0].opts.headers.Authorization, 'Bearer TOKEN_THU');
    const b = env.graphBodies();
    assert.equal(b[0].recipient.id, 'PSID_lan');
    assert.equal(b[1].recipient.id, 'PSID_nam');
    assert.equal(b[0].messaging_type, 'UTILITY');
    assert.equal(b[0].message.template.name, 'mau_that');
    assert.deepEqual(b[0].message.template.components[0].parameters.map((p) => p.text), ['K-Aura', '2.500.000 đ', '1']);
  });
  test('mặc định: không đặt tên mẫu/ngôn ngữ → thong_bao_ngan_sach_thap / vi', () => {
    const env = makeEnv();
    env.store.set('users/lan', user(null)); // chưa có notify → mặc định nhận (messenger !== false)
    linkedFor(env, 'lan');
    call(env, 'guiMessengerThap_', tk, latest, ['lan']);
    const t = env.graphBodies()[0].message.template;
    assert.equal(t.name, 'thong_bao_ngan_sach_thap');
    assert.equal(t.language.code, 'vi');
  });
  test('khách tắt nhận Messenger (notify.messenger = false) → không gửi', () => {
    const env = makeEnv();
    env.store.set('users/lan', user({ email: true, messenger: false, zalo: false, zaloPhone: '' }));
    linkedFor(env, 'lan');
    assert.equal(call(env, 'guiMessengerThap_', tk, latest, ['lan']).gui, 0);
    assert.equal(env.fetches.length, 0);
  });
  test('chưa nối hoặc đã bấm "Bỏ nối" → không gửi; PSID còn sót bị xóa', () => {
    const env = makeEnv();
    env.store.set('users/lan', user(null));
    env.store.set('users/nam', user(null));
    linkedFor(env, 'nam');
    env.store.set('notifyLinks/nam', { messenger: { linked: false } }); // khách bỏ nối trên web
    const kq = call(env, 'guiMessengerThap_', tk, latest, ['lan', 'nam']);
    assert.equal(kq.gui, 0);
    assert.equal(env.fetches.length, 0);
    assert.equal(env.store.has('notifyPrivate/nam'), false, 'PSID bị xóa sau khi bỏ nối');
  });
  test('Graph lỗi một người → ghi lỗi, người khác vẫn được gửi, không ném lỗi', () => {
    let n = 0;
    const env = makeEnv({ graph: () => (++n === 1 ? { status: 400, body: { error: { code: 551, message: 'nguoi dung khong nhan duoc' } } } : { status: 200, body: {} }) });
    for (const uid of ['lan', 'nam']) { env.store.set('users/' + uid, user(null)); linkedFor(env, uid); }
    const kq = call(env, 'guiMessengerThap_', tk, latest, ['lan', 'nam']);
    assert.equal(kq.gui, 1);
    assert.equal(kq.loi.length, 1);
    assert.match(kq.loi[0], /551/);
    assert.equal(kq.loi[0].includes('TOKEN_THU'), false);
  });
  test('mạng hỏng (ném lỗi) / thiếu PAGE_TOKEN → ghi lỗi, không ném', () => {
    const e1 = makeEnv({ graph: () => ({ throw: 'mang hong' }) });
    e1.store.set('users/lan', user(null)); linkedFor(e1, 'lan');
    assert.equal(call(e1, 'guiMessengerThap_', tk, latest, ['lan']).loi.length, 1);
    const e2 = makeEnv({ props: { PAGE_TOKEN: '' } });
    e2.store.set('users/lan', user(null)); linkedFor(e2, 'lan');
    assert.equal(call(e2, 'guiMessengerThap_', tk, latest, ['lan']).loi.length, 1);
    assert.equal(e2.fetches.length, 0);
  });
});

describe('ghiZaloQueue_', () => {
  const zalo = (phone = '0912345678') => ({ email: true, messenger: false, zalo: true, zaloPhone: phone });
  test('khách bật Zalo + số hợp lệ → zaloQueue/{actId}_{uid}_{ngày} đủ trường, status cho', () => {
    const env = makeEnv();
    env.store.set('users/lan', user(zalo(), { displayName: 'Lan Nguyễn' }));
    const kq = call(env, 'ghiZaloQueue_', tk, latest, ['lan', 'nam'], 'act_11111');
    assert.equal(kq.moi, 1);
    const d = env.store.get('zaloQueue/act_11111_lan_2026-11-26');
    assert.equal(d.uid, 'lan');
    assert.equal(d.actId, 'act_11111');
    assert.equal(d.name, 'Lan Nguyễn');
    assert.equal(d.accountName, 'K-Aura');
    assert.equal(d.phone, '0912345678');
    assert.equal(d.status, 'cho');
    assert.ok(d.createdAt instanceof Date);
    assert.match(d.text, /^ADS-Nolimit thông báo: TKQC K-Aura còn khoảng 2\.500\.000 đ, đủ chạy khoảng 1 ngày\./);
    assert.match(d.text, /www\.ads-nolimit\.agency\/tai-khoan\/#bao-cao-ads$/);
  });
  test('không bật Zalo, số sai/rỗng/có khoảng trắng, chưa có hồ sơ → bỏ qua', () => {
    const env = makeEnv();
    env.store.set('users/lan', user({ ...zalo(), zalo: false }));
    env.store.set('users/nam', user(zalo('0912 345 678')));
    env.store.set('users/ba', user(zalo('')));
    const kq = call(env, 'ghiZaloQueue_', tk, latest, ['lan', 'nam', 'ba', 'khongco'], 'act_11111');
    assert.equal(kq.moi, 0);
    assert.equal(env.sets('zaloQueue/').length, 0);
  });
  test('chạy lại trong ngày: tin còn "cho" được cập nhật (không nhân đôi, giữ createdAt, không tính là mới)', () => {
    const env = makeEnv();
    env.store.set('users/lan', user(zalo()));
    call(env, 'ghiZaloQueue_', tk, latest, ['lan'], 'act_11111');
    const c1 = env.store.get('zaloQueue/act_11111_lan_2026-11-26').createdAt;
    const kq = call(env, 'ghiZaloQueue_', tk, { ...latest, balance: 2000000 }, ['lan'], 'act_11111');
    assert.equal(kq.moi, 0);
    assert.equal([...env.store.keys()].filter((k) => k.startsWith('zaloQueue/')).length, 1);
    assert.match(env.store.get('zaloQueue/act_11111_lan_2026-11-26').text, /2\.000\.000 đ/);
    assert.equal(+env.store.get('zaloQueue/act_11111_lan_2026-11-26').createdAt, +c1);
  });
  test('tin đã gửi/bỏ qua trong ngày thì không bị đưa lại vào hàng đợi', () => {
    const env = makeEnv();
    env.store.set('users/lan', user(zalo()));
    env.store.set('zaloQueue/act_11111_lan_2026-11-26', { uid: 'lan', status: 'da-gui', doneAt: new Date(NOW) });
    const kq = call(env, 'ghiZaloQueue_', tk, latest, ['lan'], 'act_11111');
    assert.equal(kq.moi, 0);
    assert.equal(env.store.get('zaloQueue/act_11111_lan_2026-11-26').status, 'da-gui');
  });
});

describe('thongBaoThap_ (1 lần/ngày/TKQC) + email tổng hợp', () => {
  const setup = (notifyFor = {}) => {
    const env = makeEnv();
    env.store.set('users/lan', user({ email: true, messenger: true, zalo: true, zaloPhone: '0912345678' }));
    env.store.set('users/nam', user({ email: true, messenger: true, zalo: false, zaloPhone: '', ...notifyFor }));
    linkedFor(env, 'lan');
    linkedFor(env, 'nam');
    return env;
  };
  const run = (env, data = tk, id = 'act_11111', homNay = '2026-11-26') => {
    const patch = {};
    const loiKhac = [];
    const moi = env.ctx.thongBaoThap_({ id, data }, latest, homNay, patch, loiKhac);
    return { moi, patch: { ...patch }, loiKhac: [...loiKhac] };
  };
  test('lần đầu trong ngày: Messenger cho cả 2 thành viên + 1 tin Zalo; đánh dấu lastNotifyDay', () => {
    const env = setup();
    const r = run(env);
    assert.equal(r.moi, 1);
    assert.equal(r.patch.lastNotifyDay, '2026-11-26');
    assert.equal(env.fetches.length, 2);
    assert.equal([...env.store.keys()].filter((k) => k.startsWith('zaloQueue/')).length, 1);
  });
  test('đã báo hôm nay (lastNotifyDay = hôm nay) → không gửi gì thêm (như email)', () => {
    const env = setup();
    const r = run(env, { ...tk, lastNotifyDay: '2026-11-26' });
    assert.equal(r.moi, 0);
    assert.equal(env.fetches.length, 0);
    assert.equal(env.writes.length, 0);
    assert.equal(r.patch.lastNotifyDay, undefined);
  });
  test('sang ngày mới (lastNotifyDay cũ) → báo lại', () => {
    const env = setup();
    const r = run(env, { ...tk, lastNotifyDay: '2026-11-25' });
    assert.equal(r.patch.lastNotifyDay, '2026-11-26');
    assert.equal(env.fetches.length, 2);
  });
  test('đồng bộ chạy 3 lần trong ngày: Messenger chỉ gửi 1 lượt', () => {
    const env = setup();
    let data = tk;
    for (let i = 0; i < 3; i++) {
      const r = run(env, data);
      if (r.patch.lastNotifyDay) data = { ...data, lastNotifyDay: r.patch.lastNotifyDay };
    }
    assert.equal(env.fetches.length, 2);
  });
  test('Messenger lỗi hết (chưa gửi được ai) → không đánh dấu để giờ sau thử lại, lỗi vào loiKhac', () => {
    const env = makeEnv({ graph: () => ({ status: 500, body: { error: { message: 'loi' } } }) });
    env.store.set('users/lan', user(null)); linkedFor(env, 'lan');
    const r = run(env, { ...tk, memberUids: ['lan'] });
    assert.equal(r.patch.lastNotifyDay, undefined);
    assert.equal(r.loiKhac.length, 1);
  });
  test('không ai nối Messenger/bật Zalo → vẫn đánh dấu đã xử lý hôm nay, không gửi gì', () => {
    const env = makeEnv();
    env.store.set('users/lan', user(null));
    const r = run(env, { ...tk, memberUids: ['lan'] });
    assert.equal(r.moi, 0);
    assert.equal(r.patch.lastNotifyDay, '2026-11-26');
    assert.equal(env.fetches.length, 0);
  });
  test('emailTongHopZalo_: N > 0 → 1 email tới chủ script, nêu số khách và link /quan-tri/#nhac-zalo; N = 0 → không gửi', () => {
    const env = makeEnv();
    assert.equal(env.ctx.emailTongHopZalo_(0), false);
    assert.equal(env.mails.length, 0);
    assert.equal(env.ctx.emailTongHopZalo_(3), true);
    assert.equal(env.mails.length, 1);
    assert.equal(env.mails[0].to, 'chu@example.com');
    assert.match(env.mails[0].subject, /3 khách cần nhắc nạp qua Zalo/);
    assert.match(env.mails[0].body, /https:\/\/www\.ads-nolimit\.agency\/quan-tri\/#nhac-zalo/);
  });
});

describe('taoMauTinTienIch_ + an toàn khóa', () => {
  test('gửi đúng mẫu UTILITY: tên, ngôn ngữ, thân có {{1}}{{2}}{{3}}, nút URL "Xem báo cáo"', () => {
    const env = makeEnv();
    assert.equal(env.ctx.taoMauTinTienIch_(), true);
    assert.ok(env.fetches[0].url.endsWith('/PAGE1/message_templates'));
    const b = JSON.parse(env.fetches[0].opts.payload);
    assert.equal(b.category, 'UTILITY');
    assert.equal(b.name, 'thong_bao_ngan_sach_thap');
    assert.equal(b.language, 'vi');
    assert.equal(b.components[0].text, 'Thông báo tài khoản quảng cáo {{1}}: số dư còn khoảng {{2}}, đủ chạy khoảng {{3}} ngày. Bạn xem báo cáo và nạp thêm ngân sách để quảng cáo không bị gián đoạn.');
    assert.equal(b.components[0].example.body_text[0].length, 3);
    assert.equal(b.components[1].buttons[0].text, 'Xem báo cáo');
    assert.equal(b.components[1].buttons[0].url, 'https://www.ads-nolimit.agency/tai-khoan/#bao-cao-ads');
  });
  test('tệp .gs không chứa khóa/mã bí mật gắn cứng và không định nghĩa lại tên của bot 3', () => {
    assert.equal(/EAA[A-Za-z0-9]{20,}|sk-ant|const\s+KHOA\b/.test(SRC), false);
    for (const dup of ['function vnd(', 'function doPost(', 'function fsCall(', 'function fsGet(', 'function guiEmail(', 'const WEB ', 'const FS ', 'const DU_AN', 'const TZ ']) assert.equal(SRC.includes(dup), false, dup);
  });
});
