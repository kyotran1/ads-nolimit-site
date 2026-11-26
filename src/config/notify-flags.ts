/**
 * Cờ bật thẻ Messenger trong mục "Thông báo" (Email và Zalo luôn hiện). Đọc từ biến lúc build, mặc định TẮT.
 *   PUBLIC_MESSENGER_NOTIFY = off (mặc định) | test | on
 *     off  : không có thẻ Messenger trong trang, cũng không có mã Messenger nào chạy (không "Sắp có");
 *     test : thẻ chỉ hiện trên trình duyệt đã bật chế độ thử (mở /tai-khoan/?tbtest=1 một lần, ?tbtest=0 để tắt;
 *            lưu localStorage 'adsnl-tbtest'). Chưa bật thì y như "off";
 *     on   : hiện cho mọi khách (sau khi Meta + Apps Script đã cấu hình xong).
 * Tệp này không nạp gì khác nên Node chạy test được (--experimental-strip-types); trong Node không có import.meta.env → "off".
 */
export type MessengerMode = 'off' | 'test' | 'on';

/** Giá trị lạ / thiếu → 'off' (an toàn). */
export const parseMessengerMode = (raw: unknown): MessengerMode => (raw === 'on' || raw === 'test' ? raw : 'off');

export const messengerMode: MessengerMode = parseMessengerMode((import.meta as { env?: Record<string, string | undefined> }).env?.PUBLIC_MESSENGER_NOTIFY);

/** Khóa localStorage lưu chế độ thử. */
export const NOTIFY_TEST_KEY = 'adsnl-tbtest';

/**
 * Quyết định hiện thẻ Messenger ở chế độ thử: ?tbtest=1 bật (và ghi nhớ), ?tbtest=0 tắt (và xóa),
 * không có thì theo giá trị đã ghi. `write`: '1' = ghi, 'remove' = xóa, null = không đổi.
 */
export const notifyTestDecision = (search: string, stored: string | null): { enabled: boolean; write: '1' | 'remove' | null } => {
  const param = /(?:^|[?&])tbtest=([^&]*)/.exec(search)?.[1];
  if (param === '1') return { enabled: true, write: '1' };
  if (param === '0') return { enabled: false, write: 'remove' };
  return { enabled: stored === '1', write: null };
};

/** Thẻ Messenger có hiện cho khách này không, và có cần ghi/xóa khóa thử không (thuần, không chạm trình duyệt). */
export const messengerDecision = (mode: MessengerMode, search: string, stored: string | null): { show: boolean; write: '1' | 'remove' | null } => {
  if (mode === 'on') return { show: true, write: null };
  if (mode === 'off') return { show: false, write: null };
  const d = notifyTestDecision(search, stored);
  return { show: d.enabled, write: d.write };
};
