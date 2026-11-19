/**
 * Nạp tiền & Số dư.
 * - Tạo lệnh nạp "chờ chuyển khoản" (topups/{mã}), mã nội dung ADSN + 6 ký tự (src/lib/ledger/ops.ts).
 * - Hiện mã VietQR tạo NGAY trên trình duyệt (src/lib/vietqr.ts + thư viện qrcode), kèm nút chép từng thông tin.
 * - Thông tin nhận tiền lấy từ settings/payment (chỉ chủ điền ở /quan-tri/); chưa có thì không tạo QR.
 * - Lịch sử lệnh nạp, sổ giao dịch.
 */
import QRCode from 'qrcode';
import { clearOnInput, fieldError, say, setBusy } from '../auth/client';
import { dataErrorMessage, m } from '../auth/messages';
import { TOPUP_MAX, TOPUP_MIN } from '../ledger/ops';
import { groupDigits, parseAmount, roundUp } from '../money';
import { buildVietQr } from '../vietqr';
import { byId, confirmDialog, copyButton, h, icon, toast } from '../ui/dom';
import { badge, config, isVisible, lang, loadError, me, money, register, when } from './ctx';
import { errors, ensure, isLoaded, on, ops, reload, state } from './store';
import type { Topup } from './store';
import { ledgerItem } from './overview';
import { tx } from './text';
import { nameOf } from '../auth/user-cache';

const form = byId<HTMLFormElement>('tp-form');
const custom = byId<HTMLInputElement>('tp-custom');
const presets = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="tp-preset"]'));
const sum = byId('tp-sum');
const alertBox = byId('tp-alert');
const createButton = byId<HTMLButtonElement>('tp-create');
const payHow = byId('pay-how');
const payBody = byId('pay-body');

/** Lệnh nạp đang hiện trong khung thanh toán. */
let selected = '';

/* ---------- Chọn số tiền ---------- */

const currentAmount = (): number => {
  const preset = presets.find((p) => p.checked);
  if (preset) return Number(preset.value);
  return custom.value.trim() ? parseAmount(custom.value) : Number.NaN;
};

const updateSum = () => {
  const amount = currentAmount();
  sum.textContent = Number.isFinite(amount) && amount > 0 ? money(amount) : '—';
};

presets.forEach((p) =>
  p.addEventListener('change', () => {
    custom.value = '';
    fieldError(custom);
    updateSum();
  }),
);

custom.addEventListener('input', () => {
  presets.forEach((p) => (p.checked = false));
  // Tự thêm dấu phân cách nghìn khi gõ (giữ vị trí con trỏ ở cuối cho đơn giản)
  const digits = custom.value.replace(/\D/g, '').slice(0, 12);
  custom.value = digits ? groupDigits(Number(digits), lang) : '';
  updateSum();
});

/** Kiểm tra số tiền; trả về số tiền hợp lệ hoặc null (đã báo lỗi dưới ô). */
const validAmount = (): number | null => {
  const amount = currentAmount();
  let error = '';
  if (!presets.some((p) => p.checked) && !custom.value.trim()) error = tx('amountRequired');
  else if (!Number.isFinite(amount)) error = tx('amountInvalid');
  else if (amount < TOPUP_MIN) error = tx('amountMin', { min: money(TOPUP_MIN) });
  else if (amount > TOPUP_MAX) error = tx('amountMax', { max: money(TOPUP_MAX) });
  else if (amount % 1000 !== 0) error = tx('amountThousand');
  fieldError(custom, error);
  return error ? null : amount;
};

/** Điền sẵn số tiền (ví dụ số còn thiếu khi đặt dịch vụ). */
export const prefillTopUp = (amount: number) => {
  const value = Math.min(Math.max(roundUp(amount, 1000), TOPUP_MIN), TOPUP_MAX);
  const preset = presets.find((p) => Number(p.value) === value);
  presets.forEach((p) => (p.checked = p === preset));
  custom.value = preset ? '' : groupDigits(value, lang);
  updateSum();
  say(alertBox, tx('prefillNote'), { kind: 'info' });
};

/* ---------- Tạo lệnh nạp ---------- */

