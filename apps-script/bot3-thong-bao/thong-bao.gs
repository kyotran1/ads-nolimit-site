/**
 * ADS-Nolimit — PHẦN THÊM cho Apps Script bot 3: thông báo ngân sách thấp qua Messenger + Zalo (giai đoạn 1, 26/11/2026).
 *
 * Tệp này DÁN THÊM vào dự án Apps Script của bot 3 (tệp mới "thong-bao.gs"), KHÔNG thay mã cũ.
 * Dùng lại các hàm có sẵn của bot 3: fsCall, fsList, fsGet, fsSet, fsPatch, traLoi, emailNhan, thanhVien (và tuFs/sangFs qua chúng).
 * Quy tắc đặt tên: mọi hàm/hằng mới có hậu tố "_" hoặc tiền tố "TB_" để không đụng tên cũ (vd bot 3 đã có hàm vnd()).
 * Chỗ gọi (3 dòng chèn vào mã cũ): xem README.md cùng thư mục.
 *
 * Thuộc tính tập lệnh (Project Settings → Script properties; Chủ tịch tự dán, KHÔNG ghi vào mã):
 *   PAGE_ID             ID page ADS-Nolimit
 *   PAGE_TOKEN          Page access token (không hết hạn) — SECRET
 *   GAS_KEY             khóa chung với Worker (trùng biến GAS_KEY của Worker) — SECRET
 *   THONG_BAO_TEMPLATE  tên mẫu tin tiện ích (mặc định thong_bao_ngan_sach_thap)
 *   THONG_BAO_LANG      mã ngôn ngữ mẫu tin (mặc định vi)
 *   GRAPH_VERSION       (không bắt buộc) phiên bản Graph API, mặc định v23.0
 *
 * Dữ liệu Firestore (xem docs/superpowers/specs/2026-11-26-thong-bao-zalo-facebook-design.md):
 *   notifyCodes/{mã}    khách tạo trên web; ở đây đọc rồi xóa
 *   notifyPrivate/{uid} {psid, linkedAt} — CHỈ server
 *   notifyLinks/{uid}   {messenger:{linked, linkedAt, name?}} — web đọc để hiện "Đã nối"
 *   zaloQueue/{id}      hàng đợi Zalo cho Chủ tịch bấm gửi
 *   users/{uid}.notify  {email, messenger, zalo, zaloPhone} — khách tự đặt
 *   adAccounts/{id}.lastNotifyDay  ngày đã báo Messenger/Zalo (1 lần/ngày/TKQC như email)
 */

const TB_LINK_BAO_CAO = 'https://www.ads-nolimit.agency/tai-khoan/#bao-cao-ads';
const TB_LINK_ZALO_QUAN_TRI = 'https://www.ads-nolimit.agency/quan-tri/#nhac-zalo';
const TB_HAN_MA_MS = 7 * 24 * 60 * 60 * 1000; // mã nối hết hạn sau 7 ngày
const TB_MAU_MAC_DINH = 'thong_bao_ngan_sach_thap';
const TB_THAN_MAU =
  'Thông báo tài khoản quảng cáo {{1}}: số dư còn khoảng {{2}}, đủ chạy khoảng {{3}} ngày. ' +
  'Bạn xem báo cáo và nạp thêm ngân sách để quảng cáo không bị gián đoạn.';

/* ======================= Hàm thuần (không gọi dịch vụ Google; test bằng Node) ======================= */

/** "1234567.4" → "1.234.567 đ" (giống email cảnh báo). */
function dinhDangTien_(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' đ';
}

/** Số ngày còn, làm tròn xuống, tối thiểu 0; null khi chưa có chi tiêu trung bình (không tính được). */
function soNgayCon_(l) {
  if (!l || l.daysLeft === null || l.daysLeft === undefined || isNaN(Number(l.daysLeft))) return null;
  return Math.max(0, Math.floor(Number(l.daysLeft)));
}

/** Số Zalo hợp lệ: đúng 0xxxxxxxxx (đầu 03/05/07/08/09). Chuỗi đã chuẩn hóa ở web; kiểm lại ở đây. */
function hopLeSoZalo_(s) {
  return typeof s === 'string' && /^0[35789][0-9]{8}$/.test(s);
}

/**
 * Lấy mã nối từ một sự kiện Messenger. Thứ tự: referral.ref, postback.referral.ref, tin nhắn chữ.
 * Mã dạng NOI-<10 ký tự A-Z0-9>; trả về 10 ký tự (viết hoa) hoặc null.
 */
