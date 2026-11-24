/**
 * Quản trị — Tài khoản quảng cáo: gắn TKQC ↔ khách (email đã đăng ký web), ngưỡng báo số dư thấp,
 * xem số dư mọi TKQC, nút "Đồng bộ ngay" (gọi Apps Script trong trang tính bot 3).
 * Số liệu (latest, adReports) do Apps Script ghi; ở đây chỉ sửa phần cấu hình.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore/lite';
import { confirmDialog, h, icon, toast } from '../ui/dom';
import { AD_TOPUP_DEFAULTS, dmy, parseAdAccount, parseAdBudgetTopup, parseAdTopupSettings, todayVn } from '../ads/report';
import type { AdAccount, AdBudgetTopup } from '../ads/report';
import { buildForm, config, customerByEmail, db, errText, loadCustomers, me, money, parseVnd, when, who } from './shared';

const vn = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

const services = [
  { value: 'ads', label: 'Quảng cáo hiệu suất' },
  { value: 'agency-account', label: 'Tài khoản Agency BM2500' },
  { value: 'ad-budget', label: 'Nạp ngân sách quảng cáo' },
];
const serviceName = (v: string) => services.find((s) => s.value === v)?.label ?? v;

export const renderAdAccounts = async (root: HTMLElement) => {
  let editing: AdAccount | null = null;
  const f = buildForm(
    [
      { name: 'actId', label: 'ID tài khoản quảng cáo', required: true, placeholder: '626818827055263', inputmode: 'numeric', hint: 'Số ID trong Trình quản lý quảng cáo (có hoặc không có "act_").' },
      { name: 'accountName', label: 'Tên TKQC', required: true, maxlength: 120, placeholder: '5263 - (TK1) Philippine' },
      { name: 'label', label: 'Tên page / tên hiển thị cho khách', maxlength: 120, placeholder: 'K-Aura' },
      { name: 'service', label: 'Dịch vụ', type: 'select', value: 'ads', options: services, required: true },
      { name: 'email', label: 'Email khách', type: 'email', required: true, placeholder: 'khach@example.com', hint: 'Khách phải đã tạo tài khoản trên web.' },
      {
        name: 'tabPattern',
        label: 'Tên tab trong trang tính bot 3 (phần sau "BC ADS T11")',
        required: true,
        maxlength: 120,
        placeholder: 'Master Eva Truong - K-Aura',
        hint: 'Script tìm tab có tên chứa "T<tháng>" và chữ này. Sang tháng mới, tạo tab T12 cùng tên là web tự nhận.',
        wide: true,
      },
      { name: 'lowVnd', label: 'Báo thấp khi số dư dưới (đ)', type: 'number', value: '3.000.000', required: true },
      { name: 'lowDays', label: 'Hoặc khi chỉ đủ chạy dưới (ngày)', type: 'number', value: 3, required: true },
      { name: 'emailAlerts', label: 'Gửi email cho khách khi số dư thấp (tối đa 1 lần/ngày)', type: 'checkbox', value: true, wide: true },
      { name: 'active', label: 'Hiện cho khách', type: 'checkbox', value: true, wide: true },
    ],
    'Lưu tài khoản quảng cáo',
  );

  const fill = (a: AdAccount | null) => {
    editing = a;
    const set = (n: string, v: string) => {
      const el = f.inputs.get(n);
      if (el) el.value = v;
    };
    const check = (n: string, v: boolean) => {
      const el = f.inputs.get(n) as HTMLInputElement | undefined;
      if (el) el.checked = v;
    };
    set('actId', a ? a.id.replace(/^act_/, '') : '');
    set('accountName', a?.accountName ?? '');
    set('label', a?.label ?? '');
    set('service', a?.service ?? 'ads');
    set('email', a?.customerEmail ?? '');
    set('tabPattern', a?.tabPattern ?? '');
    set('lowVnd', a ? new Intl.NumberFormat('vi-VN').format(a.lowVnd) : '3.000.000');
    set('lowDays', String(a?.lowDays ?? 3));
    check('emailAlerts', a?.emailAlerts ?? true);
    check('active', a?.active ?? true);
    (f.inputs.get('actId') as HTMLInputElement).readOnly = Boolean(a);
    f.submit.textContent = a ? 'Lưu thay đổi' : 'Lưu tài khoản quảng cáo';
    formTitle.textContent = a ? `Sửa: ${a.label || a.accountName}` : 'Thêm tài khoản quảng cáo';
  };

  f.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    f.clearErrors();
    f.alert.replaceChildren();
    const raw = f.value('actId').replace(/^act_/i, '');
    const lowVnd = parseVnd(f.value('lowVnd'));
    const lowDays = Number(f.value('lowDays'));
    if (!/^\d{5,20}$/.test(raw)) f.setError('actId', 'ID gồm 5–20 chữ số.');
    if (!f.value('accountName')) f.setError('accountName', 'Nhập tên TKQC.');
    if (!f.value('email')) f.setError('email', 'Nhập email khách.');
    if (f.value('tabPattern').length < 2) f.setError('tabPattern', 'Nhập tên tab.');
    if (!Number.isInteger(lowVnd) || lowVnd < 0 || lowVnd > 1e9) f.setError('lowVnd', 'Số tiền không hợp lệ.');
    if (!Number.isInteger(lowDays) || lowDays < 0 || lowDays > 60) f.setError('lowDays', 'Từ 0 đến 60 ngày.');
    if (f.focusFirstError()) return;
    f.submit.disabled = true;
    try {
      const c = await customerByEmail(f.value('email'));
      if (!c) {
        f.setError('email', 'Không tìm thấy khách với email này. Khách cần tạo tài khoản trên web trước.');
        f.focusFirstError();
        return;
      }
      const id = `act_${raw}`;
      await setDoc(
        doc(db, 'adAccounts', id),
        {
          uid: c.uid,
          customerEmail: c.email,
          accountName: f.value('accountName'),
          label: f.value('label'),
          service: f.value('service'),
          tabPattern: f.value('tabPattern'),
          lowVnd,
          lowDays,
          emailAlerts: f.checked('emailAlerts'),
          active: f.checked('active'),
          updatedAt: serverTimestamp(),
          updatedBy: me(),
        },
        { merge: true },
      );
      toast(editing ? 'Đã lưu thay đổi. Đang đồng bộ báo cáo cho khách…' : 'Đã thêm tài khoản quảng cáo. Đang đồng bộ số liệu…');
      fill(null);
      // Báo cáo (adReports) mang uid của khách do Apps Script ghi lúc đồng bộ. Đổi khách mà không đồng bộ ngay thì
      // khách mới thấy "Chưa có báo cáo" và khách cũ vẫn đọc được báo cáo cho tới lần đồng bộ mỗi giờ → đồng bộ luôn.
      syncBtn.click();
    } catch (err) {
      f.alert.replaceChildren(h('p', { text: errText(err) }));
    } finally {
      f.submit.disabled = false;
    }
  });

  const formTitle = h('h2', { text: 'Thêm tài khoản quảng cáo' });
  const cancel = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Hủy sửa', onclick: () => fill(null) });
  f.form.querySelector('.acc-actions')?.append(cancel);

  const list = h('div', { class: 'adm-list' });
  const syncStatus = h('p', { class: 'muted small', role: 'status' });
  const syncBtn = h('button', { type: 'button', class: 'btn btn-sm' }, icon('refresh'), 'Đồng bộ ngay');
  syncBtn.addEventListener('click', async () => {
    if (!config.adsSyncUrl) {
      syncStatus.textContent = 'Chưa cấu hình địa chỉ đồng bộ.';
      return;
    }
    syncBtn.disabled = true;
    syncStatus.textContent = 'Đang đồng bộ từ trang tính…';
    try {
      const res = await fetch(`${config.adsSyncUrl}?dongbo=1`);
      const data = (await res.json()) as { ok?: boolean; loi?: string; soTk?: number };
      syncStatus.textContent = data.ok ? `Đã đồng bộ ${data.soTk ?? 0} tài khoản.` : `Chưa đồng bộ được: ${data.loi ?? 'lỗi không rõ'}`;
      await drawList();
    } catch (err) {
      syncStatus.textContent = `Chưa đồng bộ được: ${String(err)}`;
    } finally {
      syncBtn.disabled = false;
    }
  });

  const drawList = async () => {
    list.replaceChildren(h('p', { class: 'muted', text: 'Đang tải…' }));
    try {
      await loadCustomers();
      const snap = await getDocs(collection(db, 'adAccounts'));
      const accounts = snap.docs.map((x) => parseAdAccount(x.id, x.data())).sort((a, b) => a.accountName.localeCompare(b.accountName));
      if (!accounts.length) {
        list.replaceChildren(h('p', { class: 'muted', text: 'Chưa có tài khoản quảng cáo nào.' }));
        return;
      }
      list.replaceChildren(
        ...accounts.map((a) => {
          const l = a.latest;
          const edit = h('button', { type: 'button', class: 'btn btn-sm', text: 'Sửa', onclick: () => { fill(a); f.form.scrollIntoView({ behavior: 'smooth' }); } });
          const del = h('button', { type: 'button', class: 'btn btn-sm btn-ghost', text: 'Xóa' });
          del.addEventListener('click', async () => {
            const ok = await confirmDialog({
              title: `Xóa ${a.label || a.accountName}?`,
              body: ['Khách sẽ không thấy tài khoản này nữa. Báo cáo cũ vẫn giữ trong Firestore. Trang tính không bị ảnh hưởng.'],
              confirm: 'Xóa',
              cancel: 'Giữ lại',
            });
            if (!ok.ok) return;
            try {
              await deleteDoc(doc(db, 'adAccounts', a.id));
              toast('Đã xóa.');
              void drawList();
            } catch (err) {
              toast(errText(err), 'error');
            }
          });
          return h(
            'article',
            { class: `adm-item${l?.low ? ' is-low' : ''}` },
            h(
              'div',
              { class: 'adm-ad-main' },
              h('h3', { text: `${a.label || a.accountName}${a.active ? '' : ' (đang ẩn)'}` }),
              h('p', { class: 'muted small', text: `${a.id} · ${a.accountName} · ${serviceName(a.service)}` }),
              h('p', { class: 'small', text: `Khách: ${who(a.uid, a.customerEmail)}` }),
              h('p', { class: 'small', text: `Tab: "${a.tabPattern}" · Báo thấp: dưới ${money(a.lowVnd)} hoặc dưới ${a.lowDays} ngày · Email: ${a.emailAlerts ? 'bật' : 'tắt'}` }),
              l
                ? h('p', { class: 'small' }, h('strong', { text: `Số dư ${money(l.balance)}` }), ` · tháng ${money(l.totalSpend)} · hôm nay ${money(l.spendToday)} · hôm qua ${money(l.spendYesterday)} · cập nhật ${when(l.updatedAt)}`, l.low ? h('span', { class: 'badge badge--rejected', text: ' Số dư thấp' }) : null)
                : h('p', { class: 'small muted', text: 'Chưa có số liệu — bấm "Đồng bộ ngay".' }),
            ),
            h('div', { class: 'adm-actions' }, edit, h('a', { class: 'btn btn-sm btn-ghost', href: `#khach-hang/${a.uid}`, text: 'Xem khách' }), del),
          );
        }),
      );
    } catch (err) {
      list.replaceChildren(h('p', { class: 'auth-alert', text: errText(err) }));
    }
  };

  /* ---------- Cài đặt nạp ngân sách (settings/adTopup) ---------- */
  const sf = buildForm(
    [
      {
        name: 'presets',
        label: 'Các mức nạp gợi ý (số tiền khách chuyển, đã gồm phí)',
        required: true,
        wide: true,
        placeholder: '11.000.000, 22.000.000',
        hint: 'Cách nhau bằng dấu phẩy, tối đa 8 mức. Ví dụ: 11.000.000, 22.000.000, 55.000.000',
      },
      { name: 'min', label: 'Tối thiểu (đ)', type: 'number', required: true },
      { name: 'max', label: 'Tối đa (đ)', type: 'number', required: true },
      { name: 'feePercent', label: 'Phí (%)', type: 'number', required: true, hint: 'Ngân sách vào TKQC = số tiền chuyển × 100 / (100 + phí).' },
    ],
    'Lưu cài đặt nạp',
  );
  const fillSettings = async () => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'adTopup'));
      const c = snap.exists() ? parseAdTopupSettings(snap.data()) : AD_TOPUP_DEFAULTS;
      (sf.inputs.get('presets') as HTMLInputElement).value = c.presets.map(vn).join(', ');
      (sf.inputs.get('min') as HTMLInputElement).value = vn(c.min);
      (sf.inputs.get('max') as HTMLInputElement).value = vn(c.max);
      (sf.inputs.get('feePercent') as HTMLInputElement).value = String(c.feePercent);
      if (!snap.exists()) sf.alert.replaceChildren(h('p', { text: 'Chưa lưu cài đặt — khách đang thấy mức mặc định ở trên. Bấm "Lưu cài đặt nạp" để dùng mức của anh.' }));
    } catch (err) {
      sf.alert.replaceChildren(h('p', { text: errText(err) }));
    }
  };
  sf.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    sf.clearErrors();
    sf.alert.replaceChildren();
    const parts = sf.value('presets').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
    const presets = parts.map(parseVnd);
    const min = parseVnd(sf.value('min'));
    const max = parseVnd(sf.value('max'));
    const fee = Number(sf.value('feePercent'));
    const okMoney = (v: number) => Number.isInteger(v) && v >= 100000 && v <= 1e9 && v % 1000 === 0;
    if (!okMoney(min)) sf.setError('min', 'Từ 100.000đ, chẵn nghìn.');
    if (!okMoney(max) || max < min) sf.setError('max', 'Chẵn nghìn, không nhỏ hơn mức tối thiểu, tối đa 1 tỷ.');
    if (!Number.isInteger(fee) || fee < 0 || fee > 50) sf.setError('feePercent', 'Từ 0 đến 50.');
    if (!presets.length || presets.length > 8 || presets.some((v) => !okMoney(v) || v < min || v > max))
      sf.setError('presets', 'Từ 1 đến 8 mức, mỗi mức chẵn nghìn và nằm trong khoảng tối thiểu – tối đa.');
    if (sf.focusFirstError()) return;
    sf.submit.disabled = true;
    try {
      await setDoc(doc(db, 'settings', 'adTopup'), {
        presets: [...new Set(presets)].sort((a, b) => a - b),
        min,
        max,
        feePercent: fee,
        updatedAt: serverTimestamp(),
        updatedBy: me(),
      });
      toast('Đã lưu cài đặt nạp ngân sách. Khách thấy mức mới ngay lần mở khung nạp tiếp theo.');
      await fillSettings();
    } catch (err) {
      sf.alert.replaceChildren(h('p', { text: errText(err) }));
    } finally {
      sf.submit.disabled = false;
    }
  });

  /* ---------- Lệnh nạp ngân sách (adTopups) ---------- */
  const orders = h('div', { class: 'adm-list' });
  const orderStatus = h('p', { class: 'muted small', role: 'status' });
  const syncNow = async (): Promise<string> => {
    if (!config.adsSyncUrl) return 'Chưa cấu hình địa chỉ đồng bộ — trang tính sẽ ghi ở lần đồng bộ mỗi giờ.';
    try {
      const res = await fetch(`${config.adsSyncUrl}?dongbo=1`);
      const data = (await res.json()) as { ok?: boolean; loi?: string; ghiNap?: number };
      return data.ok
        ? `Đã ghi ${data.ghiNap ?? 0} lệnh vào trang tính và cập nhật số dư trên web.`
        : `Chưa đồng bộ ngay được (${data.loi ?? 'lỗi không rõ'}) — trang tính sẽ tự ghi ở lần đồng bộ mỗi giờ, hoặc bấm "Đồng bộ ngay" sau 30 giây.`;
    } catch (err) {
      return `Chưa đồng bộ ngay được (${String(err)}) — trang tính sẽ tự ghi ở lần đồng bộ mỗi giờ.`;
    }
  };
  const tState = (t: AdBudgetTopup) =>
    t.status === 'approved'
      ? t.written
        ? `Đã ghi vào trang tính${t.sheetTab ? ` (${t.sheetTab})` : ''} ${when(t.writtenAt)}`
        : 'Đã nhận tiền — chờ ghi vào trang tính'
      : t.sepayNote
        ? t.sepayNote
        : t.status === 'pending'
        ? 'Chờ chuyển khoản'
        : t.status === 'cancelled'
          ? 'Khách đã hủy'
          : `Từ chối${t.reason ? `: ${t.reason}` : ''}`;
  const drawOrders = async () => {
    orders.replaceChildren(h('p', { class: 'muted', text: 'Đang tải…' }));
    try {
      await loadCustomers();
      const snap = await getDocs(collection(db, 'adTopups'));
      const all = snap.docs.map((x) => parseAdBudgetTopup(x.id, x.data()));
      const rank = (t: AdBudgetTopup) => (t.sepayNote && t.status !== 'approved' && t.status !== 'rejected' ? 0 : t.status === 'pending' ? 0 : t.status === 'approved' && !t.written ? 1 : 2);
      all.sort((a, b) => rank(a) - rank(b) || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      const list = all.filter((t, i) => rank(t) < 2 || i < 30);
      if (!list.length) {
        orders.replaceChildren(h('p', { class: 'muted', text: 'Chưa có lệnh nạp ngân sách nào.' }));
        return;
      }
      orders.replaceChildren(
        ...list.map((t) => {
          const canDecide = (t.status === 'pending' || t.status === 'cancelled') && !t.written;
          const day = h('input', { type: 'date', value: t.day || todayVn(), 'aria-label': `Ngày ghi vào trang tính cho ${t.code}` }) as HTMLInputElement;
          const ok = h('button', { type: 'button', class: 'btn btn-sm btn-primary', text: 'Đã nhận tiền' });
          const no = h('button', { type: 'button', class: 'btn btn-sm btn-ghost', text: 'Từ chối' });
          ok.addEventListener('click', async () => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day.value)) {
              toast('Chọn ngày ghi vào trang tính.', 'error');
              return;
            }
            const c = await confirmDialog({
              title: `Xác nhận đã nhận ${money(t.amount)}?`,
              body: [
                h('p', { text: `Nội dung chuyển khoản: ${t.code}. Khách: ${who(t.uid, t.email)}.` }),
                h('p', { text: `Trang tính bot 3 sẽ cộng ${money(t.budget)} (đã trừ phí ${t.feePercent}%) vào cột nạp của ${t.accountLabel}, ngày ${dmy(day.value)}.` }),
                h('p', { text: 'Anh kiểm tra app ngân hàng đã có tiền với đúng nội dung này rồi mới bấm.' }),
              ],
              confirm: 'Đã nhận tiền',
              cancel: 'Chưa',
            });
            if (!c.ok) return;
            ok.disabled = true;
            no.disabled = true;
            try {
              await updateDoc(doc(db, 'adTopups', t.code), { status: 'approved', day: day.value, decidedAt: serverTimestamp(), decidedBy: me() });
              orderStatus.textContent = 'Đã duyệt. Đang ghi vào trang tính…';
              orderStatus.textContent = await syncNow();
              void drawOrders();
              void drawList();
            } catch (err) {
              toast(errText(err), 'error');
              ok.disabled = false;
              no.disabled = false;
            }
          });
          no.addEventListener('click', async () => {
            const c = await confirmDialog({
              title: `Từ chối lệnh ${t.code}?`,
              body: ['Khách sẽ thấy lệnh bị từ chối kèm lý do. Trang tính không thay đổi.'],
              confirm: 'Từ chối',
              cancel: 'Giữ lại',
              danger: true,
              input: { label: 'Lý do (khách thấy)', required: true, maxlength: 300 },
            });
            if (!c.ok) return;
            try {
              await updateDoc(doc(db, 'adTopups', t.code), { status: 'rejected', reason: c.value, decidedAt: serverTimestamp(), decidedBy: me() });
              toast('Đã từ chối.');
              void drawOrders();
            } catch (err) {
              toast(errText(err), 'error');
            }
          });
          return h(
            'article',
            { class: `adm-item${canDecide ? ' is-low' : ''}` },
            h(
              'div',
              { class: 'adm-ad-main' },
              h('h3', { text: `${money(t.amount)} · ${t.code}` }),
              h('p', { class: 'small', text: `${t.accountLabel} (${t.actId}) · Ngân sách ${money(t.budget)} · phí ${t.feePercent}%` }),
              h('p', { class: 'small muted', text: `Khách: ${who(t.uid, t.email)} · tạo ${when(t.createdAt)} · ngày ghi ${dmy(t.day)}` }),
              h('p', { class: 'small', text: `${tState(t)}${t.status === 'approved' && t.decidedBy === 'sepay' ? ' · tự xác nhận qua SePay' : ''}` }),
            ),
            canDecide ? h('div', { class: 'adm-actions' }, h('label', { class: 'small' }, 'Ngày ghi ', day), ok, no) : null,
          );
        }),
      );
    } catch (err) {
      orders.replaceChildren(h('p', { class: 'auth-alert', text: errText(err) }));
    }
  };
  const refreshOrders = h('button', { type: 'button', class: 'btn btn-sm', onclick: () => void drawOrders() }, icon('refresh'), 'Tải lại');

  root.replaceChildren(
    h('p', { class: 'view-lead', text: 'Gắn tài khoản quảng cáo với khách để khách xem báo cáo chi tiêu, số dư và nhận cảnh báo số dư thấp. Số liệu lấy từ trang tính "BC ADS - META API (BOT 3)": chi tiêu do bot 3 nhập từ Meta, tiền nạp anh nhập ở cột B/C.' }),
    h('section', {}, h('div', { class: 'panel-head' }, h('h2', { class: 'sub-title', text: 'Lệnh nạp ngân sách' }), refreshOrders), h('p', { class: 'muted small', text: 'Khách tạo lệnh trong Báo cáo quảng cáo. Tiền về MB Bank đúng số tiền và nội dung → SePay báo, hệ thống tự xác nhận và cộng ngân sách (đã trừ phí) vào cột nạp đúng ngày. Lệnh chuyển sai số tiền hiện ghi chú "SePay: …" để anh tự bấm "Đã nhận tiền" hoặc "Từ chối".' }), orderStatus, orders),
    h('section', {}, h('div', { class: 'panel-head' }, h('h2', { class: 'sub-title', text: 'Tất cả tài khoản quảng cáo' }), syncBtn), syncStatus, list),
    h('section', { class: 'panel' }, formTitle, f.form),
    h('section', { class: 'panel' }, h('h2', { text: 'Cài đặt nạp ngân sách' }), sf.form),
  );
  fill(null);
  await Promise.all([drawList(), drawOrders(), fillSettings()]);
};
