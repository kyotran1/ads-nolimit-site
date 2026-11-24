/**
 * Vẽ lời mời cài ứng dụng: thẻ mảnh ở Tổng quan và khối cố định ở Hồ sơ.
 * Logic chọn dạng nằm ở install.ts (thuần, có test). Dạng `hidden` = không chèn gì vào DOM.
 */
import { h, icon } from '../ui/dom';
import { tx } from '../account/text';
import { currentInstallMode, promptInstall, snooze, watchInstall } from './install';
import type { InstallMode } from './install';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Biểu tượng nút Chia sẻ của Safari (ô vuông hở miệng + mũi tên lên), tự vẽ. */
const shareIcon = () => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'install-share');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1"/>';
  return svg;
};

const iosSteps = () => {
  const [before, after = ''] = tx('installIosStep1', { icon: '\u0000' }).split('\u0000');
  return h(
    'ol',
    { class: 'install-steps' },
    h('li', {}, before, shareIcon(), after),
    h('li', { text: tx('installIosStep2') }),
  );
};

/** Dựng phần tử cho một dạng; null khi `hidden`. */
const build = (mode: InstallMode, where: 'card' | 'profile', redraw: () => void): HTMLElement | null => {
  if (mode === 'hidden') return null;
  const install = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary btn-sm',
      onclick: async () => {
        await promptInstall();
        redraw();
      },
    },
    icon('download'),
    tx('installBtn'),
  );
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
  const body =
    mode === 'prompt'
      ? h('p', { class: 'install-text muted', text: tx('installBenefit') })
      : mode === 'ios'
        ? h('div', { class: 'install-text' }, h('p', { class: 'muted', text: tx('installIosLead') }), iosSteps())
        : // Trình duyệt không đưa lời mời cài: hoặc chưa hỗ trợ, hoặc app ĐÃ cài (khi đó trình duyệt không mời nữa) → nói rõ cả hai trường hợp.
          h('div', { class: 'install-text' }, h('p', { class: 'muted', text: tx('installManual') }), h('p', { class: 'muted', text: tx('installManualHave') }));
  const actions = h('div', { class: 'install-actions' }, mode === 'prompt' ? install : null, where === 'card' ? later : null);
  return h(
    'section',
    { class: `install-card install-card--${where} install-card--${mode}`, 'data-install': mode, 'aria-label': tx('installTitle') },
    h('span', { class: 'icon-tile', 'aria-hidden': 'true' }, icon('download')),
    h('div', { class: 'install-main' }, h('h3', { text: tx('installTitle') }), body),
    actions.childElementCount ? actions : null,
  );
};

/**
 * Giữ một khối cài ứng dụng được chèn bằng `place(el)` và tự gỡ khi `hidden`.
 * Vẽ lại khi sự kiện cài đến (trước hoặc sau khi mã này nạp), khi đã cài, khi khách bấm.
 */
export const mountInstall = (where: 'card' | 'profile', place: (el: HTMLElement) => void) => {
  let current: HTMLElement | null = null;
  const redraw = () => {
    try {
      const next = build(currentInstallMode(where), where, redraw);
      current?.remove();
      current = next;
      if (next) place(next);
    } catch {
      current?.remove();
      current = null;
    }
  };
  watchInstall(redraw);
  return redraw;
};
