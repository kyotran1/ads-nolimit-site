/**
 * Quản trị — Tổng quan, Nạp tiền (duyệt / từ chối), Đơn hàng (trạng thái, hoàn tiền),
 * Yêu cầu dịch vụ (trạng thái), Khách hàng (tìm, xem số dư & sổ giao dịch, điều chỉnh số dư).
 * Mọi thao tác cộng/trừ tiền chạy trong MỘT transaction (src/lib/ledger/ops.ts), luật Firestore kiểm tra lại.
 */
import { collection, doc, getCount, getDocs, query, serverTimestamp, updateDoc, where, getAggregate, sum } from 'firebase/firestore/lite';
import type { DocumentData, Query } from 'firebase/firestore/lite';
import { byId, confirmDialog, copyButton, h, icon, toast } from '../ui/dom';
import {
  avatarEl,
  badge,
  buildForm,
  config,
  customerByEmail,
  db,
  errText,
  loadCustomers,
  me,
  money,
  num,
  ops,
  parseVnd,
  statusLabel,
  str,
  time,
  when,
  who,
} from './shared';
import type { Customer } from './shared';

const copyLabels = { copy: 'Chép', copied: 'Đã chép', failed: 'Lỗi' };

const chips = (options: [string, string][], current: string, onPick: (v: string) => void) =>
  h(
    'div',
    { class: 'chips', role: 'group', 'aria-label': 'Lọc' },
    ...options.map(([value, label]) => {
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(value === current), text: label });
      b.addEventListener('click', () => onPick(value));
      return b;
    }),
  );

const loading = () => h('p', { class: 'row-loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Đang tải…');
const empty = (text: string) => h('p', { class: 'adm-empty', text });
const failed = (err: unknown, retry: () => void) => {
  const b = h('button', { type: 'button', class: 'btn btn-sm', text: 'Thử lại' });
  b.addEventListener('click', retry);
  return h('div', { class: 'auth-alert', role: 'alert' }, h('p', { text: errText(err) }), b);
};

const docsOf = async (q: Query<DocumentData>) =>
  (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }) as DocumentData & { id: string }).sort((a, b) => time(b) - time(a));

/* ======================== Tổng quan ======================== */

export const renderOverview = async (root: HTMLElement) => {
  const cards: { label: string; to: string; icon: Parameters<typeof icon>[0]; q: () => Promise<string> }[] = [
    { label: 'Lệnh nạp chờ duyệt', to: '#nap-tien', icon: 'wallet', q: async () => String((await getCount(query(collection(db, 'topups'), where('status', '==', 'pending')))).data().count) },
    { label: 'Đơn chờ xử lý', to: '#don-hang', icon: 'bag', q: async () => String((await getCount(query(collection(db, 'orders'), where('status', 'in', ['paid', 'processing'])))).data().count) },
    { label: 'Yêu cầu tư vấn mới', to: '#yeu-cau', icon: 'inbox', q: async () => String((await getCount(query(collection(db, 'requests'), where('status', '==', 'new')))).data().count) },
    { label: 'Yêu cầu đổi máy', to: '#key-may', icon: 'key', q: async () => String((await getCount(query(collection(db, 'keyRequests'), where('status', '==', 'new')))).data().count) },
    { label: 'Khách hàng', to: '#khach-hang', icon: 'users', q: async () => String((await getCount(collection(db, 'users'))).data().count) },
    { label: 'Tổng số dư khách đang giữ', to: '#khach-hang', icon: 'receipt', q: async () => money(Number((await getAggregate(collection(db, 'wallets'), { total: sum('balance') })).data().total ?? 0)) },
  ];
  const grid = h('div', { class: 'stats adm-stats' });
  root.replaceChildren(grid);
  for (const c of cards) {
    const value = h('strong', { class: 'stat-value', text: '…' });
    grid.append(
      h('a', { class: 'stat tone-violet', href: c.to, 'data-glow': true }, h('span', { class: 'stat-head' }, h('span', { class: 'icon-tile' }, icon(c.icon)), h('span', { class: 'stat-label', text: c.label })), value),
    );
    c.q().then(
      (v) => (value.textContent = v),
      (err) => {
        value.textContent = '!';
        value.title = errText(err);
      },
    );
  }
};

/* ======================== Nạp tiền ======================== */

let topupFilter = 'pending';
let topupSearch = '';

