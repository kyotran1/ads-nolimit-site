/**
 * Chữ hiện ra TRONG LÚC dùng trang tài khoản V4 (số dư, nạp tiền, đơn hàng, dịch vụ, khóa học, key…),
 * hai ngôn ngữ, xưng "bạn". Chữ cố định trên trang nằm trong src/components/account/*.astro.
 * Thông báo lỗi đăng nhập / Firestore dùng chung: src/lib/auth/messages.ts.
 */
import { pageLang } from '../auth/messages';

type T = { vi: string; en: string };

const text = {
  // chung
  copy: { vi: 'Chép', en: 'Copy' },
  copied: { vi: 'Đã chép', en: 'Copied' },
  copyFailed: { vi: 'Chưa chép được', en: 'Could not copy' },
  close: { vi: 'Đóng', en: 'Close' },
  cancel: { vi: 'Hủy', en: 'Cancel' },
  back: { vi: 'Quay lại', en: 'Back' },
  retry: { vi: 'Thử lại', en: 'Try again' },
  seeAll: { vi: 'Xem tất cả', en: 'See all' },
  optional: { vi: '(không bắt buộc)', en: '(optional)' },
  dash: { vi: '—', en: '—' },

  // trạng thái lệnh nạp
  'topup.pending': { vi: 'Chờ chuyển khoản', en: 'Awaiting transfer' },
  'topup.approved': { vi: 'Đã duyệt', en: 'Approved' },
  'topup.rejected': { vi: 'Từ chối', en: 'Rejected' },
  'topup.cancelled': { vi: 'Đã hủy', en: 'Cancelled' },
  // trạng thái đơn
  'order.paid': { vi: 'Đã thanh toán', en: 'Paid' },
  'order.processing': { vi: 'Đang xử lý', en: 'In progress' },
  'order.done': { vi: 'Hoàn thành', en: 'Completed' },
  'order.cancelled': { vi: 'Đã hủy', en: 'Cancelled' },
  'order.refunded': { vi: 'Đã hoàn tiền', en: 'Refunded' },
  // loại giao dịch
  'tx.topup': { vi: 'Nạp tiền', en: 'Top-up' },
  'tx.purchase': { vi: 'Thanh toán', en: 'Payment' },
  'tx.refund': { vi: 'Hoàn tiền', en: 'Refund' },
  'tx.adjust': { vi: 'Điều chỉnh', en: 'Adjustment' },
  // key
  'key.active': { vi: 'Đang dùng', en: 'Active' },
  'key.revoked': { vi: 'Đã thu hồi', en: 'Revoked' },
  'keyreq.new': { vi: 'Đang chờ xử lý', en: 'Pending' },
  'keyreq.done': { vi: 'Đã xử lý', en: 'Done' },
  'keyreq.rejected': { vi: 'Không xử lý', en: 'Declined' },

  // tổng quan
  hello: { vi: 'Xin chào, {name}', en: 'Hello, {name}' },
  statTopUp: { vi: 'Nạp thêm', en: 'Top up' },
  statOrdersNone: { vi: 'Chưa có đơn', en: 'No orders yet' },
  statOrdersActive: { vi: '{n} đơn đang xử lý', en: '{n} in progress' },
  statOrdersAllDone: { vi: 'Không có đơn chờ', en: 'Nothing pending' },
  statKeysNone: { vi: 'AI Office sắp ra mắt', en: 'AI Office coming soon' },
  statKeysMachines: { vi: '{used}/{max} máy đang dùng', en: '{used}/{max} devices in use' },
  statCoursesNone: { vi: 'Nội dung đang cập nhật', en: 'Content coming soon' },
  statCoursesOf: { vi: 'trên {n} khóa học', en: 'of {n} courses' },
  pendingTopups: {
    vi: 'Bạn có {n} lệnh nạp đang chờ chuyển khoản.',
    en: 'You have {n} top-up waiting for your bank transfer.',
  },
  pendingTopupsLink: { vi: 'Xem lệnh nạp', en: 'View top-up' },
  noTransactions: {
    vi: 'Chưa có giao dịch nào. Nạp tiền để bắt đầu dùng dịch vụ.',
    en: 'No transactions yet. Top up to start using our services.',
  },

  // nạp tiền
  amountRequired: { vi: 'Vui lòng chọn hoặc nhập số tiền cần nạp.', en: 'Choose or enter an amount to top up.' },
  amountInvalid: { vi: 'Số tiền chưa đúng, ví dụ 1.000.000.', en: 'Please enter a valid amount, for example 1,000,000.' },
  amountMin: { vi: 'Số tiền tối thiểu là {min}.', en: 'The minimum is {min}.' },
  amountMax: { vi: 'Số tiền tối đa là {max}.', en: 'The maximum is {max}.' },
  amountThousand: { vi: 'Số tiền cần chẵn nghìn đồng (ví dụ 1.250.000).', en: 'Use whole thousands of VND (for example 1,250,000).' },
  busyCreate: { vi: 'Đang tạo lệnh…', en: 'Creating…' },
  topupCreated: {
    vi: 'Đã tạo lệnh nạp {code}. Bạn quét mã QR hoặc chuyển khoản theo thông tin bên cạnh, nhớ ghi đúng nội dung.',
    en: 'Top-up {code} created. Scan the QR code or transfer using the details shown, with the exact reference.',
  },
  paymentMissing: {
    vi: 'ADS-Nolimit đang cập nhật thông tin nhận thanh toán, vui lòng liên hệ Zalo {zalo} để được hỗ trợ nạp tiền.',
    en: 'ADS-Nolimit is updating its payment details. Please message us on Telegram {telegram} or Zalo {zalo} to top up.',
  },
  paymentLoadFailed: {
    vi: 'Chưa tải được thông tin nhận thanh toán.',
    en: 'Could not load the payment details.',
  },
  payBank: { vi: 'Ngân hàng', en: 'Bank' },
  payAccount: { vi: 'Số tài khoản', en: 'Account number' },
  payName: { vi: 'Chủ tài khoản', en: 'Account name' },
  payAmount: { vi: 'Số tiền', en: 'Amount' },
  payContent: { vi: 'Nội dung chuyển khoản', en: 'Transfer reference' },
  payContentWarn: {
    vi: 'Ghi ĐÚNG nội dung {code} để ADS-Nolimit nhận ra lệnh nạp của bạn.',
    en: 'Use exactly {code} as the reference so we can match your payment.',
  },
  payQrAlt: { vi: 'Mã VietQR chuyển khoản {amount} cho lệnh {code}', en: 'VietQR code to transfer {amount} for top-up {code}' },
  payQrHint: { vi: 'Quét bằng app ngân hàng hoặc ví có hỗ trợ VietQR', en: 'Scan with any Vietnamese banking app that supports VietQR' },
  payPendingHelp: {
    vi: 'Sau khi bạn chuyển khoản, ADS-Nolimit kiểm tra và cộng tiền vào số dư. Lệnh sẽ đổi sang "Đã duyệt".',
    en: 'After you transfer, ADS-Nolimit checks the payment and adds it to your balance. The top-up then shows "Approved".',
  },
  payApprovedHelp: { vi: 'Đã cộng {amount} vào số dư.', en: '{amount} has been added to your balance.' },
  payRejectedHelp: { vi: 'Lý do: {reason}', en: 'Reason: {reason}' },
  payCancelledHelp: {
    vi: 'Lệnh đã hủy. Nếu bạn đã lỡ chuyển khoản cho lệnh này, hãy nhắn ADS-Nolimit để được kiểm tra.',
    en: 'This top-up was cancelled. If you already transferred money for it, contact ADS-Nolimit so we can check.',
  },
  cancelTopup: { vi: 'Hủy lệnh nạp', en: 'Cancel top-up' },
  cancelTopupTitle: { vi: 'Hủy lệnh nạp {code}?', en: 'Cancel top-up {code}?' },
  cancelTopupBody: {
    vi: 'Nếu bạn ĐÃ chuyển khoản cho lệnh này, đừng hủy: hãy nhắn ADS-Nolimit để được kiểm tra.',
    en: 'If you have ALREADY transferred money for this top-up, do not cancel it: contact ADS-Nolimit instead.',
  },
  cancelTopupYes: { vi: 'Có, hủy lệnh', en: 'Yes, cancel it' },
  topupCancelled: { vi: 'Đã hủy lệnh nạp.', en: 'Top-up cancelled.' },
  noTopups: { vi: 'Chưa có lệnh nạp nào.', en: 'No top-ups yet.' },
  viewQr: { vi: 'Xem mã QR', en: 'Show QR code' },
  noLedger: { vi: 'Chưa có giao dịch.', en: 'No transactions yet.' },
  balanceAfter: { vi: 'Số dư sau: {amount}', en: 'Balance after: {amount}' },
  refOrder: { vi: 'Đơn {id}', en: 'Order {id}' },
  refTopup: { vi: 'Lệnh nạp {code}', en: 'Top-up {code}' },
  prefillNote: {
    vi: 'Đã điền sẵn số tiền còn thiếu cho đơn bạn đang chọn.',
    en: 'We filled in the amount you still need for your order.',
  },
  updatedAt: { vi: 'Cập nhật {date}', en: 'Updated {date}' },

  // đơn hàng
  orderEmptyFiltered: { vi: 'Không có đơn nào ở trạng thái này.', en: 'No orders with this status.' },
  orderCode: { vi: 'Mã đơn', en: 'Order ID' },
  orderProduct: { vi: 'Dịch vụ', en: 'Service' },
  orderQty: { vi: 'Số lượng', en: 'Quantity' },
  orderUnit: { vi: 'Đơn giá', en: 'Unit price' },
  orderTotal: { vi: 'Thành tiền', en: 'Total' },
  orderStatus: { vi: 'Trạng thái', en: 'Status' },
  orderCreated: { vi: 'Thời gian đặt', en: 'Ordered' },
  orderUpdated: { vi: 'Cập nhật', en: 'Last update' },
  orderNote: { vi: 'Ghi chú của bạn', en: 'Your note' },
  orderAdAccount: { vi: 'Tài khoản quảng cáo', en: 'Ad account' },
  orderAdminNote: { vi: 'Ghi chú từ ADS-Nolimit', en: 'Note from ADS-Nolimit' },
  orderRefunded: { vi: 'Đã hoàn {amount} vào số dư lúc {date}.', en: '{amount} was refunded to your balance on {date}.' },
  orderPaidVia: { vi: 'Thanh toán bằng số dư', en: 'Paid from balance' },
  orderHelp: {
    vi: 'Cần hỗ trợ về đơn này? Nhắn ADS-Nolimit kèm mã đơn.',
    en: 'Need help with this order? Message ADS-Nolimit with the order ID.',
  },
  orderDetails: { vi: 'Chi tiết đơn hàng', en: 'Order details' },

  // dịch vụ
  pickPrompt: { vi: 'Chọn một dịch vụ để xem giá và đặt.', en: 'Choose a service to see prices and order.' },
  payWithBalance: { vi: 'Thanh toán bằng số dư', en: 'Pay from balance' },
  requestConsult: { vi: 'Gửi yêu cầu tư vấn', en: 'Request a consultation' },
  qty: { vi: 'Số lượng', en: 'Quantity' },
  decrease: { vi: 'Giảm', en: 'Decrease' },
  increase: { vi: 'Tăng', en: 'Increase' },
  total: { vi: 'Thành tiền', en: 'Total' },
  balanceNow: { vi: 'Số dư hiện tại', en: 'Current balance' },
  balanceAfterPay: { vi: 'Số dư sau thanh toán', en: 'Balance after payment' },
  deducted: { vi: 'Trừ {amount} từ số dư', en: '{amount} from your balance' },
  confirmPayTitle: { vi: 'Xác nhận thanh toán', en: 'Confirm payment' },
  confirmPay: { vi: 'Xác nhận thanh toán', en: 'Confirm payment' },
  busyPay: { vi: 'Đang thanh toán…', en: 'Paying…' },
  insufficient: {
    vi: 'Số dư chưa đủ. Bạn cần nạp thêm {short} để thanh toán đơn này.',
    en: 'Your balance is not enough. Top up {short} more to pay for this order.',
  },
  insufficientTitle: { vi: 'Số dư chưa đủ', en: 'Not enough balance' },
  topUpShort: { vi: 'Nạp {amount}', en: 'Top up {amount}' },
  unavailable: {
    vi: 'Dịch vụ này tạm chưa mở thanh toán bằng số dư. Bạn gửi yêu cầu tư vấn, ADS-Nolimit sẽ hỗ trợ ngay.',
    en: 'This service cannot be paid from your balance yet. Send a consultation request and ADS-Nolimit will help.',
  },
  paidOk: {
    vi: 'Đã thanh toán đơn {id}. ADS-Nolimit sẽ liên hệ để triển khai cho bạn.',
    en: 'Order {id} is paid. ADS-Nolimit will contact you to get started.',
  },
  payChanged: {
    vi: 'Số dư hoặc giá vừa thay đổi. Bạn kiểm tra lại rồi thử lần nữa.',
    en: 'Your balance or the price just changed. Please check and try again.',
  },
  budgetAmount: { vi: 'Số tiền nạp ngân sách', en: 'Budget amount' },
  adAccountId: { vi: 'ID tài khoản quảng cáo', en: 'Ad account ID' },
  adAccountName: { vi: 'Tên tài khoản quảng cáo', en: 'Ad account name' },
  adAccountRequired: {
    vi: 'Vui lòng nhập ID tài khoản quảng cáo (ít nhất 3 ký tự).',
    en: 'Please enter the ad account ID (at least 3 characters).',
  },
  budgetNote: { vi: 'Ghi chú cho ADS-Nolimit', en: 'Note for ADS-Nolimit' },
  quoteOnly: {
    vi: 'Gói này được báo giá theo nhu cầu. Gửi yêu cầu, ADS-Nolimit sẽ liên hệ tư vấn miễn phí.',
    en: 'This plan is quoted to fit your needs. Send a request and ADS-Nolimit will contact you, free of charge.',
  },
  orConsult: { vi: 'Chưa chắc gói nào hợp? Gửi yêu cầu tư vấn miễn phí.', en: 'Not sure which option fits? Ask for a free consultation.' },
  seeDetails: { vi: 'Xem chi tiết dịch vụ', en: 'See service details' },
  priceGuide: { vi: 'Giá tham khảo', en: 'Guide price' },

  // khóa học
  lessonsCount: { vi: '{n} bài học', en: '{n} lessons' },
  lessonsNone: { vi: 'Đang soạn bài học', en: 'Lessons in preparation' },
  unlockFor: { vi: 'Mở khóa · {price}', en: 'Unlock · {price}' },
  unlockFree: { vi: 'Học miễn phí', en: 'Start for free' },
  startLearning: { vi: 'Vào học', en: 'Start learning' },
  unlocked: { vi: 'Đã mở khóa', en: 'Unlocked' },
  locked: { vi: 'Chưa mở khóa', en: 'Locked' },
  free: { vi: 'Miễn phí', en: 'Free' },
  unlockTitle: { vi: 'Mở khóa "{title}"?', en: 'Unlock "{title}"?' },
  unlockBody: {
    vi: '{price} sẽ được trừ vào số dư. Bạn học lại không giới hạn số lần.',
    en: '{price} will be taken from your balance. Watch the lessons as often as you like.',
  },
  unlockYes: { vi: 'Mở khóa', en: 'Unlock' },
  unlockedOk: { vi: 'Đã mở khóa "{title}". Chúc bạn học tốt!', en: '"{title}" is unlocked. Enjoy the course!' },
  backToCourses: { vi: 'Tất cả khóa học', en: 'All courses' },
  courseNotFound: { vi: 'Không tìm thấy khóa học này.', en: 'We could not find this course.' },
  lessonNoVideo: { vi: 'Bài học này chưa có video.', en: 'This lesson has no video yet.' },
  lessonsLocked: { vi: 'Mở khóa để xem toàn bộ bài học.', en: 'Unlock the course to watch every lesson.' },
  lessonVideoUnsupported: {
    vi: 'Không phát được video này trên trang. Mở video trong tab mới:',
    en: 'This video cannot play here. Open it in a new tab:',
  },
  openVideo: { vi: 'Mở video', en: 'Open video' },
  nowPlaying: { vi: 'Đang xem', en: 'Now playing' },

  // hướng dẫn
  allCategories: { vi: 'Tất cả', en: 'All' },
  backToGuides: { vi: 'Tất cả hướng dẫn', en: 'All guides' },
  guideNotFound: { vi: 'Không tìm thấy bài hướng dẫn này.', en: 'We could not find this guide.' },
  guideVideo: { vi: 'Video hướng dẫn', en: 'Video walkthrough' },

  // key & máy
  revealKey: { vi: 'Hiện key', en: 'Show key' },
  hideKey: { vi: 'Ẩn key', en: 'Hide key' },
  keyPlan: { vi: 'Gói', en: 'Plan' },
  keyIssued: { vi: 'Ngày cấp', en: 'Issued' },
  keyMachines: { vi: 'Máy đã kích hoạt', en: 'Activated devices' },
  keyMachinesCount: { vi: '{used}/{max} máy', en: '{used}/{max} devices' },
  keyNoMachines: { vi: 'Chưa kích hoạt máy nào.', en: 'No devices activated yet.' },
  keyActivated: { vi: 'Kích hoạt {date}', en: 'Activated {date}' },
  keyReset: { vi: 'Yêu cầu đổi máy', en: 'Request a device reset' },
  keyResetTitle: { vi: 'Yêu cầu đổi máy cho key {key}', en: 'Device reset for key {key}' },
  keyResetBody: {
    vi: 'ADS-Nolimit sẽ gỡ các máy đã kích hoạt để bạn kích hoạt lại trên máy mới.',
    en: 'ADS-Nolimit will clear the activated devices so you can activate the key on a new one.',
  },
  keyResetNote: { vi: 'Lý do / máy mới (không bắt buộc)', en: 'Reason or new device (optional)' },
  keyResetSend: { vi: 'Gửi yêu cầu', en: 'Send request' },
  keyResetSent: { vi: 'Đã gửi yêu cầu đổi máy. ADS-Nolimit sẽ xử lý và báo lại bạn.', en: 'Request sent. ADS-Nolimit will handle it and let you know.' },
  keyResetPending: { vi: 'Yêu cầu đổi máy đang chờ xử lý (gửi {date}).', en: 'Device reset requested on {date}, pending.' },
  keyRevokedHelp: { vi: 'Key này đã bị thu hồi. Liên hệ ADS-Nolimit nếu cần hỗ trợ.', en: 'This key has been revoked. Contact ADS-Nolimit if you need help.' },

  // bảo mật / xóa tài khoản
  deleteBlocked: {
    vi: 'Tài khoản còn số dư {amount} nên chưa thể tự xóa. Bạn liên hệ ADS-Nolimit để được hỗ trợ xử lý số dư còn lại trước khi xóa tài khoản.',
    en: 'Your account still has a balance of {amount}, so it cannot be deleted yet. Contact ADS-Nolimit to settle the remaining balance first.',
  },
  deleteBlockedRule: {
    vi: 'Chưa xóa được vì tài khoản còn số dư. Bạn liên hệ ADS-Nolimit để được hỗ trợ.',
    en: 'Could not delete because your account still has a balance. Please contact ADS-Nolimit.',
  },
} satisfies Record<string, T>;

export type TextKey = keyof typeof text;

/** Chữ theo ngôn ngữ trang; thay {tên} bằng giá trị trong `vars`. */
export const tx = (key: TextKey, vars: Record<string, string | number> = {}): string =>
  text[key][pageLang()].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''));

/** Chữ theo khóa động (trạng thái…); không có thì trả lại `fallback`. */
export const txMaybe = (key: string, fallback: string): string =>
  key in text ? text[key as TextKey][pageLang()] : fallback;
