/**
 * Quản trị — Cài đặt: thông tin nhận chuyển khoản (settings/payment) do CHỦ tự nhập, xem thử mã VietQR,
 * và "Đồng bộ bảng giá" (ghi products/ từ src/data/catalog.ts, giá lấy từ src/data/pricing.ts).
 */
import QRCode from 'qrcode';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore/lite';
import { confirmDialog, h, icon, toast } from '../ui/dom';
import { buildVietQr, checkCrc, plainUpper } from '../vietqr';
import { buildForm, config, db, errText, me, money, num, ops, str, when } from './shared';

const OTHER = 'other';

export const renderSettings = async (root: HTMLElement) => {
  const paymentBox = h('section', { class: 'panel' }, h('p', { class: 'row-loading', text: 'Đang tải…' }));
  const productsBox = h('section', { class: 'panel' });
  root.replaceChildren(paymentBox, productsBox, h('p', { class: 'muted small', text: `UID quản trị của bạn: ${me()}` }));
  void renderPayment(paymentBox);
  void renderProducts(productsBox);
};

const renderPayment = async (box: HTMLElement) => {
  let current: Record<string, unknown> | null = null;
  try {
    const snap = await getDoc(doc(db, 'settings', 'payment'));
    current = snap.exists() ? snap.data() : null;
  } catch (err) {
    box.replaceChildren(h('div', { class: 'auth-alert', role: 'alert', text: errText(err) }));
    return;
  }
  const bin = current ? str(current, 'bankBin') : '';
  const known = config.banks.some((b) => b.bin === bin);
  const f = buildForm(
    [
      {
        name: 'bank',
        label: 'Ngân hàng nhận tiền',
        type: 'select',
        required: true,
        value: bin ? (known ? bin : OTHER) : '',
        options: [{ value: '', label: 'Chọn ngân hàng…' }, ...config.banks.map((b) => ({ value: b.bin, label: `${b.short} (${b.bin})` })), { value: OTHER, label: 'Ngân hàng khác (nhập mã BIN)' }],
      },
      { name: 'bin', label: 'Mã BIN Napas (6 số)', maxlength: 6, inputmode: 'numeric', value: known ? '' : bin, hint: 'Chỉ cần khi chọn "Ngân hàng khác".' },
      { name: 'bankName', label: 'Tên ngân hàng hiển thị cho khách', maxlength: 80, value: current ? str(current, 'bankName') : '', hint: 'Để trống: dùng tên trong danh sách.' },
      { name: 'accountNumber', label: 'Số tài khoản', required: true, maxlength: 19, inputmode: 'numeric', value: current ? str(current, 'accountNumber') : '' },
      { name: 'accountName', label: 'Tên chủ tài khoản', required: true, maxlength: 60, value: current ? str(current, 'accountName') : '', hint: 'Chữ in hoa không dấu, đúng như trên app ngân hàng (tự chuyển khi lưu).' },
      { name: 'note', label: 'Ghi chú cho khách', type: 'textarea', rows: 2, maxlength: 300, value: current ? str(current, 'note') : '', placeholder: 'Ví dụ: Lệnh nạp được duyệt trong giờ làm việc.' },
    ],
    'Lưu thông tin nhận tiền',
  );
  const binInput = f.inputs.get('bin') as HTMLInputElement;
  const bankSelect = f.inputs.get('bank') as HTMLSelectElement;
  const syncBin = () => (binInput.closest('.field') as HTMLElement).toggleAttribute('hidden', bankSelect.value !== OTHER);
  bankSelect.addEventListener('change', syncBin);
  syncBin();

  const preview = h('div', { class: 'adm-qr-preview' });
  const drawPreview = (bankBin: string, account: string) => {
    try {
      const payload = buildVietQr({ bin: bankBin, account, amount: 100000, content: 'ADSNTEST22' });
      const qr = h('div', { class: 'qr-box', 'data-payload': payload, role: 'img', 'aria-label': 'Mã VietQR thử 100.000đ' });
      void QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 }).then((svg: string) => (qr.innerHTML = svg));
      preview.replaceChildren(
        h('p', { class: 'eyebrow', text: 'Xem thử' }),
        qr,
        h('p', { class: 'small muted', text: `Mã thử: 100.000đ, nội dung ADSNTEST22. Kiểm tra CRC: ${checkCrc(payload) ? 'đúng' : 'SAI'}. Hãy quét thử bằng app ngân hàng của bạn (không cần chuyển) để chắc đúng tên chủ tài khoản.` }),
      );
    } catch (err) {
      preview.replaceChildren(h('p', { class: 'small muted', text: String((err as Error).message) }));
    }
  };
  if (current) drawPreview(str(current, 'bankBin'), str(current, 'accountNumber'));

  f.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    f.clearErrors();
    f.alert.replaceChildren();
    const bankBin = bankSelect.value === OTHER ? f.value('bin') : bankSelect.value;
    const account = f.value('accountNumber').replace(/[\s.-]/g, '');
    const name = plainUpper(f.value('accountName'));
    const listed = config.banks.find((b) => b.bin === bankBin);
    const bankName = f.value('bankName') || listed?.short || '';
    if (!bankSelect.value) f.setError('bank', 'Chọn ngân hàng.');
    else if (!/^\d{6}$/.test(bankBin)) f.setError(bankSelect.value === OTHER ? 'bin' : 'bank', 'Mã BIN gồm đúng 6 chữ số.');
    if (!/^\d{6,19}$/.test(account)) f.setError('accountNumber', 'Số tài khoản chỉ gồm 6–19 chữ số.');
    if (!/^[A-Z0-9 .-]{2,60}$/.test(name)) f.setError('accountName', 'Nhập tên chủ tài khoản (chữ in hoa không dấu).');
    if (!bankName) f.setError('bankName', 'Nhập tên ngân hàng hiển thị.');
    if (f.focusFirstError()) return;
    const ok = await confirmDialog({
      title: 'Lưu thông tin nhận tiền?',
      body: [
        h('div', { class: 'sum' }, ...[['Ngân hàng', `${bankName} (${bankBin})`], ['Số tài khoản', account], ['Chủ tài khoản', name]].map(([a, b]) => h('div', { class: 'sum-line' }, h('span', { text: a }), h('strong', { text: b })))),
        'Mọi mã QR nạp tiền của khách sẽ dùng thông tin này ngay sau khi lưu.',
      ],
      confirm: 'Lưu',
      cancel: 'Quay lại',
    });
    if (!ok.ok) return;
    f.submit.disabled = true;
    try {
      const data: Record<string, unknown> = { bankBin, bankName, accountNumber: account, accountName: name, updatedAt: serverTimestamp(), updatedBy: me() };
      if (f.value('note')) data.note = f.value('note');
      await setDoc(doc(db, 'settings', 'payment'), data);
      (f.inputs.get('accountName') as HTMLInputElement).value = name;
      (f.inputs.get('accountNumber') as HTMLInputElement).value = account;
      drawPreview(bankBin, account);
      toast('Đã lưu thông tin nhận tiền.');
    } catch (err) {
      f.alert.replaceChildren(h('p', { text: errText(err) }));
    } finally {
      f.submit.disabled = false;
    }
  });

  box.replaceChildren(
    h('h2', { text: 'Thông tin nhận chuyển khoản' }),
    h('p', { class: 'panel-lead', text: current ? `Cập nhật lần cuối ${when(current.updatedAt)}.` : 'Chưa có thông tin: khách chưa tạo được lệnh nạp (trang Nạp tiền mời khách liên hệ Zalo).' }),
    h('div', { class: 'adm-pay-grid' }, f.form, preview),
  );
};

