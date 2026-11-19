/**
 * Mã VietQR chuyển khoản (chuẩn EMVCo / Napas), tạo NGAY TRÊN TRÌNH DUYỆT — không gửi gì cho dịch vụ bên ngoài.
 *
 * Cấu trúc (mỗi trường: mã 2 số + độ dài 2 số + giá trị):
 *   00 "01"                       phiên bản
 *   01 "12" (có số tiền) / "11"   mã động / tĩnh
 *   38 thông tin người nhận:      00 "A000000727" (Napas) · 01 { 00 mã BIN ngân hàng · 01 số tài khoản } · 02 "QRIBFTTA" (chuyển tới tài khoản)
 *   53 "704"                      tiền Việt Nam
 *   54 số tiền                    (số nguyên VNĐ)
 *   58 "VN"
 *   62 { 08 nội dung chuyển khoản }
 *   63 CRC16-CCITT (0x1021, khởi tạo 0xFFFF) tính trên toàn chuỗi kể cả "6304"
 *
 * Không import gì lúc chạy (bộ test e2e cũng dùng được).
 */

const tlv = (id: string, value: string): string => {
  if (value.length > 99) throw new Error(`VietQR: trường ${id} dài quá 99 ký tự`);
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
};

/** CRC-16/CCITT-FALSE trên các byte UTF-8 của chuỗi; trả về 4 ký tự hex in hoa. */
export const crc16 = (input: string): string => {
  const bytes = new TextEncoder().encode(input);
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

/** Bỏ dấu tiếng Việt, chỉ giữ chữ in hoa, số và khoảng trắng (nội dung chuyển khoản / tên chủ tài khoản). */
export const plainUpper = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9 .-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface VietQrInput {
  /** Mã BIN ngân hàng (Napas), 6 chữ số */
  bin: string;
  /** Số tài khoản nhận, chỉ chữ số */
  account: string;
  /** Số tiền VNĐ (số nguyên dương); bỏ trống = mã tĩnh, người chuyển tự nhập */
  amount?: number;
  /** Nội dung chuyển khoản (chữ in hoa không dấu, tối đa 50 ký tự) */
  content?: string;
}

export const isValidBin = (bin: string) => /^\d{6}$/.test(bin);
export const isValidAccount = (account: string) => /^\d{6,19}$/.test(account);

export const buildVietQr = ({ bin, account, amount, content }: VietQrInput): string => {
  if (!isValidBin(bin)) throw new Error('VietQR: mã BIN ngân hàng phải có 6 chữ số');
  if (!isValidAccount(account)) throw new Error('VietQR: số tài khoản phải gồm 6–19 chữ số');
  if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0 || amount > 9_999_999_999_999))
    throw new Error('VietQR: số tiền không hợp lệ');
  const text = content ? plainUpper(content).slice(0, 50) : '';

  const beneficiary = tlv('00', bin) + tlv('01', account);
  const merchant = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
  let payload =
    tlv('00', '01') +
    tlv('01', amount ? '12' : '11') +
    tlv('38', merchant) +
    tlv('53', '704') +
    (amount ? tlv('54', String(amount)) : '') +
    tlv('58', 'VN') +
    (text ? tlv('62', tlv('08', text)) : '');
  payload += '6304';
  return payload + crc16(payload);
};

/** Tách chuỗi TLV thành { mã: giá trị } (một cấp). */
export const parseTlv = (s: string): Record<string, string> => {
  const out: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= s.length) {
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!Number.isFinite(len)) throw new Error('VietQR: độ dài trường sai');
    out[id] = s.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  if (i !== s.length) throw new Error('VietQR: chuỗi bị cắt');
  return out;
};

/** Kiểm tra mã CRC ở cuối chuỗi VietQR. */
export const checkCrc = (payload: string): boolean =>
  payload.length > 8 && payload.slice(-8, -4) === '6304' && crc16(payload.slice(0, -4)) === payload.slice(-4);
