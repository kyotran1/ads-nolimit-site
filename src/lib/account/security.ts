/**
 * Đăng nhập & bảo mật: thông tin đăng nhập, xác minh email, đổi mật khẩu, đăng xuất, xóa tài khoản.
 * Giữ nguyên chức năng V3; V4 thêm: không cho xóa tài khoản khi số dư > 0 (luật Firestore cũng chặn).
 */
import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reload,
  sendEmailVerification,
  signOut,
  updatePassword,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { deleteDoc, doc } from 'firebase/firestore/lite';
import {
  auth,
  clearOnInput,
  config as authConfig,
  fieldError,
  focusFirstInvalid,
  googleProvider,
  hasPassword,
  MIN_PASSWORD,
  say,
  setBusy,
  withContinueUrl,
} from '../auth/client';
import { authErrorMessage, dataErrorMessage, errorCode, formatDateTime, m } from '../auth/messages';
import { clearUserCache } from '../auth/user-cache';
import { byId } from '../ui/dom';
import { me, money, register } from './ctx';
import { balance, db, ensure, on, state } from './store';
import { tx } from './text';

/** Đang xóa / đang đăng xuất: main.ts không tự chuyển sang trang đăng nhập khi Firebase báo "đã thoát". */
let leaving = false;
export const isLeaving = () => leaving;

const securityAlert = byId('security-alert');
const securityStatus = byId('security-status');

export const renderSecurity = (user: User) => {
  byId('acc-email').textContent = user.email ?? '';
  const verified = byId('acc-verified');
  verified.textContent = m(user.emailVerified ? 'verified' : 'unverified');
  verified.className = `badge ${user.emailVerified ? 'badge--ok' : 'badge--warn'}`;
  byId('acc-verify').hidden = user.emailVerified;

  const providers = user.providerData.map((p) =>
    p.providerId === 'password' ? m('providerPassword') : p.providerId === 'google.com' ? m('providerGoogle') : p.providerId,
  );
  byId('acc-provider').textContent = providers.join(m('and'));
  const created = user.metadata.creationTime;
  const last = user.metadata.lastSignInTime;
  byId('acc-created').textContent = created ? formatDateTime(new Date(created)) : '—';
  byId('acc-last').textContent = last ? formatDateTime(new Date(last)) : '—';

  const password = hasPassword(user);
  byId('pw-section').hidden = !password;
  byId('google-only').hidden = password;
  byId('delete-password-wrap').hidden = !password;
  byId('delete-google-note').hidden = password;
};

/* ---------- Xác minh email ---------- */

const resendButton = byId<HTMLButtonElement>('verify-resend');
const reloadButton = byId<HTMLButtonElement>('verify-reload');

resendButton.addEventListener('click', async () => {
  const user = me();
  if (!user) return;
  say(securityAlert, '');
  say(securityStatus, '');
  setBusy(resendButton, true, 'busySend');
  try {
    await withContinueUrl(authConfig.paths.account, (settings) => sendEmailVerification(user, settings));
    say(securityStatus, m('verifyResent', { email: user.email ?? '' }));
  } catch (err) {
    say(securityAlert, authErrorMessage(err));
  } finally {
    setBusy(resendButton, false);
  }
});

reloadButton.addEventListener('click', async () => {
  const user = me();
  if (!user) return;
  say(securityAlert, '');
  say(securityStatus, '');
  setBusy(reloadButton, true, 'busyCheck');
  try {
    await reload(user);
    if (user.emailVerified) {
      await user.getIdToken(true);
      renderSecurity(user);
      say(securityStatus, m('verifyDone'));
    } else {
      say(securityAlert, m('verifyStill'), { kind: 'info' });
    }
  } catch (err) {
    say(securityAlert, authErrorMessage(err));
  } finally {
    setBusy(reloadButton, false);
  }
});

/* ---------- Đổi mật khẩu ---------- */

const passwordForm = byId<HTMLFormElement>('password-form');
const pwCurrent = byId<HTMLInputElement>('pw-current');
const pwNew = byId<HTMLInputElement>('pw-new');
const pwConfirm = byId<HTMLInputElement>('pw-confirm');

