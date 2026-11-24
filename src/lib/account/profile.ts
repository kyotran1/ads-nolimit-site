/**
 * Hồ sơ khách (Firestore users/{uid}): tên hiển thị, điện thoại/Zalo, công ty, ngành hàng, nhận tin AI Office.
 * V4: lưu kèm email đăng nhập (để chủ tìm khách ở /quan-tri/); lần đầu vào trang tự tạo hồ sơ tối thiểu.
 */
import { updateProfile } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore/lite';
import type { DocumentData } from 'firebase/firestore/lite';
import { clearOnInput, fieldError, focusFirstInvalid, say, setBusy } from '../auth/client';
import { authErrorMessage, dataErrorMessage, m } from '../auth/messages';
import { initialOf, nameOf, setProfileAvatar, writeUserCache } from '../auth/user-cache';
import { byId } from '../ui/dom';
import { fileToAvatarDataUrl } from '../ui/avatar-image';
import { maybeOnboard } from './onboarding';

import { lang, me, register } from './ctx';
import { db } from './store';

const MAX_NAME = 60;
const MAX_TEXT = 120;
const MAX_PHONE = 20;

/** Hồ sơ users/{uid} đã có chưa (null = chưa biết vì tải lỗi). */
let profileExists: boolean | null = null;
let loadedOnce = false;
/** Gọi lại khi đổi tên (để cập nhật menu bên trái, lời chào). */
let onRenamed: (user: User) => void = () => {};

const form = byId<HTMLFormElement>('profile-form');
const pName = byId<HTMLInputElement>('p-name');
const pPhone = byId<HTMLInputElement>('p-phone');
const pCompany = byId<HTMLInputElement>('p-company');
const pIndustry = byId<HTMLInputElement>('p-industry');
const pNews = byId<HTMLInputElement>('p-news');
const alertBox = byId('profile-alert');
const statusBox = byId('profile-status');
const avatarBox = byId('p-avatar');
const avatarFile = byId<HTMLInputElement>('p-avatar-file');
const avatarPick = byId<HTMLButtonElement>('p-avatar-pick');
const avatarRemove = byId<HTMLButtonElement>('p-avatar-remove');
const avatarErr = byId('p-avatar-err');

const AV = {
  vi: {
    unreadable: 'Không đọc được ảnh. Chọn ảnh JPG hoặc PNG khác.',
    tooLarge: 'Ảnh quá phức tạp để thu nhỏ. Chọn ảnh khác.',
  },
  en: { unreadable: 'Could not read that image. Choose another JPG or PNG.', tooLarge: 'That image is too complex to shrink. Choose another.' },
}[lang];

/* ---------- Ảnh đại diện (data URL nhỏ, lưu trong users/{uid}.avatar) ---------- */

/** Ảnh đã lưu trong hồ sơ ('' = không có). */
let savedAvatar = '';
/** Ảnh đang chọn chờ lưu (null = chưa đổi; '' = xóa). */
let pendingAvatar: string | null = null;

export const avatarUrl = () => (pendingAvatar ?? savedAvatar) || '';

