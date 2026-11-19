/**
 * Ngân hàng nhận chuyển khoản VietQR — mã BIN theo danh sách Napas (6 chữ số, đầu 970…).
 * Dùng ở trang /quan-tri/ (chủ chọn ngân hàng nhận tiền) và để hiện tên ngân hàng trên trang Nạp tiền.
 *
 * Ngân hàng không có trong danh sách: ở /quan-tri/ chọn "Ngân hàng khác" rồi nhập mã BIN 6 số.
 * Trước khi mở nạp tiền cho khách, chủ nên tự quét thử mã QR bằng app ngân hàng của mình.
 */
export interface Bank {
  bin: string;
  /** Tên ngắn hiển thị */
  short: string;
  /** Tên đầy đủ */
  name: string;
}

export const banks: readonly Bank[] = [
  { bin: '970436', short: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
  { bin: '970415', short: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam' },
  { bin: '970418', short: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
  { bin: '970405', short: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
  { bin: '970407', short: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam' },
  { bin: '970422', short: 'MB Bank', name: 'Ngân hàng TMCP Quân đội' },
  { bin: '970416', short: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { bin: '970432', short: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { bin: '970423', short: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { bin: '970403', short: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { bin: '970441', short: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
  { bin: '970437', short: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP. Hồ Chí Minh' },
  { bin: '970443', short: 'SHB', name: 'Ngân hàng TMCP Sài Gòn – Hà Nội' },
  { bin: '970448', short: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  { bin: '970426', short: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam' },
  { bin: '970440', short: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á' },
  { bin: '970431', short: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam' },
  { bin: '970449', short: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
  { bin: '970428', short: 'Nam A Bank', name: 'Ngân hàng TMCP Nam Á' },
];

export const bankByBin = (bin: string): Bank | undefined => banks.find((b) => b.bin === bin);
