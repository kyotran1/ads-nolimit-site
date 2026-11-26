/**
 * Nạp thêm ngân sách TKQC ngay trong báo cáo quảng cáo (#bao-cao-ads/<act_…>).
 * - Hộp thoại: mức gợi ý / tự nhập (settings/adTopup, chủ sửa ở /quan-tri/), tạo lệnh adTopups/{ADSB…},
 *   hiện VietQR + thông tin chuyển khoản + nút "Tải ảnh QR" (điện thoại: menu chia sẻ → Lưu hình ảnh).
 * - Chủ duyệt "Đã nhận tiền" ở quản trị → Apps Script bot 3 cộng ngân sách vào cột nạp đúng ngày → số dư tự cập nhật.
 */
import QRCode from 'qrcode';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore/lite';
import { AD_TOPUP_DEFAULTS, budgetOf, todayVn } from '../ads/report';
import type { AdAccount, AdBudgetTopup } from '../ads/report';
import { randomChars } from '../ledger/ops';
import { groupDigits } from '../money';
import { buildVietQr } from '../vietqr';
import { copyButton, h, icon, toast } from '../ui/dom';
import { dataErrorMessage, m } from '../auth/messages';
import { nameOf } from '../auth/user-cache';
import { lang, me, money, when } from './ctx';
import { db, ensure, reload, state } from './store';

const T = {
  vi: {
    title: 'Nạp thêm ngân sách quảng cáo',
    lead: 'Chọn số tiền, tạo lệnh nạp rồi chuyển khoản bằng mã VietQR. Hệ thống tự xác nhận khi tiền về (thường trong vài phút) và cộng ngân sách vào tài khoản quảng cáo.',
    amount: 'Số tiền nạp',
    custom: 'Hoặc nhập số tiền khác',
    placeholder: (n: string) => `Ví dụ ${n}`,
    hint: (min: string, max: string) => `Tối thiểu ${min}, tối đa ${max}, chẵn nghìn đồng.`,
    split: (budget: string, fee: number, feeVnd: string) => `Ngân sách vào TKQC ${budget} · Phí ${fee}% ${feeVnd}`,
    sum: 'Bạn sẽ chuyển khoản',
    create: 'Tạo lệnh nạp',
    creating: 'Đang tạo…',
    close: 'Đóng',
    terms: 'Khi nạp tiền, bạn đồng ý với ',
    termsLink: 'Điều khoản nạp tiền & sử dụng số dư',
    errRequired: 'Chọn hoặc nhập số tiền nạp.',
    errMin: (v: string) => `Tối thiểu ${v}.`,
    errMax: (v: string) => `Tối đa ${v}.`,
    errThousand: 'Số tiền cần chẵn nghìn đồng.',
    noPayment: 'ADS-Nolimit chưa cập nhật thông tin nhận chuyển khoản. Bạn nhắn Zalo để được hỗ trợ nạp.',
    payTitle: 'Quét mã để chuyển khoản',
    content: 'Nội dung chuyển khoản',
    bank: 'Ngân hàng',
    account: 'Số tài khoản',
    holder: 'Chủ tài khoản',
    amountRow: 'Số tiền',
    budgetRow: 'Ngân sách vào TKQC',
    contentWarn: 'Chuyển đúng số tiền và giữ nguyên nội dung chuyển khoản để hệ thống tự xác nhận lệnh nạp của bạn.',
    download: 'Tải ảnh QR',
    downloaded: 'Đã lưu ảnh QR.',
    downloadFail: 'Chưa lưu được ảnh. Bạn chụp màn hình mã QR giúp nhé.',
    shareTitle: 'Mã QR nạp ngân sách quảng cáo',
    newOrder: 'Tạo lệnh khác',
    copy: 'Chép',
    copied: 'Đã chép',
    copyFailed: 'Chưa chép được',
    created: (c: string) => `Đã tạo lệnh nạp ${c}.`,
    recent: 'Lệnh nạp ngân sách gần đây',
    showQr: 'Xem mã QR',
    status: {
      pending: 'Chờ chuyển khoản',
      approved: 'Đã nhận tiền',
      written: 'Đã cộng vào báo cáo',
      rejected: 'Từ chối',
      cancelled: 'Đã hủy',
    },
    imgHead: 'NẠP NGÂN SÁCH QUẢNG CÁO',
    imgScan: 'Quét bằng app ngân hàng (VietQR)',
  },
  en: {
    title: 'Add ad budget',
    lead: 'Choose an amount, create a top-up, then pay by bank transfer with the VietQR code. Payments are confirmed automatically (usually within minutes) and the budget is added to your ad account.',
    amount: 'Amount',
    custom: 'Or enter another amount',
    placeholder: (n: string) => `For example ${n}`,
    hint: (min: string, max: string) => `From ${min} to ${max}, in whole thousands.`,
    split: (budget: string, fee: number, feeVnd: string) => `Ad budget ${budget} · ${fee}% fee ${feeVnd}`,
    sum: 'You will transfer',
    create: 'Create top-up',
    creating: 'Creating…',
    close: 'Close',
    terms: 'By topping up you agree to the ',
    termsLink: 'balance top-up terms',
    errRequired: 'Choose or enter an amount.',
    errMin: (v: string) => `At least ${v}.`,
    errMax: (v: string) => `At most ${v}.`,
    errThousand: 'Use whole thousands of VND.',
    noPayment: 'ADS-Nolimit has not set up bank details yet. Message us on Zalo for help.',
    payTitle: 'Scan to pay',
    content: 'Transfer reference',
    bank: 'Bank',
    account: 'Account number',
    holder: 'Account name',
    amountRow: 'Amount',
    budgetRow: 'Ad budget',
    contentWarn: 'Transfer the exact amount and keep the reference as shown so your payment is confirmed automatically.',
    download: 'Save QR image',
    downloaded: 'QR image saved.',
    downloadFail: 'Could not save the image. Please take a screenshot of the QR code.',
    shareTitle: 'Ad budget QR code',
    newOrder: 'Create another',
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Could not copy',
    created: (c: string) => `Top-up ${c} created.`,
    recent: 'Recent ad budget top-ups',
    showQr: 'Show QR',
    status: {
      pending: 'Awaiting transfer',
      approved: 'Payment received',
      written: 'Added to report',
      rejected: 'Rejected',
      cancelled: 'Cancelled',
    },
    imgHead: 'AD BUDGET TOP-UP',
    imgScan: 'Scan with your banking app (VietQR)',
  },
}[lang];

