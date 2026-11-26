/**
 * Vẽ lời mời cài ứng dụng ở trang Tài khoản: thẻ mảnh ở Tổng quan và khối cố định ở Hồ sơ.
 * Chưa cài (chưa ở trong app) thì LUÔN có nút "Tải app" (thuộc tính `data-install-app`, xử lý chung ở src/scripts/install-entry.ts):
 * máy có sự kiện cài thì mở hộp cài của trình duyệt, máy khác thì mở bảng hướng dẫn theo nền tảng (install-sheet.ts).
 * Logic chọn dạng nằm ở install.ts (thuần, có test). Dạng `hidden` (đã cài / đang ở trong app / "Để sau") = không chèn gì vào DOM.
 */
import { h, icon } from '../ui/dom';
import { tx } from '../account/text';
import { currentInstallMode, snooze, watchInstall } from './install';
import type { InstallMode } from './install';

/** Dựng phần tử cho một dạng; null khi `hidden`. */
const build = (mode: InstallMode, where: 'card' | 'profile', redraw: () => void): HTMLElement | null => {
  if (mode === 'hidden') return null;
  const install = h('button', { type: 'button', class: 'btn btn-primary btn-sm install-entry', 'data-install-app': '' }, icon('download'), tx('installBtn'));
  const later = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-ghost btn-sm',
      onclick: () => {
        snooze();
        redraw();
      },
    },
    tx('installLater'),
  );
  // Nơi nào cũng nói đúng: không hứa "một lần bấm" cho máy không làm được (iPhone/iPad phải tự làm vài bước).
  const body = h('div', { class: 'install-text' }, h('p', { class: 'muted', text: tx('installBenefit') }), mode === 'prompt' ? null : h('p', { class: 'muted', text: tx('installHow') }));
  const actions = h('div', { class: 'install-actions' }, install, where === 'card' ? later : null);
  return h(
    'section',
    { class: `install-card install-card--${where} install-card--${mode}`, 'data-install': mode, 'aria-label': tx('installTitle') },
    h('span', { class: 'icon-tile', 'aria-hidden': 'true' }, icon('download')),
    h('div', { class: 'install-main' }, h('h3', { text: tx('installTitle') }), body),
    actions,
  );
};

/**
 * Giữ một khối cài ứng dụng được chèn bằng `place(el)` và tự gỡ khi `hidden`.
 * Vẽ lại khi sự kiện cài đến (trước hoặc sau khi mã này nạp), khi đã cài, khi khách bấm "Để sau".
 */
export const mountInstall = (where: 'card' | 'profile', place: (el: HTMLElement) => void) => {
  let current: HTMLElement | null = null;
  let lastMode: InstallMode | null = null;
  const redraw = () => {
    try {
      const mode = currentInstallMode(where);
      if (mode === lastMode && current?.isConnected) return; // không đổi dạng: giữ nguyên, khỏi nhấp nháy
      lastMode = mode;
      const next = build(mode, where, redraw);
      current?.remove();
      current = next;
      if (next) place(next);
    } catch {
      current?.remove();
      current = null;
      lastMode = null;
    }
  };
  watchInstall(redraw);
  return redraw;
};
