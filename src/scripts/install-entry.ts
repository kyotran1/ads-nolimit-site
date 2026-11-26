/**
 * Mọi phần tử có thuộc tính `data-install-app` là nút "Tải app" (thanh đầu trang, menu, Tài khoản, chân trang).
 * Bấm nút:
 *  - Có sự kiện cài của trình duyệt (window.__adsnlInstall, do PwaHead.astro giữ): gọi `.prompt()` NGAY trong lúc bấm
 *    (không mở bảng trước, để giữ "user gesture"). Khách chấp nhận → báo "Đã cài". Khách từ chối → không làm gì thêm.
 *    Hộp cài lỗi / không mở được → mở bảng hướng dẫn.
 *  - Không có sự kiện (iPhone/iPad, trình duyệt không hỗ trợ, đã từ chối gần đây…): mở bảng hướng dẫn theo nền tảng.
 * Bảng hướng dẫn (và chữ, kiểu dáng của nó) chỉ tải khi cần: src/lib/pwa/install-sheet.ts.
 * Đang ở trong app đã cài (hoặc vừa cài xong): gắn `data-pwa` lên <html>, CSS ẩn mọi `.install-entry`.
 */
import { CHANGED, installHidden, tryPrompt } from '../lib/pwa/install';
// Nạp thẳng (không tải chậm): nếu tải chậm, khách để tab mở qua một lần cập nhật web thì tệp cũ đã bị xóa → bấm không có gì xảy ra.
import { openInstallSheet, showInstalled } from '../lib/pwa/install-sheet';

const syncHidden = () => {
  try {
    if (installHidden()) document.documentElement.setAttribute('data-pwa', '1');
  } catch {
    /* bỏ qua */
  }
};

const openSheet = () => {
  try {
    openInstallSheet();
  } catch {
    /* lỗi bất ngờ khi dựng bảng: tải lại trang để lần bấm sau chạy với mã mới nhất */
    location.reload();
  }
};

const onEntry = async () => {
  const result = await tryPrompt(); // `.prompt()` được gọi đồng bộ bên trong, trước mọi await
  if (result === 'accepted') {
    syncHidden();
    try {
      showInstalled();
    } catch {
      /* bỏ qua */
    }
  } else if (result === 'none' || result === 'error') {
    openSheet();
  }
};

document.addEventListener('click', (event) => {
  const target = event.target;
  const btn = target instanceof Element ? target.closest('[data-install-app]') : null;
  if (!btn) return;
  event.preventDefault();
  // Nút nằm trong menu điện thoại: đóng menu trước
  btn.closest('details[data-dismissable]')?.removeAttribute('open');
  void onEntry();
});

syncHidden();
window.addEventListener(CHANGED, syncHidden);
window.addEventListener('appinstalled', () => document.documentElement.setAttribute('data-pwa', '1'));
try {
  window.matchMedia('(display-mode: standalone)').addEventListener('change', syncHidden);
} catch {
  /* trình duyệt cũ */
}
