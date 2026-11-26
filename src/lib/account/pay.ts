/**
 * Thanh toán bằng số dư (dùng cho mục Dịch vụ và Khóa học):
 * kiểm tra số dư → thiếu thì mời nạp đúng số còn thiếu → hỏi xác nhận → ghi đơn (src/lib/ledger/ops.ts → purchase).
 */
import { dataErrorMessage, errorCode, m } from '../auth/messages';
import { LedgerError } from '../ledger/ops';
import type { PurchaseInput, PurchaseResult } from '../ledger/ops';
import { roundUp } from '../money';
import { confirmDialog, h, toast } from '../ui/dom';
import { go, lang, me, money } from './ctx';
import { balance, ensure, ops, reload } from './store';
import { tx } from './text';
import { prefillTopUp } from './topup';
import { highlightOrder } from './orders';

/** Hộp "Số dư chưa đủ" với nút nạp đúng số còn thiếu. */
export const askTopUp = async (shortfall: number) => {
  const answer = await confirmDialog({
    title: tx('insufficientTitle'),
    body: [h('p', { text: tx('insufficient', { short: money(shortfall) }) }), h('p', { class: 'muted small', text: `${tx('balanceNow')}: ${money(balance())}` })],
    confirm: tx('topUpShort', { amount: money(Math.max(roundUp(shortfall), 100_000)) }),
    cancel: tx('back'),
  });
  if (answer.ok) {
    prefillTopUp(shortfall);
    go('topup');
  }
};

const line = (label: string, value: string, strong = false) =>
  h('div', { class: 'sum-line' }, h('span', { text: label }), h(strong ? 'strong' : 'span', { text: value }));

export interface PayRequest extends Omit<PurchaseInput, 'uid' | 'email' | 'lang'> {
  /** Tổng VNĐ dự kiến (để kiểm tra số dư và hiện xác nhận; giá thật lấy lại trong transaction) */
  total: number;
  /** Dòng mô tả trong hộp xác nhận */
  lines?: [string, string][];
  /** Thông báo khi xong; mặc định "Đã thanh toán đơn …" */
  success?: (r: PurchaseResult) => string;
  /** Sau khi xong: mặc định mở mục Đơn hàng */
  after?: (r: PurchaseResult) => void;
}

/** Trả về kết quả nếu đã thanh toán, null nếu khách hủy / thiếu tiền / lỗi (đã báo). */
export const payFromBalance = async (req: PayRequest): Promise<PurchaseResult | null> => {
  const user = me();
  if (!user) return null;
  if (!user.email) {
    toast(m('needEmail'), 'error'); // khách Facebook chưa có email: nhắc thêm email thay vì im lặng
    return null;
  }
  await ensure('wallet');
  const current = balance();
  if (current < req.total) {
    await askTopUp(req.total - current);
    return null;
  }
  const answer = await confirmDialog({
    title: tx('confirmPayTitle'),
    body: [
      h(
        'div',
        { class: 'sum' },
        line(tx('orderProduct'), req.name),
        ...(req.lines ?? []).map(([a, b]) => line(a, b)),
        line(tx('total'), money(req.total), true),
        h('hr'),
        line(tx('balanceNow'), money(current)),
        line(tx('balanceAfterPay'), money(current - req.total), true),
      ),
    ],
    confirm: tx('confirmPay'),
    cancel: tx('back'),
  });
  if (!answer.ok) return null;

  const { total: _total, lines: _lines, success, after, ...input } = req;
  try {
    const result = await ops.purchase({ ...input, uid: user.uid, email: user.email, lang });
    await reload('wallet', 'orders', 'transactions');
    toast(success ? success(result) : tx('paidOk', { id: result.orderId.slice(0, 8).toUpperCase() }));
    if (after) after(result);
    else {
      highlightOrder(result.orderId);
      go('orders');
    }
    return result;
  } catch (err) {
    if (err instanceof LedgerError && err.code === 'insufficient') {
      await reload('wallet');
      await askTopUp(err.shortfall);
    } else if (err instanceof LedgerError && err.code === 'unavailable') {
      toast(tx('unavailable'), 'error');
    } else if (errorCode(err).includes('permission-denied') || errorCode(err).includes('aborted')) {
      await reload('wallet', 'products');
      toast(tx('payChanged'), 'error');
    } else {
      toast(dataErrorMessage(err), 'error');
    }
    return null;
  }
};
