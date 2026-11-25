/** Lệnh nạp nào quản trị được xóa — phải khớp luật Firestore (`adminDeletesAdTopup`, `topups` delete). Thuần, có test đơn vị. */

const DELETABLE = ['pending', 'cancelled', 'rejected'];

/** Lệnh nạp ngân sách TKQC: chưa nhận tiền, hệ thống chưa thấy tiền về, chưa đụng tới trang tính. */
export const canDeleteAdTopup = (t: { status: string; hasWritten: boolean; paidAmount: number; sepayId: string }): boolean =>
  DELETABLE.includes(t.status) && !t.hasWritten && !(t.paidAmount > 0) && !t.sepayId;

/** Lệnh nạp ví: mọi lệnh chưa duyệt (chưa cộng số dư). */
export const canDeleteWalletTopup = (status: string): boolean => DELETABLE.includes(status);

/** Nút "Xóa hết lệnh đã từ chối và đã hủy": không gồm lệnh đang chờ (khách có thể sắp chuyển khoản). */
export const bulkDeletable = (status: string): boolean => status === 'rejected' || status === 'cancelled';
