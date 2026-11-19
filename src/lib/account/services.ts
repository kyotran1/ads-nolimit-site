/**
 * Dịch vụ: ô chọn dịch vụ dạng thẻ (radio group, dùng được bằng bàn phím), khung đặt dịch vụ,
 * yêu cầu tư vấn (Firestore requests, như V3) và danh sách yêu cầu đã gửi.
 *
 * - Gói giá cố định: "Thanh toán bằng số dư" (giá thật lấy từ Firestore products/ trong lúc thanh toán)
 *   và "Gửi yêu cầu tư vấn".
 * - Gói báo giá theo nhu cầu: chỉ "Gửi yêu cầu tư vấn".
 * - "Nạp ngân sách quảng cáo": khách nhập số tiền + ID tài khoản quảng cáo, trừ vào số dư.
 */
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore/lite';
import { clearOnInput, fieldError, focusFirstInvalid, say, setBusy } from '../auth/client';
import { dataErrorMessage, formatDateTime, m, pageLang, statusLabel } from '../auth/messages';
import { AD_BUDGET_MIN } from '../ledger/ops';
import { groupDigits, parseAmount } from '../money';
import { byId, h, icon } from '../ui/dom';
import type { PickerCard, PickerProduct } from '../../data/catalog';
import { config, isVisible, lang, loadError, me, money, register } from './ctx';
import { balance, db, ensure, errors, isLoaded, on, reload, state } from './store';
import type { ServiceRequest } from './store';
import { payFromBalance } from './pay';
import { checkLength, profilePhone } from './profile';
import { tx } from './text';

const MAX_NOTE = 1000;
const MAX_TEXT = 120;
const AD_BUDGET_MAX = 500_000_000;

const allCards: PickerCard[] = config.picker.flatMap((g) => g.cards);
const picker = byId('svc-picker');
const cardEls = Array.from(picker.querySelectorAll<HTMLElement>('[data-card]'));
const detail = byId('svc-detail');
const detailTitle = byId('svc-detail-title');
const detailEmpty = byId('svc-detail-empty');
const detailBody = byId('svc-detail-body');

const requestForm = byId<HTMLFormElement>('request-form');
const rPlan = byId<HTMLInputElement>('r-plan');
const rNote = byId<HTMLTextAreaElement>('r-note');
const rNoteCount = byId('r-note-count');
const rNoteOptional = byId('r-note-optional');
const rContact = byId<HTMLInputElement>('r-contact');
const requestAlert = byId('request-alert');
const requestStatus = byId('request-status');

let selectedId = '';
const qty = new Map<string, number>();

/** Yêu cầu tư vấn dùng id gói trong firestore.rules (planIds); thẻ "Nạp ngân sách" → gói tài khoản Agency. */
const planIdFor = (cardId: string) => (cardId === 'ad-budget' ? 'agency-account' : cardId);

/* ---------- Ô chọn: radio group ---------- */

const setTabStops = () => {
  const active = cardEls.find((c) => c.dataset.card === selectedId) ?? cardEls[0];
  cardEls.forEach((c) => (c.tabIndex = c === active ? 0 : -1));
};

export const selectCard = (id: string, opts: { focus?: boolean; scroll?: boolean } = {}) => {
  const card = allCards.find((c) => c.id === id);
  if (!card) return;
  selectedId = id;
  cardEls.forEach((el) => {
    const on = el.dataset.card === id;
    el.setAttribute('aria-checked', String(on));
    el.classList.toggle('is-selected', on);
  });
  setTabStops();
  if (opts.focus) cardEls.find((c) => c.dataset.card === id)?.focus();
  renderDetail();
  // Điện thoại: khung đặt nằm dưới danh sách → cuộn tới
  if (opts.scroll && window.matchMedia('(max-width: 1099.98px)').matches) detail.scrollIntoView({ block: 'start', behavior: 'smooth' });
};

picker.addEventListener('click', (event) => {
  const el = (event.target as HTMLElement).closest<HTMLElement>('[data-card]');
  if (el?.dataset.card) selectCard(el.dataset.card, { scroll: true });
});

picker.addEventListener('keydown', (event) => {
  const el = (event.target as HTMLElement).closest<HTMLElement>('[data-card]');
  if (!el) return;
  const i = cardEls.indexOf(el);
  let next = -1;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (i + 1) % cardEls.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (i - 1 + cardEls.length) % cardEls.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = cardEls.length - 1;
  else if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    selectCard(el.dataset.card ?? '', { scroll: event.key === 'Enter' });
    return;
  }
  if (next < 0) return;
  event.preventDefault();
  selectCard(cardEls[next].dataset.card ?? '', { focus: true });
});

/* ---------- Khung đặt dịch vụ ---------- */

