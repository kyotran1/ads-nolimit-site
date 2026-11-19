/**
 * Tiện ích giao diện nhỏ cho trang tài khoản và trang quản trị (trình duyệt).
 * Mọi chữ do người dùng nhập đều đưa vào bằng textContent (không innerHTML) để tránh chèn mã.
 */
import { iconPaths } from '../../components/icon-paths';
import type { IconName } from '../../components/icon-paths';

export const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

/** Tạo phần tử: h('button', { class: 'btn', type: 'button', onclick: fn }, 'Chữ', icon('copy')). */
export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]) => {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value as EventListener);
    else if (key === 'class') el.className = String(value);
    else if (key === 'text') el.textContent = String(value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
};

export const append = (el: Element, children: Child[]) => {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
  return el;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Icon nét (cùng bộ với Icon.astro). Nét vẽ là chuỗi cố định trong mã nguồn, không phải dữ liệu người dùng. */
export const icon = (name: IconName, className?: string): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);
  svg.innerHTML = iconPaths[name];
  return svg;
};

/** Chép chữ vào bộ nhớ tạm; trả về true nếu được. */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;left:-9999px;top:0' });
      ta.value = text;
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

/* ---------- Thông báo nổi (toast) ---------- */

let toastRegion: HTMLElement | null = null;

export const toast = (text: string, kind: 'success' | 'error' | 'info' = 'success') => {
  if (!toastRegion) {
    toastRegion = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRegion);
  }
  const item = h('div', { class: `toast toast--${kind}` }, icon(kind === 'error' ? 'info' : 'check'), h('span', { text }));
  toastRegion.append(item);
  window.setTimeout(() => {
    item.classList.add('is-out');
    window.setTimeout(() => item.remove(), 400);
  }, 3800);
};

/** Nút "Chép" cạnh một giá trị: đổi thành "Đã chép" 2 giây. */
export const copyButton = (value: () => string, labels: { copy: string; copied: string; failed: string }, aria?: string) => {
  const label = h('span', { text: labels.copy });
  const btn = h('button', { type: 'button', class: 'copy-btn', 'aria-label': aria ? `${labels.copy}: ${aria}` : undefined }, icon('copy'), label);
  btn.addEventListener('click', async () => {
    const ok = await copyText(value());
    label.textContent = ok ? labels.copied : labels.failed;
    btn.classList.toggle('is-done', ok);
    window.setTimeout(() => {
      label.textContent = labels.copy;
      btn.classList.remove('is-done');
    }, 2000);
  });
  return btn;
};

/** Hộp thoại xác nhận dùng <dialog>; trả về true khi bấm nút đồng ý. */
export const confirmDialog = (opts: {
  title: string;
  body?: (string | Node)[];
  confirm: string;
  cancel: string;
  danger?: boolean;
  /** Ô nhập bắt buộc (ví dụ lý do từ chối); trả về giá trị qua `value` */
  input?: { label: string; required?: boolean; maxlength?: number; multiline?: boolean; placeholder?: string };
}): Promise<{ ok: boolean; value: string }> =>
  new Promise((resolve) => {
    const dialog = h('dialog', { class: 'confirm-dialog', 'aria-labelledby': 'cd-title' });
    let field: HTMLInputElement | HTMLTextAreaElement | null = null;
    const error = h('p', { class: 'field-error', id: 'cd-error' });
    const form = h('form', { method: 'dialog', class: 'confirm-form' });
    form.append(h('h2', { id: 'cd-title', text: opts.title }));
    if (opts.body) form.append(h('div', { class: 'confirm-body' }, ...opts.body));
    if (opts.input) {
      field = opts.input.multiline
        ? h('textarea', { id: 'cd-input', rows: 3, maxlength: opts.input.maxlength ?? 300, placeholder: opts.input.placeholder, 'aria-describedby': 'cd-error' })
        : h('input', { id: 'cd-input', type: 'text', maxlength: opts.input.maxlength ?? 300, placeholder: opts.input.placeholder, 'aria-describedby': 'cd-error' });
      form.append(h('div', { class: 'field' }, h('label', { for: 'cd-input', text: opts.input.label }), field, error));
    }
    const yes = h('button', { type: 'submit', value: 'ok', class: `btn ${opts.danger ? 'btn-danger-solid' : 'btn-primary'}`, text: opts.confirm });
    const no = h('button', { type: 'button', class: 'btn btn-ghost', text: opts.cancel });
    form.append(h('div', { class: 'confirm-actions' }, no, yes));
    dialog.append(form);
    document.body.append(dialog);
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      const value = field?.value.trim() ?? '';
      dialog.close();
      dialog.remove();
      resolve({ ok, value });
    };
    no.addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', () => finish(false));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (opts.input?.required && field && !field.value.trim()) {
        error.textContent = opts.input.label;
        field.setAttribute('aria-invalid', 'true');
        field.focus();
        return;
      }
      finish(true);
    });
    dialog.showModal();
    (field ?? yes).focus();
  });

/** Chuyển Firestore Timestamp / Date / không có → Date | null. */
export const toDate = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  const t = v as { toDate?: () => Date } | null;
  return t && typeof t.toDate === 'function' ? t.toDate() : null;
};