export const renderTopups = async (root: HTMLElement) => {
  const list = h('div', { class: 'adm-list' }, loading());
  const search = h('input', { type: 'search', class: 'adm-search', placeholder: 'Tìm mã ADSN…, email, tên', value: topupSearch, 'aria-label': 'Tìm lệnh nạp' });
  root.replaceChildren(
    h('p', { class: 'view-lead', text: 'Đối chiếu sao kê ngân hàng: đúng mã nội dung và đủ số tiền thì bấm Duyệt. Số dư khách được cộng ngay, kèm một dòng trong sổ giao dịch.' }),
    h(
      'div',
      { class: 'adm-toolbar' },
      chips(
        [
          ['pending', 'Chờ duyệt'],
          ['cancelled', 'Khách đã hủy'],
          ['approved', 'Đã duyệt'],
          ['rejected', 'Từ chối'],
          ['all', 'Tất cả'],
        ],
        topupFilter,
        (v) => {
          topupFilter = v;
          void renderTopups(root);
        },
      ),
      search,
    ),
    list,
  );
  let rows: (DocumentData & { id: string })[];
  try {
    await loadCustomers();
    const coll = collection(db, 'topups');
    rows = await docsOf(topupFilter === 'all' ? query(coll) : query(coll, where('status', '==', topupFilter)));
  } catch (err) {
    list.replaceChildren(failed(err, () => void renderTopups(root)));
    return;
  }
  const draw = () => {
    const q = topupSearch.trim().toLowerCase();
    const shown = rows.filter((t) => !q || [t.id, str(t, 'email'), str(t, 'name'), who(str(t, 'uid'))].join(' ').toLowerCase().includes(q));
    list.replaceChildren(...(shown.length ? shown.slice(0, 300).map((t) => topupItem(t, root)) : [empty('Không có lệnh nạp nào.')]));
  };
  search.addEventListener('input', () => {
    topupSearch = search.value;
    draw();
  });
  draw();
};

const topupItem = (t: DocumentData & { id: string }, root: HTMLElement) => {
  const status = str(t, 'status');
  const actions = h('div', { class: 'adm-actions' });
  if (status === 'pending' || status === 'cancelled') {
    const approve = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, icon('check'), status === 'cancelled' ? 'Duyệt (khách đã chuyển)' : 'Duyệt');
    approve.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: `Duyệt lệnh nạp ${t.id}?`,
        body: [
          h('p', {}, 'Xác nhận ĐÃ NHẬN ĐỦ ', h('strong', { text: money(num(t, 'amount')) }), ' với nội dung ', h('strong', { class: 'mono', text: t.id }), '.'),
          h('p', { class: 'small', text: `Khách: ${who(str(t, 'uid'), str(t, 'email'))}` }),
        ],
        confirm: 'Duyệt & cộng số dư',
        cancel: 'Quay lại',
      });
      if (!ok.ok) return;
      approve.disabled = true;
      try {
        const r = await ops.approveTopup(me(), t.id);
        toast(`Đã duyệt ${t.id}: số dư khách ${money(r.balanceAfter)}.`);
        void loadCustomers(true);
        void renderTopups(root);
      } catch (err) {
        toast(errText(err), 'error');
        approve.disabled = false;
      }
    });
    actions.append(approve);
  }
  if (status === 'pending') {
    const reject = h('button', { type: 'button', class: 'btn btn-sm btn-danger' }, icon('x'), 'Từ chối');
    reject.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: `Từ chối lệnh nạp ${t.id}?`,
        body: ['Khách sẽ thấy lý do bạn ghi dưới đây.'],
        confirm: 'Từ chối',
        cancel: 'Quay lại',
        danger: true,
        input: { label: 'Lý do (bắt buộc)', required: true, maxlength: 300, multiline: true, placeholder: 'Ví dụ: Chưa nhận được tiền với nội dung này.' },
      });
      if (!ok.ok) return;
      reject.disabled = true;
      try {
        await ops.rejectTopup(me(), t.id, ok.value);
        toast(`Đã từ chối ${t.id}.`);
        void renderTopups(root);
      } catch (err) {
        toast(errText(err), 'error');
        reject.disabled = false;
      }
    });
    actions.append(reject);
  }
  return h(
    'article',
    { class: 'adm-item', 'data-topup': t.id },
    h(
      'div',
      { class: 'adm-item-head' },
      h('div', { class: 'adm-code' }, h('strong', { class: 'mono', text: t.id }), copyButton(() => t.id, copyLabels, 'mã')),
      badge(status),
    ),
    h('p', { class: 'adm-amount', text: money(num(t, 'amount')) }),
    h(
      'dl',
      { class: 'adm-facts' },
      h('div', {}, h('dt', { text: 'Khách' }), h('dd', { text: who(str(t, 'uid'), str(t, 'email')) })),
      h('div', {}, h('dt', { text: 'Tạo lúc' }), h('dd', { text: when(t.createdAt) })),
      t.decidedAt ? h('div', {}, h('dt', { text: 'Xử lý lúc' }), h('dd', { text: when(t.decidedAt) })) : null,
      t.reason ? h('div', {}, h('dt', { text: 'Lý do' }), h('dd', { text: str(t, 'reason') })) : null,
    ),
    actions.childElementCount ? actions : null,
  );
};

