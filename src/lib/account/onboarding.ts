/**
 * Hộp thoại "Hoàn thiện hồ sơ" — hiện sau khi vừa tạo tài khoản (?welcome=…) hoặc khi hồ sơ chưa có tên hiển thị.
 * Một bước: tên hiển thị (bắt buộc), ảnh đại diện (tùy chọn, thu nhỏ trên máy), điện thoại/Zalo (tùy chọn). "Để sau" ẩn trong phiên.
 */
import type { User } from 'firebase/auth';
import { dataErrorMessage } from '../auth/messages';
import { initialOf, nameOf } from '../auth/user-cache';
import { fileToAvatarDataUrl } from '../ui/avatar-image';
import { h } from '../ui/dom';
import { lang } from './ctx';
import { saveBasics } from './profile';

const T = {
  vi: {
    title: 'Hoàn thiện hồ sơ của bạn',
    lead: 'Tên và ảnh giúp ADS-Nolimit nhận ra bạn khi hỗ trợ. Chỉ mất một phút.',
    avatar: 'Ảnh đại diện (không bắt buộc)',
    pick: 'Chọn ảnh',
    remove: 'Bỏ ảnh',
    name: 'Tên hiển thị',
    phone: 'Số điện thoại / Zalo (không bắt buộc)',
    start: 'Bắt đầu',
    later: 'Để sau',
    saving: 'Đang lưu…',
    nameRequired: 'Vui lòng nhập tên hiển thị.',
    nameLong: 'Tên tối đa 60 ký tự.',
    phoneInvalid: 'Số điện thoại chưa đúng.',
    unreadable: 'Không đọc được ảnh. Chọn ảnh JPG hoặc PNG khác.',
    tooLarge: 'Ảnh quá phức tạp để thu nhỏ. Chọn ảnh khác.',
  },
  en: {
    title: 'Complete your profile',
    lead: 'Your name and photo help ADS-Nolimit recognise you when we support you. It takes a minute.',
    avatar: 'Profile photo (optional)',
    pick: 'Choose photo',
    remove: 'Remove',
    name: 'Display name',
    phone: 'Phone / Zalo / WhatsApp (optional)',
    start: 'Get started',
    later: 'Later',
    saving: 'Saving…',
    nameRequired: 'Please enter a display name.',
    nameLong: 'Name must be 60 characters or fewer.',
    phoneInvalid: 'That phone number does not look right.',
    unreadable: 'Could not read that image. Choose another JPG or PNG.',
    tooLarge: 'That image is too complex to shrink. Choose another.',
  },
}[lang];

const SKIP_KEY = 'adsnl-ob-skip';
let shown = false;