/** Giá thật trong Firestore (products/) nếu đã tải; null = chưa mở bán bằng số dư. */
const livePrice = (p: PickerProduct): number | null => {
  if (!isLoaded('products')) return p.price;
  const doc = state.products.get(p.id);
  if (!doc || !doc.active || doc.pricing !== 'fixed' || doc.price <= 0) return null;
  return doc.price;
};

const stepper = (p: PickerProduct, onChange: () => void) => {
  const value = h('output', { class: 'stepper-value', 'aria-live': 'polite', text: String(qty.get(p.id) ?? 1) });
  const set = (n: number) => {
    const v = Math.min(Math.max(n, 1), p.maxQty);
    qty.set(p.id, v);
    value.textContent = String(v);
    minus.disabled = v <= 1;
    plus.disabled = v >= p.maxQty;
    onChange();
  };
  const minus = h('button', { type: 'button', class: 'stepper-btn', 'aria-label': tx('decrease') }, icon('minus'));
  const plus = h('button', { type: 'button', class: 'stepper-btn', 'aria-label': tx('increase') }, icon('plus'));
  minus.addEventListener('click', () => set((qty.get(p.id) ?? 1) - 1));
  plus.addEventListener('click', () => set((qty.get(p.id) ?? 1) + 1));
  const wrap = h(
    'div',
    { class: 'stepper', role: 'group', 'aria-label': `${tx('qty')} (${p.qtyUnit ?? ''})` },
    minus,
    value,
    plus,
    p.qtyUnit ? h('span', { class: 'stepper-unit', text: p.qtyUnit }) : null,
  );
  queueMicrotask(() => set(qty.get(p.id) ?? 1));
  return wrap;
};

const buyItem = (p: PickerProduct) => {
  const price = livePrice(p);
  const totalEl = h('strong', { class: 'buy-total-value' });
  const hint = h('p', { class: 'buy-hint' });
  const pay = h('button', { type: 'button', class: 'btn btn-primary btn-block' }, icon('wallet'), tx('payWithBalance'));
  const update = () => {
    const n = qty.get(p.id) ?? 1;
    if (price === null) {
      totalEl.textContent = '—';
      hint.textContent = tx('unavailable');
      pay.disabled = true;
      return;
    }
    const total = price * n;
    totalEl.textContent = money(total);
    pay.disabled = false;
    if (state.wallet && balance() < total) hint.textContent = tx('insufficient', { short: money(total - balance()) });
    else hint.textContent = '';
  };
  pay.addEventListener('click', async () => {
    if (price === null) return;
    const n = qty.get(p.id) ?? 1;
    pay.disabled = true;
    await payFromBalance({
      kind: 'product',
      productId: p.id,
      name: p.name,
      qty: n,
      total: price * n,
      lines: n > 1 ? [[tx('qty'), `${n} ${p.qtyUnit ?? ''}`.trim()], [tx('orderUnit'), money(price)]] : [],
    });
    update();
  });
  const head = h(
    'div',
    { class: 'buy-head' },
    h('span', { class: 'buy-label', text: p.label }),
    h('span', { class: 'buy-price' }, h('strong', { text: p.display }), p.per ? h('span', { text: p.per }) : null),
  );
  const body: (Node | null)[] = [head];
  if (lang === 'en' && price !== null) body.push(h('p', { class: 'buy-vnd', text: tx('deducted', { amount: money(price) }) }));
  if (p.maxQty > 1) body.push(h('div', { class: 'buy-qty' }, h('span', { text: tx('qty') }), stepper(p, update)));
  body.push(h('div', { class: 'buy-total' }, h('span', { text: tx('total') }), totalEl), hint, pay);
  update();
  return h('div', { class: 'buy-item' }, ...body);
};