function trichMaNoi_(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const nguon = [
    ev.referral && ev.referral.ref,
    ev.postback && ev.postback.referral && ev.postback.referral.ref,
    ev.message && ev.message.text,
  ];
  for (let i = 0; i < nguon.length; i++) {
    if (typeof nguon[i] !== 'string') continue;
    const m = /(?:^|[^A-Za-z0-9])NOI-([A-Za-z0-9]{10})(?![A-Za-z0-9])/i.exec(nguon[i]);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

/** Là đối tượng Date (không dùng instanceof: Date từ dịch vụ khác có thể khác "thế giới" đối tượng). */
function laNgay_(x) {
  return Object.prototype.toString.call(x) === '[object Date]';
}

/** Mã còn hạn (≤ 7 ngày kể từ lúc tạo)? createdAt là Date; thiếu/hỏng → hết hạn. */
function maConHan_(createdAt, now) {
  const t = laNgay_(createdAt) ? createdAt.getTime() : NaN;
  if (isNaN(t)) return false;
  const tuoi = (laNgay_(now) ? now.getTime() : Date.now()) - t;
  return tuoi >= -60000 && tuoi <= TB_HAN_MA_MS; // cho lệch đồng hồ 1 phút
}

/** Ba tham số của mẫu tin tiện ích: tên TKQC, số dư, số ngày. Số ngày chưa tính được → "vài". */
function thamSoMessenger_(tk, l) {
  const ngay = soNgayCon_(l);
  return [String(tk.label || tk.accountName || 'ADS-Nolimit'), dinhDangTien_(l.balance), ngay === null ? 'vài' : String(ngay)];
}

/** Nội dung tin Zalo soạn sẵn cho Chủ tịch. Không tính được số ngày thì bỏ vế "đủ chạy". */
function noiDungZalo_(tk, l) {
  const ten = String(tk.label || tk.accountName || '');
  const ngay = soNgayCon_(l);
  return (
    'ADS-Nolimit thông báo: TKQC ' + ten + ' còn khoảng ' + dinhDangTien_(l.balance) +
    (ngay === null ? '' : ', đủ chạy khoảng ' + ngay + ' ngày') +
    '. Bạn xem báo cáo và nạp thêm tại www.ads-nolimit.agency/tai-khoan/#bao-cao-ads'
  );
}

/** Thân yêu cầu gửi mẫu tin tiện ích (Send API, messaging_type UTILITY). */
function thanMessengerThap_(psid, tenMau, lang, tk, l) {
  return {
    recipient: { id: psid },
    messaging_type: 'UTILITY',
    message: {
      template: {
        name: tenMau,
        language: { code: lang },
        components: [{ type: 'body', parameters: thamSoMessenger_(tk, l).map(function (t) { return { type: 'text', text: t }; }) }],
      },
    },
  };
}

/** Nhãn ngày yyyy-MM-dd theo giờ Việt Nam từ Date (dùng cho id zaloQueue). */
function ngayVn_(d) {
  const v = new Date(d.getTime() + 7 * 3600 * 1000); // UTC+7, không có giờ mùa hè
  return v.toISOString().slice(0, 10);
}

/** Một mục webhook thay đổi mẫu tin (message_template_status_update) → chữ ngắn để ghi nhật ký. */
function moTaTrangThaiMau_(change) {
  if (!change || change.field !== 'message_template_status_update') return null;
  const v = change.value || {};
  return 'Mau tin ' + String(v.message_template_name || v.name || '?') + ': ' + String(v.event || v.status || '?') + (v.reason ? ' (' + String(v.reason) + ')' : '');
}

/* ======================= Graph API ======================= */

function tbProp_(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  return v === null || v === undefined ? '' : String(v);
}

/** Gọi Graph API với Page token ở header (không để token trong URL). Không ném lỗi: trả {ok, code, body}. */
function goiGraph_(duongDan, payload) {
  const token = tbProp_('PAGE_TOKEN');
  if (!token) return { ok: false, code: 0, body: { error: { message: 'chua dan PAGE_TOKEN' } } };
  const ver = tbProp_('GRAPH_VERSION') || 'v23.0';
  try {
    const res = UrlFetchApp.fetch('https://graph.facebook.com/' + ver + '/' + duongDan, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    let body = {};
    try { body = JSON.parse(res.getContentText() || '{}'); } catch (e) { body = {}; }
    return { ok: code >= 200 && code < 300, code: code, body: body };
  } catch (err) {
    return { ok: false, code: 0, body: { error: { message: String(err) } } };
  }
}

function loiGraph_(r) {
  const e = (r && r.body && r.body.error) || {};
  return 'HTTP ' + (r ? r.code : 0) + (e.code ? ' #' + e.code : '') + ' ' + String(e.message || '').slice(0, 160);
}

/* ======================= 1) Nhận webhook Meta (qua Worker) ======================= */

/**
 * Gọi từ doPost khi e.parameter.meta === '1'. Nhận gói {key, body} do Worker chuyển sang.
 * Sai key → bỏ qua (không làm gì, không báo chi tiết). Luôn trả về đối tượng, không ném lỗi.
 */
function xuLyMeta_(payload) {
  const khoa = tbProp_('GAS_KEY');
  if (!khoa || !payload || payload.key !== khoa) return { ok: false, loi: 'sai khoa' };
  const body = payload.body || {};
  const kq = { ok: true, noi: 0, bo: 0, mau: [] };
  const cache = CacheService.getScriptCache();
  (Array.isArray(body.entry) ? body.entry : []).forEach(function (en) {
    (Array.isArray(en && en.changes) ? en.changes : []).forEach(function (c) {
      const t = moTaTrangThaiMau_(c);
      if (t) { console.log(t); kq.mau.push(t); }
    });
    (Array.isArray(en && en.messaging) ? en.messaging : []).forEach(function (ev) {
      try {
        if (!ev || !ev.sender || !ev.sender.id) return;
        if (ev.message && ev.message.is_echo) return; // tin do chính page gửi
        const ma = trichMaNoi_(ev);
        if (!ma) return;
        // Meta có thể gửi lại cùng một sự kiện: chỉ xử lý một lần
        const dau = 'meta_' + (ev.message && ev.message.mid ? ev.message.mid : String(ev.sender.id) + '_' + String(ev.timestamp || '') + '_' + ma);
        if (cache.get(dau)) return;
        cache.put(dau, '1', 3600);
        if (noiMessenger_(String(ev.sender.id), ma)) kq.noi++; else kq.bo++;
      } catch (err) {
        console.error('xuLyMeta_: ' + err);
      }
    });
  });
  return kq;
}

/** Đổi mã lấy PSID: ghi notifyPrivate + notifyLinks, xóa mã, chào lại. Trả về true khi nối được. */
function noiMessenger_(psid, ma) {
  const doc = fsGet('notifyCodes/' + ma);
  const uid = doc && doc.data && typeof doc.data.uid === 'string' ? doc.data.uid : '';
  if (!doc || !uid) {
    traLoiMessenger_(psid, 'Mã nối không đúng hoặc đã dùng rồi. Bạn mở mục Thông báo trên web ADS-Nolimit và bấm "Nối Messenger" để lấy mã mới nhé.');
    return false;
  }
  if (!maConHan_(doc.data.createdAt, new Date())) {
    try { fsCall('delete', 'notifyCodes/' + ma); } catch (e) { /* bỏ qua */ }
    traLoiMessenger_(psid, 'Mã nối đã hết hạn (quá 7 ngày). Bạn mở mục Thông báo trên web ADS-Nolimit và bấm "Nối Messenger" để lấy mã mới nhé.');
    return false;
  }
  const bay = new Date();
  fsSet('notifyPrivate/' + uid, { psid: psid, linkedAt: bay });
  const messenger = { linked: true, linkedAt: bay };
  const ten = layTenMessenger_(psid);
  if (ten) messenger.name = ten;
  fsSet('notifyLinks/' + uid, { messenger: messenger });
  try { fsCall('delete', 'notifyCodes/' + ma); } catch (e) { console.error('Khong xoa duoc ma noi: ' + e); }
  traLoiMessenger_(psid, 'Đã nối thông báo tài khoản ADS-Nolimit ✓');
  return true;
}

/** Tin trả lời trong 24 giờ sau tin của khách (messaging_type RESPONSE). Lỗi chỉ ghi nhật ký. */
function traLoiMessenger_(psid, text) {
  const r = goiGraph_(tbProp_('PAGE_ID') + '/messages', { recipient: { id: psid }, messaging_type: 'RESPONSE', message: { text: text } });
  if (!r.ok) console.error('Khong tra loi duoc Messenger: ' + loiGraph_(r));
  return r.ok;
}

/** Tên hiển thị của khách trên Messenger (không bắt buộc; thiếu quyền thì bỏ qua). */
function layTenMessenger_(psid) {
  try {
    const token = tbProp_('PAGE_TOKEN');
    if (!token) return '';
    const res = UrlFetchApp.fetch('https://graph.facebook.com/' + (tbProp_('GRAPH_VERSION') || 'v23.0') + '/' + encodeURIComponent(psid) + '?fields=name', {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) return '';
    const t = JSON.parse(res.getContentText() || '{}').name;
    return typeof t === 'string' ? t.slice(0, 80) : '';
  } catch (e) {
    return '';
  }
}

/** Dành cho doPost: parse thân, gọi xuLyMeta_, trả JSON. Luôn trả 200 (Worker không cần biết chi tiết). */
function doPostMeta_(e) {
  let payload = null;
  try { payload = JSON.parse(e.postData.contents); } catch (err) { return traLoi({ ok: false }); }
  let kq;
  try { kq = xuLyMeta_(payload); } catch (err) { console.error('xuLyMeta_: ' + err); kq = { ok: false }; }
  return traLoi({ ok: !!(kq && kq.ok) });
}

/* ======================= 2) Gửi khi TKQC chuyển sang "thấp" ======================= */

/**
 * Gửi mẫu tin tiện ích cho mọi thành viên (chủ + người xem thêm) đã nối Messenger và đang bật nhận.
 * Lỗi từng người chỉ ghi vào kq.loi; KHÔNG ném lỗi (không làm hỏng đồng bộ).
 * @return {{gui:number, boQua:number, loi:string[]}}
 */
function guiMessengerThap_(tk, l, uids) {
  const kq = { gui: 0, boQua: 0, loi: [] };
  const mau = tbProp_('THONG_BAO_TEMPLATE') || TB_MAU_MAC_DINH;
  const lang = tbProp_('THONG_BAO_LANG') || 'vi';
  const pageId = tbProp_('PAGE_ID');
  (uids || []).forEach(function (uid) {
    try {
      const u = fsGet('users/' + uid);
      const nt = u && u.data && u.data.notify;
      if (nt && nt.messenger === false) { kq.boQua++; return; }
      const lk = fsGet('notifyLinks/' + uid);
      const dangNoi = !!(lk && lk.data && lk.data.messenger && lk.data.messenger.linked === true);
      const rieng = fsGet('notifyPrivate/' + uid);
      const psid = rieng && rieng.data && typeof rieng.data.psid === 'string' ? rieng.data.psid : '';
      if (!dangNoi) {
        // Khách đã bấm "Bỏ nối" trên web: xóa PSID đang giữ
        if (psid) { try { fsCall('delete', 'notifyPrivate/' + uid); } catch (e) { /* bỏ qua */ } }
        kq.boQua++;
        return;
      }
      if (!psid || !pageId) { kq.boQua++; return; }
      const r = goiGraph_(pageId + '/messages', thanMessengerThap_(psid, mau, lang, tk, l));
      if (r.ok) kq.gui++;
      else kq.loi.push('Messenger ' + uid.slice(0, 6) + ': ' + loiGraph_(r));
    } catch (err) {
      kq.loi.push('Messenger ' + String(uid).slice(0, 6) + ': ' + err);
    }
  });
  return kq;
}

/**
 * Ghi hàng đợi Zalo cho Chủ tịch: mỗi uid có notify.zalo === true và số hợp lệ → zaloQueue/{actId}_{uid}_{ngày}.
 * Tin đã có trong ngày: còn "cho" thì cập nhật nội dung; đã gửi/bỏ qua thì giữ nguyên (không đưa lại vào hàng đợi).
 * @return {{moi:number, boQua:number, loi:string[]}}
 */
function ghiZaloQueue_(tk, l, uids, actId) {
  const kq = { moi: 0, boQua: 0, loi: [] };
  const ngay = ngayVn_(new Date());
  const text = noiDungZalo_(tk, l);
  (uids || []).forEach(function (uid) {
    try {
      const u = fsGet('users/' + uid);
      const nt = u && u.data && u.data.notify;
      if (!nt || nt.zalo !== true || !hopLeSoZalo_(nt.zaloPhone)) { kq.boQua++; return; }
      const id = actId + '_' + uid + '_' + ngay;
      const cu = fsGet('zaloQueue/' + id);
      if (cu && cu.data && cu.data.status && cu.data.status !== 'cho') { kq.boQua++; return; }
      fsSet('zaloQueue/' + id, {
        uid: uid,
        actId: actId,
        name: String((u.data && u.data.displayName) || (u.data && u.data.email) || ''),
        accountName: String(tk.label || tk.accountName || ''),
        phone: nt.zaloPhone,
        text: text,
        createdAt: cu && cu.data && laNgay_(cu.data.createdAt) ? cu.data.createdAt : new Date(),
        status: 'cho',
      });
      if (!cu) kq.moi++;
    } catch (err) {
      kq.loi.push('Zalo ' + String(uid).slice(0, 6) + ': ' + err);
    }
  });
  return kq;
}

/**
 * Một lời gọi duy nhất cho dongBoWebChinh (TKQC đang "thấp"): Messenger + Zalo, 1 lần/ngày/TKQC.
 * Điền patch.lastNotifyDay khi đã báo; trả về số tin Zalo mới (để gửi email tổng hợp ở cuối đồng bộ).
 * Không ném lỗi.
 */
function thongBaoThap_(tk, latest, homNay, patch, loiKhac) {
  if (tk.data.lastNotifyDay === homNay) return 0;
  let zaloMoi = 0;
  try {
    const ten = tk.data.label || tk.data.accountName;
    const uids = thanhVien(tk.data);
    const ms = guiMessengerThap_(tk.data, latest, uids);
    const zl = ghiZaloQueue_(tk.data, latest, uids, tk.id);
    zaloMoi = zl.moi;
    ms.loi.concat(zl.loi).forEach(function (e) { loiKhac.push('Thong bao ' + ten + ': ' + e); });
    // Chỉ để lại cho giờ sau khi Messenger lỗi hết (chưa gửi được ai); nếu không thì đã báo xong hôm nay.
    if (ms.gui > 0 || ms.loi.length === 0) patch.lastNotifyDay = homNay;
  } catch (err) {
    loiKhac.push('Thong bao loi: ' + err);
  }
  return zaloMoi;
}

/** Email tổng hợp cho Chủ tịch: "Có N khách cần nhắc nạp qua Zalo". Gọi cuối đồng bộ; N = 0 thì không gửi. */
function emailTongHopZalo_(soMoi) {
  const n = Number(soMoi) || 0;
  if (n <= 0) return false;
  const chu = Session.getEffectiveUser().getEmail();
  if (!chu) return false;
  MailApp.sendEmail({
    to: chu,
    subject: 'ADS-Nolimit: có ' + n + ' khách cần nhắc nạp qua Zalo',
    body:
      'Chào anh,\n\nCó ' + n + ' khách cần nhắc nạp ngân sách qua Zalo (TKQC sắp hết).\n' +
      'Mở danh sách, bấm "Chép tin & mở Zalo" rồi dán và gửi từ số 0888 88 2823:\n' + TB_LINK_ZALO_QUAN_TRI + '\n\nADS-Nolimit Agency',
    name: 'ADS-Nolimit',
  });
  return true;
}

/* ======================= 3) Chạy tay MỘT LẦN: tạo mẫu tin tiện ích ======================= */

/**
 * Tạo mẫu tin UTILITY của page (POST /{PAGE_ID}/message_templates). Chạy tay trong trình soạn Apps Script.
 * Meta duyệt thường trong vài giây; trạng thái về qua webhook message_template_status_update (ghi vào nhật ký).
 */
function taoMauTinTienIch_() {
  const ten = tbProp_('THONG_BAO_TEMPLATE') || TB_MAU_MAC_DINH;
  const lang = tbProp_('THONG_BAO_LANG') || 'vi';
  const r = goiGraph_(tbProp_('PAGE_ID') + '/message_templates', {
    name: ten,
    language: lang,
    category: 'UTILITY',
    components: [
      { type: 'BODY', text: TB_THAN_MAU, example: { body_text: [['K-Aura', '1.500.000 đ', '2']] } },
      { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Xem báo cáo', url: TB_LINK_BAO_CAO }] },
    ],
  });
  console.log(r.ok ? 'Da gui yeu cau tao mau ' + ten + ': ' + JSON.stringify(r.body) : 'Chua tao duoc mau: ' + loiGraph_(r));
  return r.ok;
}
