/**
 * Trang Quên mật khẩu (/quen-mat-khau/, /en/forgot-password/).
 * Luôn hiện cùng một thông báo trung tính, không cho biết email đã có tài khoản hay chưa.
 */
import { sendPasswordResetEmail } from 'firebase/auth';
import {
  auth,
  checkEmail,
  clearOnInput,
  config,
  focusFirstInvalid,
  keepNextOnLinks,
  say,
  setBusy,
  withContinueUrl,
} from './client';
import { authErrorMessage, errorCode, m } from './messages';

/** Chỉ những lỗi này được báo; mọi lỗi khác (kể cả "không có tài khoản") đều hiện thông báo trung tính. */
const shownErrors = ['invalid-email', 'missing-email', 'too-many-requests', 'network-request-failed'];

const form = document.getElementById('forgot-form') as HTMLFormElement | null;
if (form) {
  const email = form.querySelector<HTMLInputElement>('#forgot-email')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const alert = document.getElementById('forgot-alert');
  const status = document.getElementById('forgot-status');
  let working = false;

  keepNextOnLinks();
  clearOnInput(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (working) return;
    say(alert, '');
    say(status, '');
    checkEmail(email);
    if (focusFirstInvalid(form)) return;

    working = true;
    setBusy(submit, true, 'busySend');
    const address = email.value;
    try {
      await withContinueUrl(`${config.paths.signIn}?reset=1`, (settings) =>
        sendPasswordResetEmail(auth, address, settings),
      );
      say(status, m('resetSent', { email: address }), { kind: 'success' });
    } catch (err) {
      if (shownErrors.includes(errorCode(err))) say(alert, authErrorMessage(err));
      else say(status, m('resetSent', { email: address }), { kind: 'success' });
    } finally {
      working = false;
      setBusy(submit, false);
    }
  });
}