const budgetForm = () => {
  const product = isLoaded('products') ? state.products.get('ad-budget') : undefined;
  const min = product?.active ? product.minAmount : AD_BUDGET_MIN;
  const max = product?.active ? product.maxAmount : AD_BUDGET_MAX;
  const unavailable = isLoaded('products') && !product?.active;

  const amount = h('input', { id: 'bd-amount', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: groupDigits(2_000_000, lang), 'aria-describedby': 'bd-amount-hint bd-amount-error' });
  const account = h('input', { id: 'bd-account', type: 'text', maxlength: 64, autocomplete: 'off', placeholder: 'act_123456789', 'aria-describedby': 'bd-account-error', spellcheck: 'false' });
  const name = h('input', { id: 'bd-name', type: 'text', maxlength: 120, autocomplete: 'off' });
  const note = h('textarea', { id: 'bd-note', rows: 2, maxlength: 500 });
  const totalEl = h('strong', { class: 'buy-total-value', text: '—' });
  amount.addEventListener('input', () => {
    const digits = amount.value.replace(/\D/g, '').slice(0, 12);
    amount.value = digits ? groupDigits(Number(digits), lang) : '';
    const v = parseAmount(amount.value);
    totalEl.textContent = Number.isFinite(v) ? money(v) : '—';
    fieldError(amount);
  });
  account.addEventListener('input', () => fieldError(account));
  const pay = h('button', { type: 'submit', class: 'btn btn-primary btn-block', disabled: unavailable }, icon('wallet'), tx('payWithBalance'));
  const form = h(
    'form',
    { class: 'acc-form budget-form', novalidate: true },
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'bd-amount', text: tx('budgetAmount') }),
      h('div', { class: 'money-input' }, amount, h('span', { 'aria-hidden': 'true', text: lang === 'en' ? 'VND' : 'đ' })),
      h('p', { class: 'field-hint', id: 'bd-amount-hint', text: `${tx('amountMin', { min: money(min) })}` }),
      h('p', { class: 'field-error', id: 'bd-amount-error' }),
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'bd-account', text: tx('adAccountId') }),
      account,
      h('p', { class: 'field-error', id: 'bd-account-error' }),
    ),
    h('div', { class: 'field' }, h('label', { for: 'bd-name' }, tx('adAccountName'), ' ', h('span', { class: 'optional', text: tx('optional') })), name),
    h('div', { class: 'field' }, h('label', { for: 'bd-note' }, tx('budgetNote'), ' ', h('span', { class: 'optional', text: tx('optional') })), note),
    h('div', { class: 'buy-total' }, h('span', { text: tx('total') }), totalEl),
    unavailable ? h('p', { class: 'buy-hint', text: tx('unavailable') }) : null,
    pay,
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const v = parseAmount(amount.value);
    fieldError(
      amount,
      !amount.value.trim()
        ? tx('amountRequired')
        : !Number.isFinite(v)
          ? tx('amountInvalid')
          : v < min
            ? tx('amountMin', { min: money(min) })
            : v > max
              ? tx('amountMax', { max: money(max) })
              : v % 1000 !== 0
                ? tx('amountThousand')
                : '',
    );
    account.value = account.value.trim();
    fieldError(account, account.value.length < 3 ? tx('adAccountRequired') : '');
    if (focusFirstInvalid(form)) return;
    pay.disabled = true;
    await payFromBalance({
      kind: 'product',
      productId: 'ad-budget',
      name: allCards.find((c) => c.id === 'ad-budget')?.name ?? 'Ad budget',
      amount: v,
      total: v,
      adAccountId: account.value,
      adAccountName: name.value.trim(),
      note: note.value.trim(),
      lines: [[tx('adAccountId'), account.value]],
    });
    pay.disabled = unavailable;
  });
  return form;
};

const consultToggle = () => {
  const btn = h('button', { type: 'button', class: 'btn btn-block' }, icon('mail'), tx('requestConsult'));
  btn.addEventListener('click', () => {
    requestForm.hidden = false;
    btn.hidden = true;
    rNote.focus();
  });
  return btn;
};

const renderDetail = () => {
  const card = allCards.find((c) => c.id === selectedId);
  detailEmpty.hidden = Boolean(card);
  if (!card) {
    detailTitle.textContent = '';
    detailBody.replaceChildren();
    requestForm.hidden = true;
    return;
  }
  detailTitle.textContent = card.name;
  rPlan.value = planIdFor(card.id);
  rNoteOptional.hidden = card.mode === 'other';
  say(requestAlert, '');
  say(requestStatus, '');

  const parts: (Node | null)[] = [
    h('p', { class: 'svc-summary', text: card.summary }),
    h('p', { class: 'svc-price' }, h('span', { text: `${tx('priceGuide')}: ` }), h('strong', { text: card.priceLine })),
  ];
  if (card.features.length) parts.push(h('ul', { class: 'checklist svc-features' }, ...card.features.slice(0, 5).map((f) => h('li', { text: f }))));
  if (card.href) parts.push(h('a', { class: 'text-link svc-more', href: card.href }, tx('seeDetails'), icon('arrow')));

  if (card.mode === 'buy') {
    parts.push(h('div', { class: 'buy-list' }, ...card.products.map((p) => buyItem(p))));
    parts.push(h('p', { class: 'svc-or', text: tx('orConsult') }), consultToggle());
    requestForm.hidden = true;
  } else if (card.mode === 'budget') {
    parts.push(budgetForm());
    requestForm.hidden = true;
  } else {
    parts.push(h('p', { class: 'svc-quote' }, icon('info'), h('span', { text: tx('quoteOnly') })));
    requestForm.hidden = false;
  }
  detailBody.replaceChildren(...parts.filter((p): p is Node => p !== null));
};

/* ---------- Yêu cầu tư vấn (requests) ---------- */