/* ======================== Đơn hàng ======================== */

let orderFilter = 'open';

export const renderOrders = async (root: HTMLElement) => {
  const list = h('div', { class: 'adm-list' }, loading());
  root.replaceChildren(
    h('p', { class: 'view-lead', text: 'Đơn khách đã thanh toán bằng số dư. Đổi trạng thái để khách theo dõi tiến độ; Hoàn tiền trả lại đủ tổng đơn vào số dư (khóa học: thu hồi quyền học).' }),
    h(
      'div',
      { class: 'adm-toolbar' },
      chips(
        [
          ['open', 'Chờ xử lý'],
          ['done', 'Hoàn thành'],
          ['cancelled', 'Đã hủy'],
          ['refunded', 'Đã hoàn tiền'],
          ['all', 'Tất cả'],
        ],
        orderFilter,
        (v) => {
          orderFilter = v;
          void renderOrders(root);
        },
      ),
    ),
    list,
  );
  let rows: (DocumentData & { id: string })[];
  try {
    await loadCustomers();
    const coll = collection(db, 'orders');
    rows = await docsOf(
      orderFilter === 'all'
        ? query(coll)
        : orderFilter === 'open'
          ? query(coll, where('status', 'in', ['paid', 'processing']))
          : query(coll, where('status', '==', orderFilter)),
    );
  } catch (err) {
    list.replaceChildren(failed(err, () => void renderOrders(root)));
    return;
  }
  list.replaceChildren(...(rows.length ? rows.slice(0, 300).map((o) => orderItem(o, () => void renderOrders(root))) : [empty('Không có đơn nào.')]));
};

export const orderItem = (o: DocumentData & { id: string }, onChanged: () => void) => {
  const status = str(o, 'status');
  const facts = h(
    'dl',
    { class: 'adm-facts' },
    h('div', {}, h('dt', { text: 'Khách' }), h('dd', { text: who(str(o, 'uid'), str(o, 'email')) })),
    h('div', {}, h('dt', { text: 'Số lượng × đơn giá' }), h('dd', { text: `${num(o, 'qty')} × ${money(num(o, 'unitPrice'))}` })),
    h('div', {}, h('dt', { text: 'Đặt lúc' }), h('dd', { text: when(o.createdAt) })),
    h('div', {}, h('dt', { text: 'Mã đơn' }), h('dd', { class: 'mono', text: o.id })),
  );
  if (o.adAccountId) facts.append(h('div', {}, h('dt', { text: 'Tài khoản QC' }), h('dd', { class: 'mono', text: [str(o, 'adAccountId'), str(o, 'adAccountName')].filter(Boolean).join(' · ') })));
  if (o.note) facts.append(h('div', {}, h('dt', { text: 'Ghi chú khách' }), h('dd', { class: 'pre', text: str(o, 'note') })));
  if (o.adminNote) facts.append(h('div', {}, h('dt', { text: 'Ghi chú của bạn' }), h('dd', { class: 'pre', text: str(o, 'adminNote') })));

  const actions = h('div', { class: 'adm-actions' });
  if (status !== 'refunded') {
    const select = h(
      'select',
      { class: 'adm-select', 'aria-label': `Trạng thái đơn ${o.id}` },
      ...['paid', 'processing', 'done', 'cancelled'].map((s) => h('option', { value: s, text: statusLabel(s) })),
    );
    select.value = status;
    const note = h('input', { type: 'text', class: 'adm-input', placeholder: 'Ghi chú cho khách (không bắt buộc)', maxlength: 500, value: str(o, 'adminNote'), 'aria-label': 'Ghi chú cho khách' });
    const save = h('button', { type: 'button', class: 'btn btn-sm', text: 'Lưu trạng thái' });
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const patch: Record<string, unknown> = { status: select.value, updatedAt: serverTimestamp() };
        if (note.value.trim() !== str(o, 'adminNote')) patch.adminNote = note.value.trim();
        await updateDoc(doc(db, 'orders', o.id), patch);
        toast(`Đơn ${o.id.slice(0, 8)}: ${statusLabel(select.value)}.`);
        onChanged();
      } catch (err) {
        toast(errText(err), 'error');
        save.disabled = false;
      }
    });
    const refund = h('button', { type: 'button', class: 'btn btn-sm btn-danger' }, icon('refresh'), 'Hoàn tiền');
    refund.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: `Hoàn ${money(num(o, 'total'))} cho đơn này?`,
        body: [`${str(o, 'name')} — ${who(str(o, 'uid'), str(o, 'email'))}`, 'Số tiền được cộng lại vào số dư của khách và ghi vào sổ giao dịch. Không hoàn tác được.'],
        confirm: 'Hoàn tiền',
        cancel: 'Quay lại',
        danger: true,
        input: { label: 'Ghi chú cho khách (không bắt buộc)', maxlength: 300 },
      });
      if (!ok.ok) return;
      refund.disabled = true;
      try {
        const r = await ops.refundOrder(me(), o.id, ok.value || undefined);
        toast(`Đã hoàn tiền. Số dư khách: ${money(r.balanceAfter)}.`);
        void loadCustomers(true);
        onChanged();
      } catch (err) {
        toast(errText(err), 'error');
        refund.disabled = false;
      }
    });
    actions.append(select, note, save, refund);
  }
  return h(
    'article',
    { class: 'adm-item', 'data-order': o.id },
    h('div', { class: 'adm-item-head' }, h('strong', { class: 'adm-title', text: str(o, 'name') }), badge(status)),
    h('p', { class: 'adm-amount', text: money(num(o, 'total')) }),
    facts,
    actions.childElementCount ? actions : null,
  );
};