const cfg = () => state.adTopupSettings ?? AD_TOPUP_DEFAULTS;
const parseVnd = (v: string) => Number(v.replace(/\D/g, '').slice(0, 12) || 'NaN');
const statusText = (t: AdBudgetTopup) => (t.status === 'approved' && t.written ? T.status.written : T.status[t.status]);

/* ---------- Ảnh QR để tải về ---------- */

const qrImage = async (t: AdBudgetTopup, payload: string): Promise<Blob> => {
  const p = state.payment!;
  const W = 900;
  const H = 1380;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#0b5394';
  g.fillRect(0, 0, W, 150);
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = 'bold 44px Arial, sans-serif';
  g.fillText('ADS-NOLIMIT', W / 2, 70);
  g.fillStyle = '#ffd966';
  g.font = 'bold 30px Arial, sans-serif';
  g.fillText(T.imgHead, W / 2, 120);

  const svg = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#0a0e24ff', light: '#ffffffff' } });
  const qr = new Image();
  await new Promise<void>((ok, fail) => {
    qr.onload = () => ok();
    qr.onerror = () => fail(new Error('qr'));
    qr.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  g.imageSmoothingEnabled = false;
  g.drawImage(qr, (W - 600) / 2, 190, 600, 600);
  g.fillStyle = '#5f6368';
  g.font = '26px Arial, sans-serif';
  g.fillText(T.imgScan, W / 2, 830);

  const rows: [string, string, boolean][] = [
    [T.amountRow, money(t.amount), true],
    [T.content, t.code, true],
    [T.bank, p.bankName, false],
    [T.account, p.accountNumber, true],
    [T.holder, p.accountName, false],
    [T.budgetRow, `${money(t.budget)} · ${t.accountLabel}`, false],
  ];
  let y = 900;
  g.textAlign = 'left';
  for (const [k, v, strong] of rows) {
    g.fillStyle = '#5f6368';
    g.font = '26px Arial, sans-serif';
    g.fillText(k, 80, y);
    g.fillStyle = strong ? '#c00000' : '#111111';
    g.font = `${strong ? 'bold ' : ''}32px Arial, sans-serif`;
    let text = v;
    while (g.measureText(text).width > W - 160 && text.length > 4) text = `${text.slice(0, -2)}…`;
    g.fillText(text, 80, y + 40);
    y += 78;
  }
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'));
};

const saveQr = async (t: AdBudgetTopup, payload: string) => {
  try {
    const blob = await qrImage(t, payload);
    const name = `QR-nap-ngan-sach-${t.code}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    // Điện thoại: menu chia sẻ có "Lưu hình ảnh" → ảnh vào thư viện ảnh
    if (touch && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: T.shareTitle });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(T.downloaded);
  } catch {
    toast(T.downloadFail, 'error');
  }
};

/* ---------- Khung thanh toán ---------- */

const payRow = (label: string, value: string, copy?: string, strong = false) =>
  h(
    'div',
    { class: 'pay-row' },
    h('dt', { text: label }),
    h(
      'dd',
      {},
      h(strong ? 'strong' : 'span', { text: value }),
      copyButton(() => copy ?? value, { copy: T.copy, copied: T.copied, failed: T.copyFailed }, label),
    ),
  );

const payView = (t: AdBudgetTopup): HTMLElement => {
  const p = state.payment;
  if (!p) return h('p', { class: 'auth-alert', text: T.noPayment });
  const payload = buildVietQr({ bin: p.bankBin, account: p.accountNumber, amount: t.amount, content: t.code });
  const box = h('div', { class: 'qr-box at-qr', role: 'img', 'aria-label': `${T.payTitle}: ${money(t.amount)}, ${t.code}` });
  void QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#0a0e24ff', light: '#ffffffff' } }).then((svg: string) => {
    box.innerHTML = svg; // SVG do thư viện tạo từ chuỗi VietQR
    box.querySelector('svg')?.setAttribute('aria-hidden', 'true');
  });
  const dl = h('button', { type: 'button', class: 'btn btn-primary at-dl' }, icon('download'), T.download);
  dl.addEventListener('click', async () => {
    dl.disabled = true;
    await saveQr(t, payload);
    dl.disabled = false;
  });
  return h(
    'div',
    { class: 'at-pay' },
    h('div', { class: 'at-qr-wrap' }, box, dl),
    h(
      'dl',
      { class: 'pay-fields' },
      payRow(T.amountRow, money(t.amount), String(t.amount), true),
      payRow(T.content, t.code, t.code, true),
      payRow(T.bank, p.bankName),
      payRow(T.account, p.accountNumber, p.accountNumber, true),
      payRow(T.holder, p.accountName),
    ),
    h('p', { class: 'small muted', text: `${T.budgetRow}: ${money(t.budget)} · ${t.accountLabel}` }),
    h('p', { class: 'pay-warn small', text: T.contentWarn }),
  );
};

/* ---------- Hộp thoại ---------- */

export const openAdTopup = async (a: AdAccount, show?: AdBudgetTopup) => {
  const dialog = h('dialog', { class: 'confirm-dialog at-dialog', 'aria-labelledby': 'at-title' });
  const body = h('div', { class: 'at-body' });
  const closeBtn = h('button', { type: 'button', class: 'at-close', 'aria-label': T.close }, icon('x'));
  dialog.append(
    h('div', { class: 'at-head' }, h('div', {}, h('h2', { id: 'at-title', text: T.title }), h('p', { class: 'muted small', text: a.label || a.accountName })), closeBtn),
    body,
  );
  document.body.append(dialog);
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  closeBtn.addEventListener('click', close);
  dialog.addEventListener('cancel', close);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  dialog.showModal();

  const showPay = (t: AdBudgetTopup) => {
    const again = h('button', { type: 'button', class: 'btn btn-ghost', text: T.newOrder, onclick: () => showForm() });
    body.replaceChildren(
      h('div', { class: 'at-pay-head' }, h('h3', { text: T.payTitle }), h('span', { class: 'badge badge--pending', text: statusText(t) })),
      payView(t),
      h('div', { class: 'confirm-actions' }, again, h('button', { type: 'button', class: 'btn', text: T.close, onclick: close })),
    );
  };

  const showForm = () => {
    const c = cfg();
    let picked = 0;
    const err = h('p', { class: 'field-error', id: 'at-err' });
    const sum = h('strong', { text: '—' });
    const split = h('p', { class: 'small muted at-split' });
    const input = h('input', {
      id: 'at-custom',
      type: 'text',
      inputmode: 'numeric',
      autocomplete: 'off',
      placeholder: T.placeholder(groupDigits(c.presets[1] ?? c.min, lang)),
      'aria-describedby': 'at-hint at-err',
    });
    const chips = c.presets.map((v) => {
      const radio = h('input', { type: 'radio', name: 'at-preset', value: String(v) });
      radio.addEventListener('change', () => {
        picked = v;
        input.value = '';
        upd();
      });
      return h('label', { class: 'amount-chip' }, radio, h('span', { text: money(v) }));
    });
    const amount = () => (picked ? picked : input.value.trim() ? parseVnd(input.value) : Number.NaN);
    const upd = () => {
      err.textContent = '';
      input.removeAttribute('aria-invalid');
      const v = amount();
      if (Number.isFinite(v) && v > 0) {
        sum.textContent = money(v);
        const b = budgetOf(v, c.feePercent);
        split.textContent = T.split(money(b), c.feePercent, money(v - b));
      } else {
        sum.textContent = '—';
        split.textContent = '';
      }
    };
    input.addEventListener('input', () => {
      picked = 0;
      chips.forEach((l) => ((l.querySelector('input') as HTMLInputElement).checked = false));
      const digits = input.value.replace(/\D/g, '').slice(0, 12);
      input.value = digits ? groupDigits(Number(digits), lang) : '';
      upd();
    });
    const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, icon('qr'), T.create);
    const form = h(
      'form',
      { class: 'at-form', novalidate: true },
      h('p', { class: 'muted small', text: T.lead }),
      h('fieldset', { class: 'amounts' }, h('legend', { text: T.amount }), h('div', { class: 'amount-chips' }, ...chips)),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'at-custom', text: T.custom }),
        h('div', { class: 'money-input' }, input, h('span', { 'aria-hidden': 'true', text: 'đ' })),
        h('p', { class: 'field-hint', id: 'at-hint', text: T.hint(money(c.min), money(c.max)) }),
        err,
      ),
      h('div', { class: 'tp-submit' }, h('p', { class: 'tp-sum' }, h('span', { text: T.sum }), sum), submit),
      split,
      state.payment === null ? h('p', { class: 'auth-alert', text: T.noPayment }) : null,
      h('p', { class: 'small muted' }, T.terms, h('a', { href: lang === 'en' ? '/en/terms/' : '/dieu-khoan/', text: T.termsLink }), '.'),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = me();
      if (!user) return;
      if (!user.email) {
        toast(m('needEmail'), 'error'); // khách Facebook chưa có email: nhắc thêm email thay vì im lặng
        return;
      }
      const v = amount();
      let msg = '';
      if (!Number.isFinite(v)) msg = T.errRequired;
      else if (v < c.min) msg = T.errMin(money(c.min));
      else if (v > c.max) msg = T.errMax(money(c.max));
      else if (v % 1000 !== 0) msg = T.errThousand;
      if (msg) {
        err.textContent = msg;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      if (state.payment === null) return;
      submit.disabled = true;
      submit.lastChild!.textContent = T.creating;
      try {
        const t = await create(a, v, c.feePercent, nameOf(user), user.uid, user.email);
        toast(T.created(t.code));
        showPay(t);
        void reload('adTopups');
      } catch (er) {
        err.textContent = dataErrorMessage(er);
        submit.disabled = false;
        submit.lastChild!.textContent = T.create;
      }
    });
    body.replaceChildren(form);
    upd();
  };

  if (show) showPay(show);
  else {
    body.replaceChildren(h('p', { class: 'muted', text: '…' }));
    await ensure('adTopupSettings', 'payment').catch(() => undefined);
    if (dialog.isConnected) showForm();
  }
};

const create = async (a: AdAccount, amount: number, feePercent: number, name: string, uid: string, email: string): Promise<AdBudgetTopup> => {
  const budget = budgetOf(amount, feePercent);
  const day = todayVn();
  let last: unknown = null;
  for (let i = 0; i < 3; i++) {
    const code = `ADSB${randomChars(6)}`;
    const data: Record<string, unknown> = {
      uid,
      email,
      actId: a.id,
      accountLabel: (a.label || a.accountName).slice(0, 160),
      amount,
      budget,
      feePercent,
      day,
      code,
      status: 'pending',
      lang,
      createdAt: serverTimestamp(),
    };
    if (name) data.name = name.slice(0, 120);
    try {
      await setDoc(doc(db, 'adTopups', code), data);
      return {
        code, uid, email, name, actId: a.id, accountLabel: data.accountLabel as string, amount, budget, feePercent, day,
        status: 'pending', reason: '', written: false, sheetTab: '', decidedBy: '', sepayNote: '', paidAmount: 0,
        createdAt: new Date(), decidedAt: null, writtenAt: null,
      };
    } catch (err) {
      last = err;
      if (!String((err as { code?: string })?.code ?? '').includes('permission-denied')) throw err;
    }
  }
  throw last;
};

/* ---------- Danh sách lệnh gần đây của một TKQC (dưới báo cáo) ---------- */

export const recentTopups = (a: AdAccount): HTMLElement | null => {
  const list = state.adTopups.filter((t) => t.actId === a.id).slice(0, 5);
  if (!list.length) return null;
  return h(
    'section',
    { class: 'at-recent' },
    h('h3', { class: 'sub-title', text: T.recent }),
    h(
      'ul',
      { class: 'at-list' },
      ...list.map((t) =>
        h(
          'li',
          { class: `at-item is-${t.status}${t.written ? ' is-written' : ''}` },
          h('div', {}, h('strong', { text: money(t.amount) }), h('span', { class: 'muted small', text: ` · ${t.code} · ${when(t.createdAt)}` })),
          h('span', { class: 'at-status', text: statusText(t) }),
          t.status === 'pending'
            ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', text: T.showQr, onclick: () => void openAdTopup(a, t) })
            : null,
        ),
      ),
    ),
  );
};