clearOnInput(form);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const user = me();
  if (!user?.email) return;
  say(alertBox, '');
  if (state.payment === null) {
    renderPaymentGate();
    return;
  }
  const amount = validAmount();
  if (amount === null) {
    custom.focus();
    return;
  }
  setBusy(createButton, true);
  try {
    const { code } = await ops.createTopup({ uid: user.uid, email: user.email, name: nameOf(user), amount, lang });
    selected = code;
    presets.forEach((p) => (p.checked = false));
    custom.value = '';
    updateSum();
    await reload('topups');
    toast(tx('topupCreated', { code }));
    byId('pay-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
  } catch (err) {
    say(alertBox, dataErrorMessage(err));
  } finally {
    setBusy(createButton, false);
    renderPaymentGate();
  }
});

/* ---------- Khung thanh toán ---------- */

const renderPaymentGate = () => {
  const missing = state.payment === null;
  createButton.disabled = missing || !isLoaded('payment');
  if (missing) say(alertBox, tx('paymentMissing', { zalo: config.contact.zalo, telegram: config.contact.telegram }), { kind: 'info' });
  else if (errors.get('payment')) {
    say(alertBox, `${tx('paymentLoadFailed')} ${dataErrorMessage(errors.get('payment'))}`, {
      action: { label: m('retry'), run: () => void reload('payment') },
    });
  }
};

const copyLabels = () => ({ copy: tx('copy'), copied: tx('copied'), failed: tx('copyFailed') });

/** Một dòng thông tin chuyển khoản + nút "Chép" (`copy`: giá trị chép nếu khác chữ hiển thị, ví dụ số tiền không dấu chấm). */
const payRow = (label: string, value: string, opts: { strong?: boolean; mono?: boolean; copy?: string } = {}) =>
  h(
    'div',
    { class: 'pay-row' },
    h('dt', { text: label }),
    h(
      'dd',
      {},
      h(opts.strong ? 'strong' : 'span', { class: opts.mono ? 'mono' : undefined, text: value }),
      copyButton(() => opts.copy ?? value, copyLabels(), label),
    ),
  );

const qrBox = (t: Topup) => {
  const box = h('div', { class: 'qr-box', role: 'img', 'aria-label': tx('payQrAlt', { amount: money(t.amount), code: t.code }) });
  const p = state.payment;
  if (!p) return box;
  try {
    const payload = buildVietQr({ bin: p.bankBin, account: p.accountNumber, amount: t.amount, content: t.code });
    box.dataset.payload = payload;
    void QRCode.toString(payload, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      color: { dark: '#0a0e24ff', light: '#ffffffff' },
    }).then((svg: string) => {
      // SVG do thư viện tạo từ chuỗi VietQR (không chứa dữ liệu người dùng dạng HTML)
      box.innerHTML = svg;
      box.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    });
  } catch {
    box.append(h('p', { class: 'muted small', text: tx('paymentLoadFailed') }));
  }
  return box;
};

const renderPayPanel = () => {
  const t = state.topups.find((x) => x.code === selected);
  payHow.hidden = Boolean(t);
  payBody.hidden = !t;
  if (!t) {
    payBody.replaceChildren();
    return;
  }
  const head = h(
    'div',
    { class: 'pay-head' },
    h('div', {}, h('p', { class: 'eyebrow', text: tx('payContent') }), h('h2', { class: 'pay-code mono', id: 'pay-title', text: t.code })),
    badge('topup', t.status),
  );
  const children: (Node | null)[] = [head];
  const p = state.payment;

  if (t.status === 'pending') {
    if (p) {
      children.push(
        h('div', { class: 'pay-qr' }, qrBox(t), h('p', { class: 'pay-qr-hint' }, icon('qr'), h('span', { text: tx('payQrHint') }))),
        h(
          'dl',
          { class: 'pay-fields' },
          payRow(tx('payBank'), p.bankName),
          payRow(tx('payAccount'), p.accountNumber, { mono: true, strong: true }),
          payRow(tx('payName'), p.accountName),
          payRow(tx('payAmount'), money(t.amount), { strong: true, copy: String(t.amount) }),
          payRow(tx('payContent'), t.code, { mono: true, strong: true }),
        ),
        h('p', { class: 'pay-warn' }, icon('info'), h('span', { text: tx('payContentWarn', { code: t.code }) })),
      );
      if (p.note) children.push(h('p', { class: 'pay-note', text: p.note }));
    } else if (state.payment === null) {
      children.push(h('p', { class: 'pay-warn', text: tx('paymentMissing', { zalo: config.contact.zalo, telegram: config.contact.telegram }) }));
    }
    children.push(h('p', { class: 'pay-help', text: tx('payPendingHelp') }));
    const cancel = h('button', { type: 'button', class: 'btn btn-sm btn-danger' }, icon('x'), tx('cancelTopup'));
    cancel.addEventListener('click', () => void cancelTopup(t, cancel));
    children.push(h('div', { class: 'pay-actions' }, cancel));
  } else if (t.status === 'approved') {
    children.push(h('p', { class: 'pay-help pay-help--ok', text: tx('payApprovedHelp', { amount: money(t.amount) }) }));
  } else if (t.status === 'rejected') {
    children.push(h('p', { class: 'pay-help', text: tx('payRejectedHelp', { reason: t.reason || '—' }) }));
  } else if (t.status === 'cancelled') {
    children.push(h('p', { class: 'pay-help', text: tx('payCancelledHelp') }));
  }
  children.push(h('p', { class: 'pay-meta muted small', text: `${money(t.amount)} · ${when(t.createdAt)}` }));
  payBody.replaceChildren(...children.filter((c): c is Node => c !== null));
};

