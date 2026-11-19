/** Đơn hàng: lọc theo trạng thái, danh sách, khung chi tiết (dialog trượt từ phải). */
import { byId, h, icon } from '../ui/dom';
import { badge, config, isVisible, loadError, money, register, shortId, when } from './ctx';
import { errors, ensure, isLoaded, on, reload, state } from './store';
import type { Order } from './store';
import { tx } from './text';

const list = byId<HTMLUListElement>('orders-list');
const empty = byId('orders-empty');
const filteredEmpty = byId('orders-filtered-empty');
const alert = byId('orders-alert');
const filterBar = byId('orders-filter');
const drawer = byId<HTMLDialogElement>('order-drawer');
const drawerTitle = byId('order-drawer-title');
const drawerBody = byId('order-drawer-body');

let filter = 'all';
/** Đơn vừa tạo (tô sáng trong danh sách). */
let highlight = '';
export const highlightOrder = (id: string) => {
  highlight = id;
};

filterBar.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-filter]');
  if (!button) return;
  filter = button.dataset.filter ?? 'all';
  filterBar.querySelectorAll('button[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
  render();
});

/** Tên theo ngôn ngữ trang (đơn lưu tên lúc đặt; dịch vụ / khóa học có bản dịch thì dùng bản dịch). */
const productNames = new Map<string, string>();
config.picker.forEach((g) =>
  g.cards.forEach((c) => {
    c.products.forEach((p) => productNames.set(p.id, p.name));
    if (c.mode === 'budget') productNames.set('ad-budget', c.name);
  }),
);
const nameOf = (o: Order) => {
  if (o.type === 'course') {
    const c = state.courses.find((x) => x.id === o.productId);
    if (c) return (document.documentElement.lang === 'en' && c.titleEn) || c.title;
  }
  return productNames.get(o.productId) ?? o.name;
};

const typeIcon = (o: Order) => icon(o.type === 'course' ? 'book' : o.type === 'ad_budget' ? 'ads' : o.type === 'key' ? 'key' : 'bag');

const row = (o: Order) => {
  const button = h('button', { type: 'button', class: 'row-btn', 'aria-haspopup': 'dialog' });
  button.append(
    h('span', { class: 'row-icon', 'aria-hidden': 'true' }, typeIcon(o)),
    h(
      'span',
      { class: 'row-main' },
      h('span', { class: 'row-title', text: nameOf(o) }),
      h('span', { class: 'row-sub', text: `#${shortId(o.id)} · ${when(o.createdAt)}${o.qty > 1 ? ` · ×${o.qty}` : ''}` }),
    ),
    h('span', { class: 'row-end' }, h('strong', { class: 'row-amount', text: money(o.total) }), badge('order', o.status)),
  );
  button.addEventListener('click', () => openDrawer(o));
  return h('li', { class: o.id === highlight ? 'is-new' : undefined }, button);
};

const fact = (label: string, value: Node | string) => h('div', {}, h('dt', { text: label }), h('dd', {}, value));

const openDrawer = (o: Order) => {
  drawerTitle.textContent = tx('orderDetails');
  const facts = h(
    'dl',
    { class: 'facts' },
    fact(tx('orderCode'), h('span', { class: 'mono', text: o.id })),
    fact(tx('orderProduct'), nameOf(o)),
    fact(tx('orderStatus'), badge('order', o.status)),
    fact(tx('orderQty'), String(o.qty)),
    fact(tx('orderUnit'), money(o.unitPrice)),
    fact(tx('orderTotal'), h('strong', { text: money(o.total) })),
    fact(tx('orderCreated'), when(o.createdAt)),
    fact(tx('orderUpdated'), when(o.updatedAt)),
  );
  if (o.adAccountId)
    facts.append(fact(tx('orderAdAccount'), [o.adAccountId, o.adAccountName].filter(Boolean).join(' · ')));
  if (o.note) facts.append(fact(tx('orderNote'), h('span', { class: 'pre', text: o.note })));
  if (o.adminNote) facts.append(fact(tx('orderAdminNote'), h('span', { class: 'pre', text: o.adminNote })));
  const children: Node[] = [
    h('div', { class: 'drawer-hero' }, h('span', { class: 'drawer-hero-icon', 'aria-hidden': 'true' }, typeIcon(o)), h('div', {}, h('p', { class: 'drawer-hero-name', text: nameOf(o) }), h('p', { class: 'drawer-hero-total', text: money(o.total) }), h('p', { class: 'muted small', text: tx('orderPaidVia') }))),
    facts,
  ];
  if (o.status === 'refunded')
    children.push(h('p', { class: 'auth-alert', 'data-kind': 'success', text: tx('orderRefunded', { amount: money(o.total), date: when(o.refundedAt) }) }));
  children.push(h('p', { class: 'muted small', text: tx('orderHelp') }));
  drawerBody.replaceChildren(...children);
  drawer.showModal();
  byId('order-drawer-close').focus();
};

byId('order-drawer-close').addEventListener('click', () => drawer.close());
drawer.addEventListener('click', (event) => {
  // bấm ra ngoài khung (vùng nền mờ) thì đóng
  if (event.target === drawer) drawer.close();
});

const render = () => {
  const err = errors.get('orders');
  if (err) {
    loadError(alert, err, () => void reload('orders'));
    return;
  }
  alert.replaceChildren();
  if (!isLoaded('orders')) return;

  const counts: Record<string, number> = { all: state.orders.length };
  state.orders.forEach((o) => (counts[o.status] = (counts[o.status] ?? 0) + 1));
  filterBar.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const n = counts[el.dataset.count ?? ''] ?? 0;
    el.textContent = n ? String(n) : '';
  });

  const items = filter === 'all' ? state.orders : state.orders.filter((o) => o.status === filter);
  empty.hidden = state.orders.length > 0;
  filterBar.hidden = state.orders.length === 0;
  filteredEmpty.hidden = !(state.orders.length > 0 && items.length === 0);
  filteredEmpty.textContent = tx('orderEmptyFiltered');
  list.replaceChildren(...items.map(row));
};

on(['orders', 'courses'], () => {
  if (isVisible('orders')) render();
});

register('orders', {
  enter() {
    render();
    if (isLoaded('orders')) void reload('orders');
    else void ensure('orders');
  },
});
