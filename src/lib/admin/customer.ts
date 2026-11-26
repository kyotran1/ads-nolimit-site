/**
 * Quản trị — trang Chi tiết khách (#khach-hang/<uid>[/<tab>]): đầu trang (ảnh, tên, liên hệ, số dư, nút nhanh)
 * + 5 tab: Dịch vụ & quyền · Số dư & giao dịch · Đơn hàng · Tài khoản quảng cáo · Yêu cầu.
 * Dịch vụ: gán tay (customerServices/{uid}, chỉ quản trị ghi) gộp với nguồn tự động (đơn đã trả, TKQC, khóa học, key).
 */
import { collection, query, where } from 'firebase/firestore/lite';
import type { DocumentData } from 'firebase/firestore/lite';
import { confirmDialog, h, icon, toast } from '../ui/dom';
import { parseAdAccount } from '../ads/report';
import {
  ACCESS_KEYS,
  SERVICE_IDS,
  SERVICE_STATUSES,
  isDay,
  isOpen,
  mergeServices,
  serviceName,
  statusName,
} from '../customer/services';
import type { AccessKey, AutoFacts, CustomerServices, ManualService, ServiceId, ServiceStatus } from '../customer/services';
import { balancePanel, docsOf, empty, failed, loading, orderItem, requestItem } from './money';
import { avatarEl, buildForm, db, errText, loadCustomerServices, loadCustomers, money, saveCustomerServices, str, when } from './shared';
import type { Customer } from './shared';
import { roleInAccount } from './viewers';

export const CUSTOMER_TABS = [
  ['dich-vu', 'Dịch vụ & quyền'],
  ['so-du', 'Số dư & giao dịch'],
  ['don-hang', 'Đơn hàng'],
  ['tkqc', 'Tài khoản quảng cáo'],
  ['yeu-cau', 'Yêu cầu'],
] as const;
type TabId = (typeof CUSTOMER_TABS)[number][0];

const accessLabel: Record<AccessKey, [string, string]> = {
  ads: ['Báo cáo quảng cáo', 'Khách xem chi tiêu, số dư từng TKQC và nạp ngân sách'],
  courses: ['Khóa học', 'Mục Khóa học luôn mở để khách tự mua/mở khóa; bật ở đây chỉ để ghi nhận khách được cấp khóa học'],
  keys: ['Key & máy', 'Khách xem key phần mềm, máy đã kích hoạt'],
  guides: ['Hướng dẫn sử dụng', 'Khách đọc các bài hướng dẫn'],
};

