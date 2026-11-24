/**
 * Khi khách rời trang (chuyển sang app ngân hàng, khóa máy…) rồi quay lại sau một lúc, số dư và báo cáo
 * trên màn hình có thể đã cũ. Ứng dụng đã cài không có nút tải lại như trình duyệt, nên trang tự tải lại số liệu.
 * Hàm thuần để test: firebase/test/unit-pwa-refresh.test.mjs
 */
export const REFRESH_AFTER_MS = 5 * 60 * 1000;

/** `hiddenAt` = lúc trang bị ẩn (0 = chưa từng ẩn). Chỉ làm mới khi đã ẩn đủ lâu và đang có mạng. */
export function shouldRefresh(hiddenAt: number, now: number, online: boolean): boolean {
  return online && hiddenAt > 0 && now - hiddenAt >= REFRESH_AFTER_MS;
}