const renderProducts = async (box: HTMLElement) => {
  let live: Map<string, Record<string, unknown>>;
  try {
    live = new Map((await getDocs(collection(db, 'products'))).docs.map((d) => [d.id, d.data()]));
  } catch (err) {
    box.replaceChildren(h('div', { class: 'auth-alert', role: 'alert', text: errText(err) }));
    return;
  }
  const rows = config.catalog.map((p) => {
    const l = live.get(p.id);
    const price = p.pricing === 'fixed' ? money(p.price ?? 0) : `${money(p.minAmount ?? 0)} – ${money(p.maxAmount ?? 0)}`;
    const same = l && l.active === true && (p.pricing === 'fixed' ? num(l, 'price') === p.price && num(l, 'maxQty') === p.maxQty : num(l, 'minAmount') === p.minAmount && num(l, 'maxAmount') === p.maxAmount);
    return h(
      'li',
      {},
      h('span', { class: 'adm-lesson-title', text: p.name.vi }),
      h('span', { class: 'muted small', text: `${p.id} · ${price}${p.maxQty && p.maxQty > 1 ? ` · tối đa ${p.maxQty}` : ''}` }),
      h('span', { class: `badge ${same ? 'badge--active' : 'badge--pending'}`, text: same ? 'Đã đồng bộ' : l ? 'Khác Firestore' : 'Chưa có' }),
    );
  });
  const extra = Array.from(live.keys()).filter((id) => !config.catalog.some((p) => p.id === id) && live.get(id)?.active !== false);
  const sync = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, icon('refresh'), 'Đồng bộ bảng giá');
  sync.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Đồng bộ bảng giá?',
      body: ['Ghi giá trong src/data/pricing.ts vào Firestore. Đơn khách đặt sau đó tính theo giá mới.', extra.length ? `Sản phẩm không còn trong danh mục sẽ bị tắt: ${extra.join(', ')}.` : ''],
      confirm: 'Đồng bộ',
      cancel: 'Quay lại',
    });
    if (!ok.ok) return;
    sync.disabled = true;
    try {
      const r = await ops.syncProducts(config.catalog as unknown as Record<string, unknown>[]);
      toast(`Đã ghi ${r.written} sản phẩm${r.disabled ? `, tắt ${r.disabled}` : ''}.`);
      void renderProducts(box);
    } catch (err) {
      toast(errText(err), 'error');
      sync.disabled = false;
    }
  });
  box.replaceChildren(
    h('div', { class: 'panel-head' }, h('h2', { text: 'Bảng giá bán bằng số dư' }), sync),
    h('p', { class: 'panel-lead', text: 'Luật bảo mật kiểm tra giá mỗi đơn theo bảng này. Sau khi đổi giá ở src/data/pricing.ts và deploy, bấm "Đồng bộ bảng giá".' }),
    h('ul', { class: 'adm-lessons' }, ...rows),
  );
};