const todayVn = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const dmy = (iso: string) => (isDay(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** Trang chi tiết một khách. `tab` lấy từ hash; mặc định Dịch vụ & quyền. */
export const renderCustomer = async (root: HTMLElement, uid: string, tab = 'dich-vu') => {
  root.replaceChildren(loading());
  let c: Customer | undefined;
  try {
    c = (await loadCustomers()).get(uid);
    if (!c && /^[A-Za-z0-9_-]{6,128}$/.test(uid)) c = (await loadCustomers(true)).get(uid); // khách mới đăng ký sau khi mở trang
  } catch (err) {
    root.replaceChildren(failed(err, () => void renderCustomer(root, uid, tab)));
    return;
  }
  const back = h('div', { class: 'adm-cust-back-row' }, h('a', { class: 'btn btn-ghost btn-sm adm-cust-back', href: '#khach-hang' }, icon('arrow-left'), 'Khách hàng'));
  if (!c) {
    root.replaceChildren(back, h('div', { class: 'auth-alert', role: 'alert' }, h('p', { text: 'Không tìm thấy khách này. Có thể khách đã xóa tài khoản hoặc đường dẫn sai.' })));
    return;
  }
  const cust = c;
  const panel = h('div', { id: 'adm-cust-panel', class: 'adm-detail adm-detail--open' });
  const tabId: TabId = (CUSTOMER_TABS.find(([id]) => id === tab)?.[0] ?? 'dich-vu') as TabId;
  const tabs = h(
    'div',
    { class: 'adm-tabs', role: 'tablist', 'aria-label': 'Thông tin khách' },
    ...CUSTOMER_TABS.map(([id, label]) =>
      h('a', {
        class: 'adm-tab',
        role: 'tab',
        'data-tab': id,
        href: `#khach-hang/${uid}/${id}`,
        'aria-selected': String(id === tabId),
        text: label,
      }),
    ),
  );
  const balanceEl = h('strong', { text: money(cust.balance) });
  const adjust = h('a', { class: 'btn btn-sm', href: `#khach-hang/${uid}/so-du`, text: 'Điều chỉnh số dư' });
  const attach = h('a', { class: 'btn btn-sm btn-ghost', href: '#tai-khoan-quang-cao', text: 'Gắn TKQC' });
  root.replaceChildren(
    back,
    h(
      'header',
      { class: 'adm-cust-head' },
      avatarEl(cust),
      h(
        'div',
        { class: 'adm-cust-id' },
        h('h2', { text: cust.name || '(chưa có tên)' }),
        h('p', { text: [cust.email || 'Chưa có email', cust.phone, cust.company].filter(Boolean).join(' · ') }),
        h('p', { class: 'muted small', text: `Tạo tài khoản ${cust.createdAt ? when(new Date(cust.createdAt)) : '—'} · UID ${cust.uid}` }),
      ),
      h('div', { class: 'adm-cust-side' }, h('div', { class: 'adm-balance' }, h('span', { class: 'muted small', text: 'Số dư ví' }), balanceEl), h('div', { class: 'adm-actions' }, adjust, attach)),
    ),
    tabs,
    panel,
  );
  const refreshHead = async () => {
    const m = await loadCustomers();
    const n = m.get(uid);
    if (n) balanceEl.textContent = money(n.balance);
  };
  panel.replaceChildren(loading());
  try {
    const el =
      tabId === 'dich-vu'
        ? await servicesPanel(cust)
        : tabId === 'so-du'
          ? await balancePanel(cust, () => {
              // sau điều chỉnh: vẽ lại cả tab (sổ giao dịch mới + form sạch + nút mở lại) và số dư đầu trang
              void refreshHead();
              void renderCustomer(root, uid, 'so-du');
            })
          : tabId === 'don-hang'
            ? await ordersPanel(cust)
            : tabId === 'tkqc'
              ? await adsPanel(cust)
              : await requestsPanel(cust);
    panel.replaceChildren(el);
  } catch (err) {
    panel.replaceChildren(failed(err, () => void renderCustomer(root, uid, tabId)));
  }
};

/* ---------- Tab: Đơn hàng / TKQC / Yêu cầu ---------- */

const ordersPanel = async (c: Customer) => {
  const rows = await docsOf(query(collection(db, 'orders'), where('uid', '==', c.uid)));
  const box = h('div', { class: 'adm-list' });
  const draw = async () => {
    const latest = await docsOf(query(collection(db, 'orders'), where('uid', '==', c.uid)));
    box.replaceChildren(...(latest.length ? latest.map((o) => orderItem(o, () => void draw())) : [empty('Khách chưa có đơn nào.')]));
  };
  box.replaceChildren(...(rows.length ? rows.map((o) => orderItem(o, () => void draw())) : [empty('Khách chưa có đơn nào.')]));
  return box;
};

/** TKQC của một khách: là khách chính (uid ==) HOẶC là người xem thêm (memberUids array-contains); gộp theo id, không trùng. */
const adAccountsOf = async (uid: string) => {
  const [main, member] = await Promise.all([
    docsOf(query(collection(db, 'adAccounts'), where('uid', '==', uid))),
    docsOf(query(collection(db, 'adAccounts'), where('memberUids', 'array-contains', uid))),
  ]);
  const seen = new Set(main.map((d) => d.id));
  return [...main, ...member.filter((d) => !seen.has(d.id))];
};

const adsPanel = async (c: Customer) => {
  const snap = await adAccountsOf(c.uid);
  const raw = new Map(snap.map((d) => [d.id, d] as const));
  const accounts = snap.map((d) => parseAdAccount(d.id, d));
  if (!accounts.length)
    return h('div', { class: 'adm-list' }, empty('Chưa gắn tài khoản quảng cáo nào cho khách.'), h('p', {}, h('a', { class: 'btn btn-sm', href: '#tai-khoan-quang-cao', text: 'Gắn TKQC' })));
  return h(
    'div',
    { class: 'adm-list' },
    ...accounts.map((a) => {
      const l = a.latest;
      return h(
        'article',
        { class: `adm-item${l?.low ? ' is-low' : ''}` },
        h('div', { class: 'adm-item-head' }, h('strong', { class: 'adm-title', text: `${a.label || a.accountName}${a.active ? '' : ' (đang ẩn)'}` }), roleInAccount(raw.get(a.id) ?? {}, c.uid) === 'viewer' ? h('span', { class: 'badge', text: 'người xem thêm' }) : null, l?.low ? h('span', { class: 'badge badge--rejected', text: 'Số dư thấp' }) : null),
        h('p', { class: 'muted small', text: `${a.id} · ${a.accountName} · tab "${a.tabPattern}"` }),
        l
          ? h('p', { class: 'small' }, h('strong', { text: `Số dư ${money(l.balance)}` }), ` · hôm qua ${money(l.spendYesterday)} · TB 7 ngày ${money(l.avg7)} · cập nhật ${when(l.updatedAt)}`)
          : h('p', { class: 'small muted', text: 'Chưa có số liệu — bấm "Đồng bộ ngay" ở mục Tài khoản quảng cáo.' }),
        h('div', { class: 'adm-actions' }, h('a', { class: 'btn btn-sm btn-ghost', href: '#tai-khoan-quang-cao', text: 'Mở mục Tài khoản quảng cáo' })),
      );
    }),
  );
};

const requestsPanel = async (c: Customer) => {
  const rows = await docsOf(query(collection(db, 'requests'), where('uid', '==', c.uid)));
  const box = h('div', { class: 'adm-list' });
  const draw = async () => {
    const latest = await docsOf(query(collection(db, 'requests'), where('uid', '==', c.uid)));
    box.replaceChildren(...(latest.length ? latest.map((r) => requestItem(r, () => void draw())) : [empty('Khách chưa gửi yêu cầu nào.')]));
  };
  box.replaceChildren(...(rows.length ? rows.map((r) => requestItem(r, () => void draw())) : [empty('Khách chưa gửi yêu cầu nào.')]));
  return box;
};

/* ---------- Tab: Dịch vụ & quyền ---------- */

/** Nguồn tự động của khách (đơn đã trả, TKQC, khóa học, key) — productId quy về planId theo bảng giá. */
const loadFacts = async (uid: string): Promise<AutoFacts> => {
  const [orders, ads, courses, keys] = await Promise.all([
    docsOf(query(collection(db, 'orders'), where('uid', '==', uid))),
    adAccountsOf(uid),
    docsOf(query(collection(db, 'courseAccess'), where('uid', '==', uid))),
    docsOf(query(collection(db, 'keys'), where('uid', '==', uid))),
  ]);
  return {
    paidOrders: orders
      .filter((o) => ['paid', 'processing', 'done'].includes(str(o, 'status')))
      .map((o) => ({ type: str(o, 'type'), productId: str(o, 'productId'), name: str(o, 'name'), createdAt: (o.createdAt as { toDate?: () => Date })?.toDate?.() ?? null })),
    adAccounts: ads.filter((a) => a.active !== false).map((a) => ({ label: str(a, 'label') || str(a, 'accountName'), service: str(a, 'service') })),
    courses: courses.length,
    keys: keys.filter((k) => str(k, 'status') === 'active').length,
  };
};

const servicesPanel = async (c: Customer): Promise<HTMLElement> => {
  const [cs, facts] = await Promise.all([loadCustomerServices(c.uid), loadFacts(c.uid)]);
  const box = h('div', { class: 'adm-detail adm-detail--open' });
  const draw = () => box.replaceChildren(...servicesView(c, cs, facts, draw));
  draw();
  return box;
};

const save = async (uid: string, cs: CustomerServices, okText: string) => {
  try {
    await saveCustomerServices(uid, cs);
    toast(okText);
    return true;
  } catch (err) {
    toast(errText(err), 'error');
    return false;
  }
};

const servicesView = (c: Customer, cs: CustomerServices, facts: AutoFacts, redraw: () => void): HTMLElement[] => {
  const cards = mergeServices(cs, facts, 'vi');
  const manualById = new Map(cs.services.map((s, i) => [s.id, i] as const));

  const cardEl = (card: (typeof cards)[number]) => {
    const idx = card.source === 'manual' ? manualById.get(card.id) : undefined;
    const m = idx !== undefined ? cs.services[idx] : null;
    const head = h(
      'div',
      { class: 'cs-card-head' },
      h('strong', { text: card.label }),
      h('span', { class: 'cs-tag', text: m ? 'Gán tay' : 'Tự động' }),
    );
    const meta = [statusName(card.status, 'vi'), card.since ? `từ ${dmy(card.since)}` : '', card.extra].filter(Boolean).join(' · ');
    const el = h('article', { class: `cs-card is-${card.status}`, 'data-service': card.id }, head, h('p', { class: 'small muted', text: meta }));
    if (m) {
      if (m.note) el.append(h('p', { class: 'small pre', text: m.note }));
      const status = h('select', { class: 'adm-select cs-status', 'aria-label': `Trạng thái ${card.label}` }, ...SERVICE_STATUSES.map((s) => h('option', { value: s, text: statusName(s, 'vi') })));
      status.value = m.status;
      status.addEventListener('change', async () => {
        const prev = m.status;
        m.status = status.value as ServiceStatus;
        if (await save(c.uid, cs, `${card.label}: ${statusName(m.status, 'vi')}.`)) redraw();
        else m.status = prev;
      });
      const edit = h('button', { type: 'button', class: 'btn btn-sm btn-ghost', text: 'Sửa' });
      edit.addEventListener('click', () => openForm(m));
      const del = h('button', { type: 'button', class: 'btn btn-sm btn-ghost', text: 'Xóa' });
      del.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: `Xóa "${card.label}" khỏi danh sách dịch vụ?`, body: ['Chỉ xóa dòng gán tay này. Đơn hàng, TKQC, khóa học của khách không bị ảnh hưởng. Muốn giữ lịch sử thì đổi trạng thái sang "Kết thúc" thay vì xóa.'], confirm: 'Xóa', cancel: 'Giữ lại', danger: true });
        if (!ok.ok) return;
        const kept = cs.services.filter((s) => s !== m);
        const before = cs.services;
        cs.services = kept;
        if (await save(c.uid, cs, 'Đã xóa dịch vụ.')) redraw();
        else cs.services = before;
      });
      el.append(h('div', { class: 'adm-actions' }, status, edit, del));
    } else if (card.source === 'ad') el.append(h('p', { class: 'small muted', text: 'Từ tài khoản quảng cáo đã gắn.' }));
    else if (card.source === 'order') el.append(h('p', { class: 'small muted', text: 'Từ đơn khách đã thanh toán.' }));
    else if (card.source === 'course') el.append(h('p', { class: 'small muted', text: 'Từ khóa học khách đã mua / được cấp.' }));
    else if (card.source === 'key') el.append(h('p', { class: 'small muted', text: 'Từ key phần mềm đã cấp.' }));
    return el;
  };

  // Form thêm / sửa dịch vụ gán tay
  const formHost = h('div');
  let editing: ManualService | null = null;
  const openForm = (m: ManualService | null) => {
    editing = m;
    const f = buildForm(
      [
        { name: 'id', label: 'Dịch vụ', type: 'select', required: true, value: m?.id ?? 'ads', options: SERVICE_IDS.map((id) => ({ value: id, label: serviceName(id, 'vi') })) },
        { name: 'status', label: 'Trạng thái', type: 'select', required: true, value: m?.status ?? 'active', options: SERVICE_STATUSES.map((s) => ({ value: s, label: statusName(s, 'vi') })) },
        { name: 'label', label: 'Tên hiện cho khách', required: true, maxlength: 120, value: m?.label || serviceName((m?.id ?? 'ads') as ServiceId, 'vi'), hint: 'Ví dụ: "Chạy ads K-Aura" — để khách nhận ra ngay.' },
        { name: 'since', label: 'Bắt đầu từ ngày', required: true, value: m?.since ?? todayVn(), placeholder: 'YYYY-MM-DD', hint: 'Dạng năm-tháng-ngày, ví dụ 2026-11-24.' },
        { name: 'note', label: 'Ghi chú (khách không thấy trên web)', type: 'textarea', rows: 2, maxlength: 300, value: m?.note ?? '', wide: true },
      ],
      m ? 'Lưu thay đổi' : 'Thêm vào danh sách',
    );
    f.form.id = 'cs-form';
    const idSel = f.inputs.get('id') as HTMLSelectElement;
    const labelIn = f.inputs.get('label') as HTMLInputElement;
    idSel.id = 'cs-id';
    labelIn.id = 'cs-label';
    (f.inputs.get('note') as HTMLTextAreaElement).id = 'cs-note';
    const sinceIn = f.inputs.get('since') as HTMLInputElement;
    sinceIn.type = 'date';
    let autoLabel = !m || m.label === serviceName(m.id, 'vi');
    labelIn.addEventListener('input', () => (autoLabel = false));
    idSel.addEventListener('change', () => {
      if (autoLabel || !labelIn.value.trim()) labelIn.value = serviceName(idSel.value as ServiceId, 'vi');
    });
    const cancel = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Hủy', onclick: () => formHost.replaceChildren() });
    f.form.querySelector('.acc-actions')?.append(cancel);
    f.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      f.clearErrors();
      const id = f.value('id') as ServiceId;
      const status = f.value('status') as ServiceStatus;
      const since = f.value('since');
      const label = f.value('label').trim();
      if (!(SERVICE_IDS as readonly string[]).includes(id)) f.setError('id', 'Chọn dịch vụ.');
      if (!(SERVICE_STATUSES as readonly string[]).includes(status)) f.setError('status', 'Chọn trạng thái.');
      if (!isDay(since)) f.setError('since', 'Nhập ngày dạng 2026-11-24.');
      if (!label) f.setError('label', 'Nhập tên hiện cho khách.');
      if (!editing && cs.services.length >= 30) f.setError('id', 'Tối đa 30 dịch vụ gán tay cho một khách.');
      if (cs.services.some((s) => s.id === id && s !== editing)) f.setError('id', 'Khách đã có dịch vụ này — bấm Sửa ở thẻ đó thay vì thêm mới.');
      if (f.focusFirstError()) return;
      f.submit.disabled = true;
      const before = cs.services;
      const item: ManualService = { id, label, status, since, note: f.value('note').trim(), source: 'manual' };
      cs.services = editing ? cs.services.map((s) => (s === editing ? item : s)) : [...cs.services, item];
      if (await save(c.uid, cs, editing ? 'Đã lưu dịch vụ.' : `Đã thêm "${label}".`)) {
        formHost.replaceChildren();
        redraw();
      } else {
        cs.services = before;
        f.submit.disabled = false;
      }
    });
    formHost.replaceChildren(h('section', { class: 'panel' }, h('h3', { class: 'adm-sub', text: m ? `Sửa: ${m.label}` : 'Thêm dịch vụ gán tay' }), f.form));
    f.form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    idSel.focus();
  };
  const addBtn = h('button', { type: 'button', class: 'btn btn-sm' }, icon('plus'), 'Thêm dịch vụ');
  addBtn.addEventListener('click', () => openForm(null));

  // Quyền truy cập
  const switches = ACCESS_KEYS.map((key) => {
    const [label, hint] = accessLabel[key];
    const open = isOpen(key, cs, facts);
    const byData = open && !cs.access[key];
    const input = h('input', { type: 'checkbox', role: 'switch', 'data-access': key }) as HTMLInputElement;
    input.checked = cs.access[key];
    input.addEventListener('change', async () => {
      const prev = cs.access[key];
      cs.access[key] = input.checked;
      if (await save(c.uid, cs, `${label}: ${input.checked ? 'đã mở' : 'đã khóa'} cho khách.`)) redraw();
      else {
        cs.access[key] = prev;
        input.checked = prev;
      }
    });
    const why = byData
      ? key === 'ads'
        ? ' — đang mở vì đã có TKQC gắn cho khách'
        : key === 'courses'
          ? ' — đang mở vì khách đã có khóa học'
          : ' — đang mở vì khách đã có key'
      : '';
    return h('label', { class: 'cs-switch' }, input, h('span', {}, h('strong', { text: label }), h('small', { text: hint + why })));
  });

  const parts: (HTMLElement | null)[] = [
    h('div', { class: 'panel-head' }, h('h3', { class: 'adm-sub', text: 'Dịch vụ đang dùng' }), addBtn),
    h('p', { class: 'muted small', text: 'Gán tay: anh thêm/sửa ở đây (khách thấy ở Tổng quan). Tự động: lấy từ đơn đã thanh toán, TKQC đã gắn, khóa học và key — chỉ xem.' }),
    cards.length ? h('div', { class: 'cs-cards' }, ...cards.map(cardEl)) : empty('Khách chưa dùng dịch vụ nào. Bấm "Thêm dịch vụ" để gán.'),
    formHost,
    h('h3', { class: 'adm-sub', text: 'Quyền truy cập các mục' }),
    h('p', { class: 'muted small', text: 'Mục chưa mở vẫn hiện trên menu của khách nhưng có khóa; khách bấm vào thấy "Liên hệ để mở". Mục đã có dữ liệu thật tự mở dù chưa bật.' }),
    h('div', { class: 'cs-access' }, ...switches),
    cs.updatedAt ? h('p', { class: 'muted small', text: `Cập nhật lần cuối ${when(cs.updatedAt)}.` }) : null,
  ];
  return parts.filter((x): x is HTMLElement => x !== null);
};