const updateNoteCount = () => {
  rNoteCount.textContent = `${rNote.value.length}/${MAX_NOTE}`;
};
rNote.addEventListener('input', updateNoteCount);
clearOnInput(requestForm);

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const user = me();
  if (!user) return;
  const submit = requestForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  say(requestAlert, '');
  say(requestStatus, '');

  if (!rPlan.value) {
    say(requestAlert, m('planRequired'));
    return;
  }
  checkLength(rNote, MAX_NOTE);
  if (!rNote.value && rPlan.value === 'other') fieldError(rNote, m('noteRequiredOther'));
  checkLength(rContact, MAX_TEXT);
  updateNoteCount();
  if (focusFirstInvalid(requestForm)) return;

  const data: Record<string, unknown> = {
    uid: user.uid,
    planId: rPlan.value,
    note: rNote.value,
    lang: pageLang(),
    status: 'new',
    createdAt: serverTimestamp(),
  };
  if (rContact.value) data.contact = rContact.value;

  setBusy(submit, true, 'busySend');
  try {
    await addDoc(collection(db, 'requests'), data);
    rNote.value = '';
    updateNoteCount();
    say(requestStatus, m('requestSent'));
    void reload('requests');
  } catch (err) {
    say(requestAlert, dataErrorMessage(err));
  } finally {
    setBusy(submit, false);
  }
});

/* ---------- Yêu cầu đã gửi (như V3) ---------- */

const reqList = byId<HTMLUListElement>('req-list');
const reqEmpty = byId('req-empty');
const requestsAlert = byId('requests-alert');
const requestsStatus = byId('requests-status');

const planName = (id: string) => allCards.find((c) => c.id === id)?.name ?? id;

const renderRequest = (item: ServiceRequest): HTMLLIElement => {
  const li = h('li', { class: 'req', tabindex: -1, 'data-id': item.id });
  li.append(h('div', { class: 'req-top' }, h('span', { class: 'req-plan', text: planName(item.planId) }), h('span', { class: `badge badge--${item.status}`, text: statusLabel(item.status) })));
  if (item.createdAt) li.append(h('p', { class: 'req-meta', text: m('sentAt', { date: formatDateTime(item.createdAt) }) }));
  if (item.note) li.append(h('p', { class: 'req-note', text: item.note }));
  if (item.contact) li.append(h('p', { class: 'req-meta', text: `${m('contactLabel')}: ${item.contact}` }));
  if (item.status === 'new') li.append(cancelControls(item, li));
  return li;
};

/** Nút "Hủy yêu cầu" → hỏi lại "Hủy yêu cầu này? [Có, hủy] [Không]" ngay trong thẻ. */
const cancelControls = (item: ServiceRequest, li: HTMLLIElement): HTMLDivElement => {
  const box = h('div', { class: 'req-actions' });
  const showStart = (focus = false) => {
    const start = h('button', { type: 'button', class: 'btn btn-sm btn-danger', text: m('cancelRequest') });
    start.addEventListener('click', showConfirm);
    box.replaceChildren(start);
    if (focus) start.focus();
  };
  const showConfirm = () => {
    const yes = h('button', { type: 'button', class: 'btn btn-sm btn-danger', text: m('cancelYes') });
    const no = h('button', { type: 'button', class: 'btn btn-sm btn-ghost', text: m('cancelNo') });
    no.addEventListener('click', () => showStart(true));
    yes.addEventListener('click', async () => {
      say(requestsAlert, '');
      say(requestsStatus, '');
      setBusy(yes, true, 'busyCancel');
      no.disabled = true;
      try {
        await updateDoc(doc(db, 'requests', item.id), { status: 'cancelled' });
        item.status = 'cancelled';
        const updated = renderRequest(item);
        li.replaceWith(updated);
        updated.focus();
        say(requestsStatus, m('requestCancelled'));
      } catch (err) {
        say(requestsAlert, dataErrorMessage(err));
        showStart(true);
      }
    });
    box.replaceChildren(h('p', { text: m('cancelConfirm') }), yes, no);
    yes.focus();
  };
  showStart();
  return box;
};

const renderRequests = () => {
  const err = errors.get('requests');
  if (err) {
    loadError(requestsAlert, err, () => void reload('requests'));
    return;
  }
  if (!isLoaded('requests')) return;
  reqList.replaceChildren(...state.requests.map(renderRequest));
  reqEmpty.textContent = m('noRequests');
  reqEmpty.hidden = state.requests.length > 0;
};

on(['requests'], () => {
  if (isVisible('services')) renderRequests();
});
on(['products', 'wallet'], () => {
  if (isVisible('services') && selectedId) renderDetail();
});

register('services', {
  enter() {
    setTabStops();
    renderDetail();
    renderRequests();
    if (!rContact.value) rContact.value = profilePhone() || (me()?.email ?? '');
    void ensure('products', 'wallet', 'requests').then(() => {
      if (isVisible('services')) {
        renderDetail();
        renderRequests();
      }
    });
  },
});

updateNoteCount();
