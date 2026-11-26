/**
 * Khối "Thêm email / xác minh email" ở đầu trang Tài khoản, dành cho khách đăng nhập bằng Facebook:
 *  - Facebook không trả email (tài khoản đăng ký bằng số điện thoại) → ô nhập email + verifyBeforeUpdateEmail
 *    (Firebase gửi thư xác minh; bấm link xong email được đặt và đã xác minh).
 *  - Có email nhưng chưa xác minh → lời nhắc + nút gửi email xác minh (quyền "cùng xem TKQC" đòi email đã xác minh;
 *    luật Firestore không nới).
 * Không chặn xem các mục khác. Phần quyết định chế độ (emailGapMode) ở src/lib/auth/facebook.ts, có test.
 */
import { reauthenticateWithPopup, reload, sendEmailVerification, verifyBeforeUpdateEmail } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { checkEmail, clearOnInput, config as authConfig, facebookProvider, googleProvider, say, setBusy, withContinueUrl } from '../auth/client';
import { emailGapMode, reauthProvider } from '../auth/facebook';
import { authErrorMessage, errorCode, m } from '../auth/messages';
import { byId } from '../ui/dom';
import { me } from './ctx';

const box = byId('mailgap');
const form = byId<HTMLFormElement>('mailgap-form');
const input = byId<HTMLInputElement>('mailgap-email');
const sendButton = byId<HTMLButtonElement>('mailgap-send');
const doneRow = byId('mailgap-done-row');
const doneButton = byId<HTMLButtonElement>('mailgap-done');
const alertBox = byId('mailgap-alert');
const statusBox = byId('mailgap-status');

let onChanged: (user: User) => void = () => {};
/** Đã gửi thư (chờ khách bấm link): hiện nút "Tôi đã xác minh" và tự kiểm khi khách quay lại trang. */
let waiting = false;

const modeOf = (user: User) => emailGapMode({ email: user.email, emailVerified: user.emailVerified, providerData: user.providerData });

/** Vẽ lại khối theo người dùng hiện tại (gọi mỗi khi Firebase báo đổi người dùng / sau khi xác minh). */
export const renderEmailGap = (user: User, changed?: (user: User) => void) => {
  if (changed) onChanged = changed;
  const mode = modeOf(user);
  box.hidden = mode === 'none';
  box.querySelectorAll<HTMLElement>('[data-mode-add]').forEach((el) => (el.hidden = mode !== 'add'));
  box.querySelectorAll<HTMLElement>('[data-mode-verify]').forEach((el) => (el.hidden = mode !== 'verify'));
  doneRow.hidden = mode === 'none' || !waiting;
  if (mode === 'none') {
    waiting = false;
    doneRow.hidden = true;
  }
};

/** Mở lại cửa sổ xác nhận danh tính (Facebook hoặc Google) rồi chạy tiếp `again`. Gọi thẳng trong lúc bấm để không bị chặn cửa sổ. */
const offerReauth = (user: User, again: () => void) => {
  const kind = reauthProvider(user.providerData);
  say(alertBox, m('emailGapReauth'), {
    kind: 'info',
    action: {
      label: m(kind === 'facebook' ? 'reauthFacebook' : 'reauthGoogle'),
      run: () => {
        reauthenticateWithPopup(user, kind === 'facebook' ? facebookProvider() : googleProvider())
          .then(() => {
            say(alertBox, '');
            again();
          })
          .catch((err) => say(alertBox, authErrorMessage(err, kind === 'facebook' ? 'facebook' : 'google')));
      },
    },
  });
};

const sent = (email: string) => {
  waiting = true;
  doneRow.hidden = false;
  say(statusBox, m('emailGapSent', { email }));
};

const sendAdd = async (user: User, email: string, button: HTMLButtonElement | null) => {
  say(alertBox, '');
  say(statusBox, '');
  setBusy(button, true, 'busySend');
  try {
    await withContinueUrl(authConfig.paths.account, (settings) => verifyBeforeUpdateEmail(user, email, settings));
    sent(email);
  } catch (err) {
    if (errorCode(err) === 'requires-recent-login') offerReauth(user, () => void sendAdd(user, email, button));
    else say(alertBox, authErrorMessage(err));
  } finally {
    setBusy(button, false);
  }
};

const sendVerify = async (user: User, button: HTMLButtonElement | null) => {
  say(alertBox, '');
  say(statusBox, '');
  setBusy(button, true, 'busySend');
  try {
    await withContinueUrl(authConfig.paths.account, (settings) => sendEmailVerification(user, settings));
    sent(user.email ?? '');
  } catch (err) {
    say(alertBox, authErrorMessage(err));
  } finally {
    setBusy(button, false);
  }
};

clearOnInput(form);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const user = me();
  if (!user) return;
  if (!checkEmail(input)) {
    input.focus();
    return;
  }
  void sendAdd(user, input.value, form.querySelector<HTMLButtonElement>('button[type="submit"]'));
});

sendButton.addEventListener('click', () => {
  const user = me();
  if (user) void sendVerify(user, sendButton);
});

/** Kiểm lại xem khách đã bấm link trong thư chưa. `silent`: khi tự kiểm lúc khách quay lại trang, không báo "chưa". */
const check = async (silent: boolean) => {
  const user = me();
  if (!user) return;
  if (!silent) {
    say(alertBox, '');
    say(statusBox, '');
    setBusy(doneButton, true, 'busyCheck');
  }
  try {
    await reload(user);
    const ok = Boolean(user.email) && user.emailVerified;
    if (ok) {
      await user.getIdToken(true);
      waiting = false;
      renderEmailGap(user);
      say(statusBox, '');
      onChanged(user);
      byId('acc-notice').dataset.kind = 'success';
      say(byId('acc-notice'), m('emailGapDone'), { kind: 'success' });
    } else if (!silent) {
      say(alertBox, m('emailGapWaiting'), { kind: 'info' });
    }
  } catch (err) {
    if (!silent) say(alertBox, authErrorMessage(err));
  } finally {
    if (!silent) setBusy(doneButton, false);
  }
};

doneButton.addEventListener('click', () => void check(false));

// Khách bấm link trong thư ở tab/app khác rồi quay lại trang này: tự kiểm một lần.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && waiting) void check(true);
});