const skipped = () => {
  try {
    return sessionStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
};

/** Hiện hộp thoại nếu chưa hiện trong phiên và khách chưa bấm "Để sau". */
export const maybeOnboard = (user: User, profile: { displayName: string; phone: string; avatar: string }) => {
  if (shown || skipped() || document.querySelector('dialog.ob-dialog')) return;
  shown = true;

  let avatar: string | null = null; // null = giữ nguyên
  const current = () => (avatar ?? profile.avatar) || (user.photoURL && /^https:\/\//.test(user.photoURL) ? user.photoURL : '');
  const name0 = profile.displayName || (user.displayName ?? '').trim();

  const avatarBox = h('div', { class: 'avatar avatar--lg', id: 'ob-avatar', 'aria-hidden': 'true' });
  const file = h('input', { id: 'ob-avatar-file', type: 'file', accept: 'image/*', class: 'visually-hidden', tabindex: -1 }) as HTMLInputElement;
  const pick = h('button', { type: 'button', class: 'btn btn-sm', id: 'ob-avatar-pick', text: T.pick });
  const remove = h('button', { type: 'button', class: 'btn btn-sm btn-ghost', id: 'ob-avatar-remove', text: T.remove });
  const avErr = h('p', { class: 'field-error', id: 'ob-avatar-err', role: 'alert' });
  const drawAvatar = () => {
    avatarBox.replaceChildren(document.createTextNode(initialOf(name.value.trim() || nameOf(user))));
    const src = current();
    if (src) {
      const img = document.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.src = src;
      avatarBox.replaceChildren(img);
    }
    remove.hidden = !(avatar ?? profile.avatar);
  };
  pick.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    avErr.textContent = '';
    pick.disabled = true;
    try {
      avatar = await fileToAvatarDataUrl(f);
      drawAvatar();
    } catch (err) {
      avErr.textContent = (err as Error)?.message === 'too-large' ? T.tooLarge : T.unreadable;
    } finally {
      pick.disabled = false;
    }
  });
  remove.addEventListener('click', () => {
    avatar = '';
    drawAvatar();
  });

  const name = h('input', { id: 'ob-name', type: 'text', autocomplete: 'name', maxlength: 60, value: name0, required: true, 'aria-describedby': 'ob-name-err' }) as HTMLInputElement;
  const nameErr = h('p', { class: 'field-error', id: 'ob-name-err' });
  const phone = h('input', { id: 'ob-phone', type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: 20, value: profile.phone }) as HTMLInputElement;
  const phoneErr = h('p', { class: 'field-error', id: 'ob-phone-err' });
  const alert = h('p', { class: 'auth-alert', id: 'ob-alert', role: 'alert' });
  const start = h('button', { type: 'submit', class: 'btn btn-primary', id: 'ob-start', text: T.start });
  const later = h('button', { type: 'button', class: 'btn btn-ghost', id: 'ob-later', text: T.later });

  const form = h(
    'form',
    { class: 'ob-form', novalidate: true },
    h('div', { class: 'p-avatar-row' }, avatarBox, h('div', { class: 'p-avatar-text' }, h('p', { class: 'p-avatar-label', text: T.avatar }), h('div', { class: 'p-avatar-actions' }, file, pick, remove), avErr)),
    h('div', { class: 'field' }, h('label', { for: 'ob-name', text: T.name }), name, nameErr),
    h('div', { class: 'field' }, h('label', { for: 'ob-phone', text: T.phone }), phone, phoneErr),
    alert,
    h('div', { class: 'confirm-actions' }, later, start),
  );
  const dialog = h('dialog', { class: 'confirm-dialog ob-dialog', 'aria-labelledby': 'ob-title' }, h('div', { class: 'ob-body' }, h('h2', { id: 'ob-title', text: T.title }), h('p', { class: 'muted', text: T.lead }), form));
  name.addEventListener('input', () => {
    name.removeAttribute('aria-invalid');
    nameErr.textContent = '';
    drawAvatar();
  });
  phone.addEventListener('input', () => {
    phone.removeAttribute('aria-invalid');
    phoneErr.textContent = '';
  });

  const close = () => {
    if (dialog.open) dialog.close();
    dialog.remove();
  };
  later.addEventListener('click', () => {
    try {
      sessionStorage.setItem(SKIP_KEY, '1');
    } catch {
      /* bỏ qua */
    }
    close();
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    later.click();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = name.value.trim().replace(/\s+/g, ' ');
    name.value = n;
    const p = phone.value.trim().replace(/\s+/g, ' ');
    phone.value = p;
    let bad = false;
    if (!n || n.length > 60) {
      nameErr.textContent = !n ? T.nameRequired : T.nameLong;
      name.setAttribute('aria-invalid', 'true');
      bad = true;
    }
    const digits = p.replace(/\D/g, '').length;
    if (p && !(/^[0-9+() .-]*$/.test(p) && p.length <= 20 && digits >= 8 && digits <= 15)) {
      phoneErr.textContent = T.phoneInvalid;
      phone.setAttribute('aria-invalid', 'true');
      bad = true;
    }
    if (bad) {
      (nameErr.textContent ? name : phone).focus();
      return;
    }
    start.disabled = true;
    later.disabled = true;
    start.textContent = T.saving;
    alert.textContent = '';
    try {
      await saveBasics({ displayName: n, phone: p, avatar });
      close();
    } catch (err) {
      alert.textContent = dataErrorMessage(err);
      start.disabled = false;
      later.disabled = false;
      start.textContent = T.start;
    }
  });

  document.body.append(dialog);
  drawAvatar();
  dialog.showModal();
  name.focus();
};