/* ======================== Yêu cầu dịch vụ ======================== */

let requestFilter = 'new';

export const renderRequests = async (root: HTMLElement) => {
  const list = h('div', { class: 'adm-list' }, loading());
  root.replaceChildren(
    h('p', { class: 'view-lead', text: 'Yêu cầu tư vấn khách gửi từ trang tài khoản. Đổi trạng thái: Mới → Đã liên hệ → Đang triển khai → Hoàn thành (hoặc Đã hủy).' }),
    h(
      'div',
      { class: 'adm-toolbar' },
      chips(
        [
          ['new', 'Mới'],
          ['contacted', 'Đã liên hệ'],
          ['in_progress', 'Đang triển khai'],
          ['done', 'Hoàn thành'],
          ['cancelled', 'Đã hủy'],
          ['all', 'Tất cả'],
        ],
        requestFilter,
        (v) => {
          requestFilter = v;
          void renderRequests(root);
        },
      ),
    ),
    list,
  );
  let rows: (DocumentData & { id: string })[];
  try {
    await loadCustomers();
    const coll = collection(db, 'requests');
    rows = await docsOf(requestFilter === 'all' ? query(coll) : query(coll, where('status', '==', requestFilter)));
  } catch (err) {
    list.replaceChildren(failed(err, () => void renderRequests(root)));
    return;
  }
  list.replaceChildren(
    ...(rows.length
      ? rows.slice(0, 300).map((r) => requestItem(r, () => void renderRequests(root)))
      : [empty('Không có yêu cầu nào.')]),
  );
};

export const requestItem = (r: DocumentData & { id: string }, onChanged: () => void) => {
  const select = h(
    'select',
    { class: 'adm-select', 'aria-label': 'Trạng thái yêu cầu' },
    ...['new', 'contacted', 'in_progress', 'done', 'cancelled'].map((s) => h('option', { value: s, text: statusLabel(s) })),
  );
  select.value = str(r, 'status');
  const save = h('button', { type: 'button', class: 'btn btn-sm', text: 'Lưu' });
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      await updateDoc(doc(db, 'requests', r.id), { status: select.value, updatedAt: serverTimestamp() });
      toast(`Yêu cầu: ${statusLabel(select.value)}.`);
      onChanged();
    } catch (err) {
      toast(errText(err), 'error');
      save.disabled = false;
    }
  });
  return h(
    'article',
    { class: 'adm-item' },
    h('div', { class: 'adm-item-head' }, h('strong', { class: 'adm-title', text: config.planNames[str(r, 'planId')] ?? str(r, 'planId') }), badge(str(r, 'status'))),
    h(
      'dl',
      { class: 'adm-facts' },
      h('div', {}, h('dt', { text: 'Khách' }), h('dd', { text: who(str(r, 'uid')) })),
      h('div', {}, h('dt', { text: 'Gửi lúc' }), h('dd', { text: when(r.createdAt) })),
      r.contact ? h('div', {}, h('dt', { text: 'Liên hệ' }), h('dd', { text: str(r, 'contact') })) : null,
      h('div', {}, h('dt', { text: 'Ngôn ngữ' }), h('dd', { text: str(r, 'lang') === 'en' ? 'Tiếng Anh' : 'Tiếng Việt' })),
    ),
    r.note ? h('p', { class: 'adm-note pre', text: str(r, 'note') }) : null,
    h('div', { class: 'adm-actions' }, select, save),
  );
};

