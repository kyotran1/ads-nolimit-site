/**
 * Tổng quan: lời chào, 4 ô số liệu (số dư, đơn hàng, key & máy, khóa học), lệnh nạp đang chờ, giao dịch gần đây.
 * Cũng dùng chung hàm vẽ một dòng sổ giao dịch (ledgerItem) cho mục Nạp tiền.
 */
import { h, icon, byId } from '../ui/dom';
import { nameOf } from '../auth/user-cache';
import { errors, ensure, isLoaded, on, reload, state } from './store';
import type { Tx } from './store';
import { isVisible, loadError, me, money, register, shortId, signed, when } from './ctx';
import { tx, txMaybe } from './text';

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
  if (isLoaded('keys')) {
    const keys = state.keys.filter((k) => k.status === 'active');
    const used = keys.reduce((sum, k) => sum + k.machines.length, 0);
    const max = keys.reduce((sum, k) => sum + k.maxMachines, 0);
    setStat('keys', String(keys.length), keys.length ? tx('statKeysMachines', { used, max }) : tx('statKeysNone'));
  }
  if (isLoaded('access')) {
    const total = isLoaded('courses') ? state.courses.length : 0;
    setStat('courses', String(state.access.size), total ? tx('statCoursesOf', { n: total }) : tx('statCoursesNone'));
  }

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

on(['wallet', 'orders', 'keys', 'access', 'courses', 'topups', 'transactions'], () => {
  if (isVisible('overview')) render();
});

register('overview', {
  enter() {
    render();
    void ensure('wallet', 'orders', 'keys', 'access', 'courses', 'topups', 'transactions');
  },
});