const drawAvatar = () => {
  const user = me();
  const src = avatarUrl() || (user?.photoURL && /^https:\/\//.test(user.photoURL) ? user.photoURL : '');
  avatarBox.replaceChildren(document.createTextNode(initialOf(user ? nameOf(user) : '?')));
  if (src) {
    const img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.src = src;
    avatarBox.replaceChildren(img);
  }
  avatarRemove.hidden = !avatarUrl();
};

/** Đặt ảnh đã lưu (từ hồ sơ hoặc sau khi ghi) và cập nhật menu/header. */
const applySavedAvatar = (dataUrl: string) => {
  savedAvatar = dataUrl;
  pendingAvatar = null;
  setProfileAvatar(dataUrl);
  drawAvatar();
};

avatarPick.addEventListener('click', () => avatarFile.click());
avatarFile.addEventListener('change', async () => {
  const file = avatarFile.files?.[0];
  avatarFile.value = '';
  if (!file) return;
  avatarErr.textContent = '';
  avatarPick.disabled = true;
  try {
    pendingAvatar = await fileToAvatarDataUrl(file);
    drawAvatar();
  } catch (err) {
    avatarErr.textContent = (err as Error)?.message === 'too-large' ? AV.tooLarge : AV.unreadable;
  } finally {
    avatarPick.disabled = false;
  }
});
avatarRemove.addEventListener('click', () => {
  pendingAvatar = '';
  avatarErr.textContent = '';
  drawAvatar();
});

/** Ghi tên + điện thoại (+ ảnh nếu có) từ hộp thoại hoàn thiện hồ sơ; cập nhật form, menu, header. */
export const saveBasics = async (b: { displayName: string; phone: string; avatar: string | null }) => {
  const user = me();
  if (!user) return;
  const ref = doc(db, 'users', user.uid);
  if (profileExists === null) profileExists = (await getDoc(ref)).exists();
  const data: Record<string, unknown> = { displayName: b.displayName, phone: b.phone, updatedAt: serverTimestamp() };
  if (user.email) data.email = user.email;
  if (b.avatar !== null) data.avatar = b.avatar;
  if (profileExists) await updateDoc(ref, data);
  else await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  profileExists = true;
  pName.value = b.displayName;
  pPhone.value = b.phone;
  if (b.avatar !== null) applySavedAvatar(b.avatar);
  if (b.displayName !== (user.displayName ?? '')) await updateProfile(user, { displayName: b.displayName });
  writeUserCache(user);
  onRenamed(user);
};

/** Ghi riêng ảnh đại diện (dùng cho hộp thoại hoàn thiện hồ sơ). */
export const saveAvatar = async (dataUrl: string) => {
  const user = me();
  if (!user) return;
  const ref = doc(db, 'users', user.uid);
  if (profileExists === null) profileExists = (await getDoc(ref)).exists();
  if (profileExists) await updateDoc(ref, { avatar: dataUrl, updatedAt: serverTimestamp() });
  else {
    await setDoc(ref, { displayName: (user.displayName ?? '').slice(0, 120), email: user.email ?? '', avatar: dataUrl, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    profileExists = true;
  }
  applySavedAvatar(dataUrl);
  writeUserCache(user);
  onRenamed(user);
};

const str = (data: DocumentData, key: string) => (typeof data[key] === 'string' ? (data[key] as string) : '');
export const clean = (value: string) => value.trim().replace(/\s+/g, ' ');

/** Khóa form trong lúc tải hồ sơ, để dữ liệu tải về không ghi đè lên chữ khách đang gõ. */
const lockForm = (locked: boolean) => {
  form.setAttribute('aria-busy', String(locked));
  Array.from(form.elements).forEach((field) => {
    if (field instanceof HTMLInputElement || field instanceof HTMLButtonElement) field.disabled = locked;
  });
};

/** Số điện thoại trong hồ sơ (gợi ý cho ô "cách liên hệ" của yêu cầu tư vấn). */
export const profilePhone = () => pPhone.value;

export const loadProfile = async (user: User, renamed?: (user: User) => void, welcome = false) => {
  if (renamed) onRenamed = renamed;
  say(alertBox, '');
  pName.value ||= user.displayName ?? '';
  lockForm(true);
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    profileExists = snap.exists();
    const data = snap.data() ?? {};
    pName.value = str(data, 'displayName') || user.displayName || '';
    pPhone.value = str(data, 'phone');
    pCompany.value = str(data, 'company');
    pIndustry.value = str(data, 'industry');
    pNews.checked = data.aiOfficeNews === true;
    const av = /^data:image\//.test(str(data, 'avatar')) ? str(data, 'avatar') : '';
    const changed = av !== savedAvatar;
    applySavedAvatar(av);
    if (changed) {
      writeUserCache(user);
      onRenamed(user); // menu trái + lời chào hiện ảnh từ hồ sơ
    }
    // Lưu email đăng nhập vào hồ sơ (tạo hồ sơ tối thiểu nếu chưa có) để chủ tìm được khách.
    if (user.email && str(data, 'email') !== user.email) {
      if (profileExists) await updateDoc(ref, { email: user.email, updatedAt: serverTimestamp() });
      else {
        await setDoc(ref, {
          displayName: (user.displayName ?? '').slice(0, 120),
          email: user.email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        profileExists = true;
      }
    }
    loadedOnce = true;
    // Vừa đăng ký, hoặc chưa có tên hiển thị → mời hoàn thiện hồ sơ (tên, ảnh, điện thoại)
    if (welcome || !pName.value.trim()) maybeOnboard(user, { displayName: pName.value.trim(), phone: pPhone.value, avatar: savedAvatar });
  } catch (err) {
    profileExists = profileExists ?? null;
    say(alertBox, `${m('loadFailed')} ${dataErrorMessage(err)}`, {
      action: { label: m('retry'), run: () => void loadProfile(user) },
    });
  } finally {
    lockForm(false);
  }
};

const PHONE_RE = /^[0-9+() .-]*$/;

const checkPhone = () => {
  const value = clean(pPhone.value);
  pPhone.value = value;
  const digits = value.replace(/\D/g, '').length;
  const ok = !value || (PHONE_RE.test(value) && value.length <= MAX_PHONE && digits >= 8 && digits <= 15);
  fieldError(pPhone, ok ? '' : m('phoneInvalid'));
};

export const checkLength = (input: HTMLInputElement | HTMLTextAreaElement, max: number) => {
  input.value = input instanceof HTMLTextAreaElement ? input.value.trim() : clean(input.value);
  fieldError(input, input.value.length > max ? m('tooLong', { n: max }) : '');
};

clearOnInput(form);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const user = me();
  if (!user) return;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  say(alertBox, '');
  say(statusBox, '');

  const displayName = clean(pName.value);
  pName.value = displayName;
  fieldError(pName, !displayName ? m('nameRequired') : displayName.length > MAX_NAME ? m('nameLong') : '');
  checkPhone();
  checkLength(pCompany, MAX_TEXT);
  checkLength(pIndustry, MAX_TEXT);
  if (focusFirstInvalid(form)) return;

  setBusy(submit, true, 'busySave');
  try {
    const ref = doc(db, 'users', user.uid);
    if (profileExists === null) profileExists = (await getDoc(ref)).exists();
    const data: Record<string, unknown> = {
      displayName,
      phone: pPhone.value,
      company: pCompany.value,
      industry: pIndustry.value,
      aiOfficeNews: pNews.checked,
      updatedAt: serverTimestamp(),
    };
    if (user.email) data.email = user.email;
    if (pendingAvatar !== null) data.avatar = pendingAvatar;
    if (profileExists) await updateDoc(ref, data);
    else await setDoc(ref, { ...data, createdAt: serverTimestamp() });
    profileExists = true;
    if (pendingAvatar !== null) applySavedAvatar(pendingAvatar);
  } catch (err) {
    setBusy(submit, false);
    say(alertBox, dataErrorMessage(err));
    return;
  }
  try {
    if (displayName !== (user.displayName ?? '')) await updateProfile(user, { displayName });
    writeUserCache(user);
    onRenamed(user);
    say(statusBox, m('profileSaved'));
  } catch (err) {
    say(alertBox, authErrorMessage(err));
  } finally {
    setBusy(submit, false);
  }
});

register('profile', {
  enter() {
    const user = me();
    if (user && !loadedOnce && form.getAttribute('aria-busy') !== 'true') void loadProfile(user);
  },
});