/* ======================== Khách hàng ======================== */

let customerSearch = '';
const customerFilters = { balance: false, ads: false, new: false };

export const renderCustomers = async (root: HTMLElement, force = false) => {
  const list = h('div', { class: 'adm-list adm-rows' }, loading());
  const search = h('input', { type: 'search', class: 'adm-search', placeholder: 'Tìm theo email, tên, số điện thoại', value: customerSearch, 'aria-label': 'Tìm khách' });
  const filterBtn = (key: keyof typeof customerFilters, label: string) => {
    const b = h('button', { type: 'button', class: 'chip adm-filter', 'data-filter': key, 'aria-pressed': String(customerFilters[key]), text: label });
    b.addEventListener('click', () => {
      customerFilters[key] = !customerFilters[key];
      b.setAttribute('aria-pressed', String(customerFilters[key]));
      draw();
    });
    return b;
  };
  const count = h('p', { class: 'muted small', role: 'status' });
  root.replaceChildren(
    h('p', { class: 'view-lead', text: 'Khách đã đăng nhập trang tài khoản ít nhất một lần. Bấm một khách để xem dịch vụ đang dùng, cấp quyền, số dư, đơn hàng, tài khoản quảng cáo và yêu cầu.' }),
    h(
      'div',
      { class: 'adm-toolbar' },
      search,
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Lọc' }, filterBtn('balance', 'Có số dư'), filterBtn('ads', 'Có TKQC'), filterBtn('new', 'Mới 7 ngày')),
    ),
    count,
    list,
  );
  let all: Customer[];
  try {
    all = Array.from((await loadCustomers(force)).values()).sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    list.replaceChildren(failed(err, () => void renderCustomers(root, true)));
    return;
  }
  const draw = () => {
    const q = customerSearch.trim().toLowerCase();
    const weekAgo = Date.now() - 7 * 864e5;
    const shown = all.filter(
      (c) =>
        (!q || [c.email, c.name, c.phone, c.company, c.uid].join(' ').toLowerCase().includes(q)) &&
        (!customerFilters.balance || c.balance > 0) &&
        (!customerFilters.ads || c.adAccounts > 0) &&
        (!customerFilters.new || c.createdAt >= weekAgo),
    );
    count.textContent = shown.length === all.length ? `${all.length} khách` : `${shown.length} / ${all.length} khách`;
    list.replaceChildren(...(shown.length ? shown.slice(0, 200).map(customerRow) : [empty('Không tìm thấy khách nào.')]));
  };
  search.addEventListener('input', () => {
    customerSearch = search.value;
    draw();
  });
  draw();
};

const customerRow = (c: Customer) => {
  const services = [c.servicesCount ? `${c.servicesCount} dịch vụ` : '', c.adAccounts ? `${c.adAccounts} TKQC` : ''].filter(Boolean).join(' · ') || 'Chưa gán dịch vụ';
  return h(
    'a',
    { class: 'adm-row', href: `#khach-hang/${c.uid}` },
    avatarEl(c),
    h(
      'span',
      { class: 'adm-row-main' },
      h('strong', { class: 'adm-title', text: c.name || '(chưa có tên)' }),
      h('span', { class: 'muted small', text: [c.email, c.phone, c.company].filter(Boolean).join(' · ') || c.uid }),
    ),
    h('span', { class: 'adm-row-meta' }, h('span', { class: 'small', text: services }), h('span', { class: 'muted small', text: c.createdAt ? `Tạo ${when(new Date(c.createdAt)).slice(0, 10)}` : '' })),
    h('span', { class: 'adm-balance' }, h('span', { class: 'muted small', text: 'Số dư' }), h('strong', { text: money(c.balance) })),
    h('span', { class: 'adm-row-go', 'aria-hidden': 'true' }, icon('arrow')),
  );
};

