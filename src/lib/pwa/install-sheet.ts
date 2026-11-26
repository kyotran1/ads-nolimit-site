/**
 * Bảng hướng dẫn "Tải app" dùng chung cho mọi trang (tải chậm khi khách bấm nút có `data-install-app`, xem src/scripts/install-entry.ts).
 * <dialog> dạng tấm trượt từ dưới lên trên điện thoại, hộp giữa màn hình trên máy tính.
 * Không hình ảnh ngoài, không gọi mạng. Chữ: install-sheet-text.ts. Kiểu dáng: styles/install-sheet.css (tiền tố isheet-).
 */
import '../../styles/install-sheet.css';
import { h, icon } from '../ui/dom';
import { installPlatform } from './install';
import { chromeUrl, safariUrl, sheetContent, sheetUi, splitStep } from './install-sheet-text';
import type { Glyph, Lang } from './install-sheet-text';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Nét vẽ các nút thật của trình duyệt, để khách nhận ra đúng nút cần bấm. */
const GLYPH_PATHS: Record<Glyph, string> = {
  // Chia sẻ của Safari: ô vuông hở miệng + mũi tên lên
  share: '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1"/>',
  // ⋯ ba chấm ngang trong vòng tròn (Safari iOS 26)
  dots: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="12" r="0.9" fill="currentColor"/><circle cx="12" cy="12" r="0.9" fill="currentColor"/><circle cx="16" cy="12" r="0.9" fill="currentColor"/>',
  // ⋮ ba chấm dọc (Chrome, Edge, Samsung…)
  dotsv: '<circle cx="12" cy="5.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="18.5" r="1.3" fill="currentColor"/>',
  // ô vuông có dấu cộng: "Thêm vào MH chính"
  addhome: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/>',
  // biểu tượng cài ⊕ trên thanh địa chỉ máy tính (màn hình + mũi tên xuống)
  install: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 7.5v5"/><path d="m9.5 10.5 2.5 2.5 2.5-2.5"/><path d="M8 20h8"/>',
};

const glyph = (g: Glyph): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `isheet-glyph isheet-glyph--${g}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = GLYPH_PATHS[g];
  return svg;
};

const pageLang = (): Lang => (document.documentElement.lang === 'en' ? 'en' : 'vi');
const currentPath = (): string => location.pathname + location.search;

const copyHref = async (): Promise<boolean> => {
  const href = location.href;
  try {
    await navigator.clipboard.writeText(href);
    return true;
  } catch {
    try {
      const ta = h('textarea', { 'aria-hidden': 'true', readonly: 'true', style: 'position:fixed;left:-9999px;top:0' });
      ta.value = href;
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
};

let toastTimer = 0;
/** Thông báo nhỏ ở cuối màn hình (tự tắt sau vài giây). */
export const showToast = (message: string) => {
  document.querySelector('.isheet-toast')?.remove();
  window.clearTimeout(toastTimer);
  const el = h('div', { class: 'isheet-toast', role: 'status', text: message });
  document.body.append(el);
  toastTimer = window.setTimeout(() => el.remove(), 5000);
};

/** Khách vừa chấp nhận hộp cài của trình duyệt. */
export const showInstalled = () => showToast(sheetUi(pageLang()).installed);

/** Mở bảng hướng dẫn theo nền tảng của khách. Đang mở rồi thì không mở thêm. */
export const openInstallSheet = () => {
  if (document.querySelector('dialog.isheet')) return;
  const lang = pageLang();
  const platform = installPlatform(navigator.userAgent, navigator.maxTouchPoints || 0);
  const c = sheetContent(platform, lang);
  const ui = sheetUi(lang);

  const dlg = h('dialog', { class: 'isheet', 'data-platform': platform, 'aria-labelledby': 'isheet-title' });
  const close = () => {
    if (dlg.open) dlg.close();
    dlg.remove();
  };
  dlg.addEventListener('close', () => dlg.remove());
  // Bấm ra ngoài hộp (vào lớp nền của <dialog>) thì đóng
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();
  });

  const steps = h(
    'ol',
    { class: 'isheet-steps', 'aria-label': ui.stepsLabel },
    ...c.steps.map((step) =>
      h(
        'li',
        {},
        h('span', { class: 'isheet-num', 'aria-hidden': 'true' }),
        h('span', { class: 'isheet-step-text' }, ...splitStep(step).map((part) => (typeof part === 'string' ? part : glyph(part.glyph)))),
      ),
    ),
  );

  const actions: HTMLElement[] = [];
  if (c.open === 'safari') actions.push(h('a', { class: 'btn btn-primary isheet-open', href: safariUrl(currentPath()) }, icon('external'), ui.openSafari));
  if (c.open === 'chrome') actions.push(h('a', { class: 'btn btn-primary isheet-open', href: chromeUrl(currentPath()) }, icon('external'), ui.openChrome));
  if (c.copy) {
    const copyBtn = h('button', { type: 'button', class: 'btn isheet-copy' }, icon('copy'), h('span', { text: ui.copy }));
    copyBtn.addEventListener('click', async () => {
      const ok = await copyHref();
      copyBtn.querySelector('span')!.textContent = ok ? ui.copied : ui.copyFailed;
      copyBtn.classList.toggle('is-done', ok);
    });
    actions.push(copyBtn);
  }
  actions.push(h('button', { type: 'button', class: `btn ${actions.length ? '' : 'btn-primary'} isheet-got`, onclick: close }, ui.got));

  dlg.append(
    h(
      'div',
      { class: 'isheet-box' },
      h('div', { class: 'isheet-handle', 'aria-hidden': 'true' }),
      h(
        'div',
        { class: 'isheet-head' },
        h('img', { class: 'isheet-icon', src: '/icon-192.png', width: '56', height: '56', alt: '' }),
        h('h2', { id: 'isheet-title', class: 'isheet-title', text: c.title }),
      ),
      h('p', { class: 'isheet-lead', text: c.lead }),
      steps,
      c.note ? h('p', { class: 'isheet-note', text: c.note }) : null,
      h('div', { class: 'isheet-actions' }, ...actions),
      h('p', { class: 'isheet-already', text: ui.already }),
    ),
  );
  document.body.append(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
};
