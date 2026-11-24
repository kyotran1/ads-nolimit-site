/**
 * Tổng quan (V4.2): lời chào + ảnh, 3 ô số liệu (số dư, đơn hàng, tài khoản quảng cáo), thẻ dịch vụ đang dùng
 * (gộp dịch vụ chủ gán + đơn đã trả + TKQC + khóa học + key qua mergeServices), lệnh nạp đang chờ, 5 giao dịch gần đây.
 * Cũng dùng chung hàm vẽ một dòng sổ giao dịch (ledgerItem) cho mục Nạp tiền.
 */
import { h, icon, byId } from '../ui/dom';
import { nameOf } from '../auth/user-cache';
import { autoFacts, errors, ensure, isLoaded, on, reload, state } from './store';
import type { Tx } from './store';
import { go, isVisible, lang, loadError, me, money, register, shortId, signed, when } from './ctx';
import { tx, txMaybe } from './text';
import { mergeServices, statusName } from '../customer/services';
import type { ServiceCard } from '../customer/services';
import { dmy } from '../ads/report';

const txIcon: Record<string, Parameters<typeof icon>[0]> = {
  topup: 'plus',
  purchase: 'bag',
  refund: 'refresh',
  adjust: 'settings',
};

/** Một dòng sổ giao dịch: loại, mô tả, số tiền +/−, số dư sau, thời gian. */
export const ledgerItem = (t: Tx) => {
  const ref =
    t.refType === 'order' && t.refId
      ? tx('refOrder', { id: shortId(t.refId) })
      : t.refType === 'topup' && t.refId
        ? tx('refTopup', { code: t.refId })
        : t.note;
  return h(
    'li',
    { class: `ledger-item ledger-item--${t.amount >= 0 ? 'in' : 'out'}` },
    h('span', { class: 'ledger-icon', 'aria-hidden': 'true' }, icon(txIcon[t.type] ?? 'receipt')),
    h(
      'span',
      { class: 'ledger-main' },
      h('span', { class: 'ledger-type', text: txMaybe(`tx.${t.type}`, t.type) }),
      h('span', { class: 'ledger-ref', text: [ref, when(t.createdAt)].filter(Boolean).join(' · ') }),
    ),
    h(
      'span',
      { class: 'ledger-amounts' },
      h('strong', { class: 'ledger-amount', text: signed(t.amount) }),
      h('span', { class: 'ledger-after', text: tx('balanceAfter', { amount: money(t.balanceAfter) }) }),
    ),
  );
};

export const renderHello = () => {
  const user = me();
  if (user) byId('ov-hello').textContent = tx('hello', { name: nameOf(user) });
  // Ảnh đại diện: tái dùng nội dung đã vẽ ở menu trái (#acc-avatar), không tự xử lý ảnh ở đây
  const src = document.getElementById('acc-avatar');
  const dst = document.getElementById('ov-avatar');
  if (src && dst) dst.replaceChildren(...Array.from(src.childNodes).map((n) => n.cloneNode(true)));
};

/* ---------- Thẻ dịch vụ đang dùng ---------- */

const sourceText = (c: ServiceCard) =>
  c.source === 'manual' ? '' : tx('svcSource', { what: tx(c.source === 'order' ? 'svcSrcOrder' : c.source === 'ad' ? 'svcSrcAd' : c.source === 'course' ? 'svcSrcCourse' : 'svcSrcKey') });

const serviceCard = (c: ServiceCard) =>
  h(
    'article',
    { class: `ov-service is-${c.status}`, 'data-service': c.id },
    h(
      'div',
      { class: 'ov-service-head' },
      h('h3', { text: c.label }),
      h('span', { class: `badge badge--${c.status === 'active' ? 'active' : c.status === 'paused' ? 'pending' : 'revoked'}`, text: statusName(c.status, lang) }),
    ),
    h('p', { class: 'ov-service-meta', text: [c.since ? tx('svcSince', { date: dmy(c.since) }) : '', c.extra, sourceText(c)].filter(Boolean).join(' · ') }),
    c.goto ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => go(c.goto!) }, tx('svcOpen'), icon('arrow')) : null,
  );

const renderServices = () => {
  const box = byId('ov-services');
  // Chờ các nguồn chính (customerServices + đơn + TKQC) rồi mới vẽ, để không nháy "trống" rồi mới có thẻ
  if (!isLoaded('customerServices') || !isLoaded('orders') || !isLoaded('adAccounts')) return;
  const cards = mergeServices(state.customerServices, autoFacts(), lang);
  if (!cards.length) {
    box.replaceChildren(
      h(
        'div',
        { class: 'ov-services-empty' },
        h('span', { class: 'icon-tile', 'aria-hidden': 'true' }, icon('spark')),
        h('div', {}, h('h3', { text: tx('svcEmptyTitle') }), h('p', { class: 'muted', text: tx('svcEmptyText') })),
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => go('services') }, tx('svcEmptyCta'), icon('arrow')),
      ),
    );
    return;
  }
  box.replaceChildren(...cards.map(serviceCard));
};

const setStat = (id: string, value: string, sub: string) => {
  byId(`ov-${id}`).textContent = value;
  byId(`ov-${id}-sub`).textContent = sub;
};

const render = () => {
  renderHello();
  // Số dư (mọi chỗ có data-bind="balance" do main.ts cập nhật)
  if (state.wallet) byId('ov-balance-sub').textContent = tx('statTopUp');

  if (isLoaded('orders')) {
    const active = state.orders.filter((o) => o.status === 'paid' || o.status === 'processing').length;
    setStat(
      'orders',
      String(state.orders.length),
      state.orders.length === 0 ? tx('statOrdersNone') : active ? tx('statOrdersActive', { n: active }) : tx('statOrdersAllDone'),
    );
  }
  if (isLoaded('adAccounts')) {
    const accs = state.adAccounts;
    const low = accs.filter((a) => a.latest?.low).length;
    const total = accs.reduce((sum, a) => sum + (a.latest?.balance ?? 0), 0);
    setStat('ads', String(accs.length), !accs.length ? tx('statAdsNone') : low ? tx('statAdsLow', { n: low }) : tx('statAdsBalance', { amount: money(total) }));
  }
  renderServices();

  const pending = state.topups.filter((t) => t.status === 'pending');
  const box = byId('ov-pending');
  box.hidden = pending.length === 0;
  if (pending.length) {
    byId('ov-pending-text').textContent = tx('pendingTopups', { n: pending.length });
    byId('ov-pending-link').textContent = tx('pendingTopupsLink');
  }

  const list = byId('ov-tx');
  const alert = byId('ov-tx-alert');
  const err = errors.get('transactions');
  if (err) {
    loadError(alert, err, () => void reload('transactions'));
    return;
  }
  alert.replaceChildren();
  if (!isLoaded('transactions')) return;
  const recent = state.transactions.slice(0, 5);
  list.replaceChildren(...(recent.length ? recent.map(ledgerItem) : [h('li', { class: 'ledger-empty', text: tx('noTransactions') })]));
};

on(['wallet', 'orders', 'keys', 'access', 'adAccounts', 'customerServices', 'topups', 'transactions'], () => {
  if (isVisible('overview')) render();
});

register('overview', {
  enter() {
    render();
    void ensure('wallet', 'orders', 'keys', 'access', 'adAccounts', 'customerServices', 'topups', 'transactions');
  },
});