const cancelTopup = async (t: Topup, button: HTMLButtonElement) => {
  const answer = await confirmDialog({
    title: tx('cancelTopupTitle', { code: t.code }),
    body: [tx('cancelTopupBody')],
    confirm: tx('cancelTopupYes'),
    cancel: tx('back'),
    danger: true,
  });
  if (!answer.ok) return;
  setBusy(button, true, 'busyCancel');
  try {
    await ops.cancelTopup(t.code);
    await reload('topups');
    toast(tx('topupCancelled'));
  } catch (err) {
    toast(dataErrorMessage(err), 'error');
    setBusy(button, false);
  }
};

/* ---------- Lịch sử nạp & sổ giao dịch ---------- */

const historyRow = (t: Topup) => {
  const open = h('button', { type: 'button', class: 'row-btn', 'aria-pressed': String(t.code === selected) });
  open.append(
    h('span', { class: 'row-icon', 'aria-hidden': 'true' }, icon(t.status === 'pending' ? 'qr' : 'receipt')),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title mono', text: t.code }), h('span', { class: 'row-sub', text: when(t.createdAt) })),
    h('span', { class: 'row-end' }, h('strong', { class: 'row-amount', text: money(t.amount) }), badge('topup', t.status)),
  );
  open.addEventListener('click', () => {
    selected = t.code;
    renderPayPanel();
    renderHistory();
    byId('pay-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  return h('li', {}, open);
};

const renderHistory = () => {
  const list = byId('tp-history');
  const alert = byId('tp-history-alert');
  const err = errors.get('topups');
  if (err) {
    loadError(alert, err, () => void reload('topups'));
    return;
  }
  alert.replaceChildren();
  if (!isLoaded('topups')) return;
  list.replaceChildren(...(state.topups.length ? state.topups.map(historyRow) : [h('li', { class: 'ledger-empty', text: tx('noTopups') })]));
};

const renderLedger = () => {
  const list = byId('tp-ledger');
  const alert = byId('tp-ledger-alert');
  const err = errors.get('transactions');
  if (err) {
    loadError(alert, err, () => void reload('transactions'));
    return;
  }
  alert.replaceChildren();
  if (!isLoaded('transactions')) return;
  list.replaceChildren(...(state.transactions.length ? state.transactions.map(ledgerItem) : [h('li', { class: 'ledger-empty', text: tx('noLedger') })]));
};

const renderBalanceMeta = () => {
  byId('tp-updated').textContent = state.wallet?.updatedAt ? tx('updatedAt', { date: when(state.wallet.updatedAt) }) : '';
};

const render = () => {
  // Mặc định hiện lệnh nạp đang chờ mới nhất
  if (!selected || !state.topups.some((t) => t.code === selected))
    selected = state.topups.find((t) => t.status === 'pending')?.code ?? '';
  renderPaymentGate();
  renderPayPanel();
  renderHistory();
  renderLedger();
  renderBalanceMeta();
};

on(['topups', 'transactions', 'payment', 'wallet'], () => {
  if (isVisible('topup')) render();
});

register('topup', {
  enter() {
    render();
    void ensure('payment', 'topups', 'transactions', 'wallet');
    // Ghé mục nạp tiền: tải lại lệnh nạp & số dư (có thể chủ vừa duyệt)
    if (isLoaded('topups')) void reload('topups', 'wallet', 'transactions');
  },
});

updateSum();