/** Tab "Số dư & giao dịch" của trang Chi tiết khách: sổ giao dịch + điều chỉnh số dư bằng tay. */
export const balancePanel = async (c: Customer, onChanged: () => void): Promise<HTMLElement> => {
  const box = h('div', { class: 'adm-detail adm-detail--open' }, loading());
  let txs: (DocumentData & { id: string })[];
  try {
    txs = await docsOf(query(collection(db, 'transactions'), where('uid', '==', c.uid)));
  } catch (err) {
    box.replaceChildren(failed(err, () => void balancePanel(c, onChanged).then((el) => box.replaceWith(el))));
    return box;
  }
  const f = buildForm(
    [
      { name: 'amount', label: 'Số tiền điều chỉnh (VNĐ, số âm để trừ)', type: 'number', required: true, placeholder: 'Ví dụ 500000 hoặc -200000', inputmode: 'numeric' },
      { name: 'note', label: 'Ghi chú (bắt buộc, khách thấy được)', required: true, maxlength: 300, placeholder: 'Ví dụ: Khách chuyển dư 50.000đ cho lệnh ADSN…' },
    ],
    'Điều chỉnh số dư',
  );
  f.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    f.clearErrors();
    const amount = parseVnd(f.value('amount'));
    if (!Number.isInteger(amount) || amount === 0) f.setError('amount', 'Nhập số tiền khác 0, ví dụ 500000 hoặc -200000.');
    else if (c.balance + amount < 0) f.setError('amount', `Số dư hiện ${money(c.balance)}, không trừ quá số này.`);
    if (f.value('note').length < 3) f.setError('note', 'Ghi chú ít nhất 3 ký tự.');
    if (f.focusFirstError()) return;
    const ok = await confirmDialog({
      title: `${amount > 0 ? 'Cộng' : 'Trừ'} ${money(Math.abs(amount))}?`,
      body: [`Khách: ${c.name || c.email}`, `Số dư: ${money(c.balance)} → ${money(c.balance + amount)}`],
      confirm: 'Xác nhận',
      cancel: 'Quay lại',
    });
    if (!ok.ok) return;
    f.submit.disabled = true;
    try {
      const r = await ops.adjustBalance(me(), c.uid, amount, f.value('note'));
      c.balance = r.balanceAfter;
      toast(`Đã điều chỉnh. Số dư mới: ${money(r.balanceAfter)}.`);
      void loadCustomers(true).then(onChanged);
    } catch (err) {
      f.alert.replaceChildren(h('p', { text: errText(err) }));
      f.submit.disabled = false;
    }
  });
  const typeText: Record<string, string> = { topup: 'Nạp tiền', purchase: 'Thanh toán', refund: 'Hoàn tiền', adjust: 'Điều chỉnh' };
  box.replaceChildren(
    h('h3', { class: 'adm-sub', text: 'Điều chỉnh số dư bằng tay' }),
    f.form,
    h('h3', { class: 'adm-sub', text: 'Sổ giao dịch' }),
    txs.length
      ? h(
          'ul',
          { class: 'ledger' },
          ...txs.slice(0, 50).map((t) =>
            h(
              'li',
              { class: `ledger-item ledger-item--${num(t, 'amount') >= 0 ? 'in' : 'out'}` },
              h('span', { class: 'ledger-icon', 'aria-hidden': 'true' }, icon(num(t, 'amount') >= 0 ? 'plus' : 'minus')),
              h('span', { class: 'ledger-main' }, h('span', { class: 'ledger-type', text: typeText[str(t, 'type')] ?? str(t, 'type') }), h('span', { class: 'ledger-ref', text: [str(t, 'refId') || str(t, 'note'), when(t.createdAt)].filter(Boolean).join(' · ') })),
              h('span', { class: 'ledger-amounts' }, h('strong', { class: 'ledger-amount', text: `${num(t, 'amount') > 0 ? '+' : ''}${money(num(t, 'amount'))}` }), h('span', { class: 'ledger-after', text: `Số dư sau: ${money(num(t, 'balanceAfter'))}` })),
            ),
          ),
        )
      : empty('Chưa có giao dịch.'),
    h('p', { class: 'muted small', text: `UID: ${c.uid}` }),
  );
  return box;
};

/** Dùng chung với trang Chi tiết khách. */
export { docsOf, loading, empty, failed, chips };

export { customerByEmail };