clearOnInput(passwordForm);
passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const user = me();
  if (!user?.email) return;
  const email = user.email;
  const submit = passwordForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  say(securityAlert, '');
  say(securityStatus, '');

  fieldError(pwCurrent, pwCurrent.value ? '' : m('currentPasswordRequired'));
  if (!pwNew.value) fieldError(pwNew, m('passwordRequired'));
  else if (pwNew.value.length < MIN_PASSWORD) fieldError(pwNew, m('passwordShort'));
  else if (pwNew.value === pwCurrent.value) fieldError(pwNew, m('passwordSame'));
  else fieldError(pwNew);
  fieldError(pwConfirm, pwConfirm.value === pwNew.value ? '' : m('passwordMismatch'));
  if (focusFirstInvalid(passwordForm)) return;

  setBusy(submit, true, 'busySave');
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, pwCurrent.value));
  } catch (err) {
    setBusy(submit, false);
    say(securityAlert, authErrorMessage(err, 'reauth'));
    pwCurrent.select();
    return;
  }
  try {
    await updatePassword(user, pwNew.value);
    passwordForm.reset();
    say(securityStatus, m('passwordChanged'));
  } catch (err) {
    say(securityAlert, authErrorMessage(err));
  } finally {
    setBusy(submit, false);
  }
});

/* ---------- Đăng xuất (nút ở menu bên trái và ở mục Bảo mật) ---------- */

document.querySelectorAll<HTMLButtonElement>('[data-signout]').forEach((button) => {
  button.addEventListener('click', async () => {
    leaving = true;
    setBusy(button, true, 'busySignOut');
    try {
      await signOut(auth);
      clearUserCache();
      location.assign(authConfig.paths.home);
    } catch (err) {
      leaving = false;
      setBusy(button, false);
      say(securityAlert, authErrorMessage(err));
    }
  });
});

/* ---------- Xóa tài khoản ---------- */

const deleteForm = byId<HTMLFormElement>('delete-form');
const deleteSection = byId<HTMLDetailsElement>('delete-section');
const deleteBlocked = byId('delete-blocked');
const deleteContact = byId('delete-contact');
const delPassword = byId<HTMLInputElement>('del-password');
const delConfirm = byId<HTMLInputElement>('del-confirm');
const deleteAlert = byId('delete-alert');

/** Còn số dư: ẩn form xóa, giải thích và mời liên hệ hỗ trợ. */
const renderDeleteGate = () => {
  if (!state.wallet) return;
  const blocked = balance() > 0;
  deleteBlocked.hidden = !blocked;
  deleteContact.hidden = !blocked;
  deleteSection.hidden = blocked;
  if (blocked) {
    deleteSection.open = false;
    say(deleteBlocked, tx('deleteBlocked', { amount: money(balance()) }), { kind: 'info' });
  }
};
on(['wallet'], renderDeleteGate);

/** "Xóa", "XOA", "xóa" đều được (bỏ dấu, không phân biệt hoa thường). */
const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toUpperCase();

/** Gọi khi xóa xong (main.ts ẩn bảng điều khiển, hiện lời chào tạm biệt). */
let onDeleted: () => void = () => {};
export const whenDeleted = (fn: () => void) => {
  onDeleted = fn;
};

clearOnInput(deleteForm);
deleteForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const user = me();
  if (!user || leaving) return;
  const submit = deleteForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  const word = deleteForm.dataset.word ?? '';
  const withPassword = hasPassword(user);
  say(deleteAlert, '');

  if (balance() > 0) {
    renderDeleteGate();
    return;
  }
  if (withPassword) fieldError(delPassword, delPassword.value ? '' : m('currentPasswordRequired'));
  fieldError(delConfirm, plain(delConfirm.value) === plain(word) ? '' : m('deleteConfirm', { word }));
  if (focusFirstInvalid(deleteForm)) return;

  leaving = true;
  setBusy(submit, true, 'busyDelete');
  let stage: 'reauth' | 'data' | 'auth' = 'reauth';
  // Xác nhận lại danh tính NGAY trong lúc bấm (cửa sổ Google không bị chặn), rồi mới xóa.
  const reauth =
    withPassword && user.email
      ? reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, delPassword.value))
      : reauthenticateWithPopup(user, googleProvider());
  reauth
    .then(async () => {
      stage = 'data';
      await deleteDoc(doc(db, 'users', user.uid)); // hồ sơ trước (luật chặn nếu còn số dư)
      stage = 'auth';
      await deleteUser(user);
      clearUserCache();
      onDeleted();
    })
    .catch((err) => {
      leaving = false;
      setBusy(submit, false);
      const message =
        stage === 'reauth'
          ? authErrorMessage(err, withPassword ? 'reauth' : 'google')
          : stage === 'data'
            ? errorCode(err).includes('permission-denied')
              ? tx('deleteBlockedRule')
              : dataErrorMessage(err)
            : authErrorMessage(err);
      say(deleteAlert, message);
      if (stage === 'reauth' && withPassword) delPassword.select();
    });
});

register('security', {
  enter() {
    void ensure('wallet').then(renderDeleteGate);
  },
});
