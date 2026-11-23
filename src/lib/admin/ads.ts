/**
 * Quản trị — Tài khoản quảng cáo: gắn TKQC ↔ khách (email đã đăng ký web), ngưỡng báo số dư thấp,
 * xem số dư mọi TKQC, nút "Đồng bộ ngay" (gọi Apps Script trong trang tính bot 3).
 * Số liệu (latest, adReports) do Apps Script ghi; ở đây chỉ sửa phần cấu hình.
 */
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore/lite';
import { confirmDialog, h, icon, toast } from '../ui/dom';
import { parseAdAccount } from '../ads/report';
import type { AdAccount } from '../ads/report';
import { buildForm, config, customerByEmail, db, errText, loadCustomers, me, money, parseVnd, when, who } from './shared';

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
      toast(editing ? 'Đã lưu thay đổi.' : 'Đã thêm tài khoản quảng cáo. Bấm "Đồng bộ ngay" để lấy số liệu.');
      fill(null);
      void drawList();
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
                ? h('p', { class: 'small' }, h('strong', { text: `Số dư ${money(l.balance)}` }), ` · hôm qua ${money(l.spendYesterday)} · TB 7 ngày ${money(l.avg7)} · cập nhật ${when(l.updatedAt)}`, l.low ? h('span', { class: 'badge badge--rejected', text: ' Số dư thấp' }) : null)
                : h('p', { class: 'small muted', text: 'Chưa có số liệu — bấm "Đồng bộ ngay".' }),
            ),
            h('div', { class: 'adm-actions' }, edit, del),
          );
        }),
      );
    } catch (err) {
      list.replaceChildren(h('p', { class: 'auth-alert', text: errText(err) }));
    }
  };

  root.replaceChildren(
    h('p', { class: 'view-lead', text: 'Gắn tài khoản quảng cáo với khách để khách xem báo cáo chi tiêu, số dư và nhận cảnh báo số dư thấp. Số liệu lấy từ trang tính "BC ADS - META API (BOT 3)": chi tiêu do bot 3 nhập từ Meta, tiền nạp anh nhập ở cột B/C.' }),
    h('section', { class: 'panel' }, formTitle, f.form),
    h('section', {}, h('div', { class: 'panel-head' }, h('h2', { class: 'sub-title', text: 'Tất cả tài khoản quảng cáo' }), syncBtn), syncStatus, list),
  );
  fill(null);
  await drawList();
};
