/**
 * ANALYTICS / META PIXEL — MẶC ĐỊNH TẮT.
 *
 * Chưa gắn mã nào. Khi muốn bật:
 *   1. Điền ID vào `googleAnalyticsId` (dạng "G-XXXXXXXXXX") và/hoặc `metaPixelId` (dãy số).
 *   2. Đổi `enabled` thành `true`.
 *   3. Cập nhật trang /chinh-sach-bao-mat/ (mục "Cookie & công cụ đo lường")
 *      để nói rõ site đang dùng công cụ nào, vì sao.
 *
 * Khi `enabled` là false hoặc ID để trống, site không tải bất kỳ script đo lường nào.
 */
export const analytics = {
  enabled: false,
  googleAnalyticsId: '',
  metaPixelId: '',
} as const;
