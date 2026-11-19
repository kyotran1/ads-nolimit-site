/** Trang Đăng nhập (/dang-nhap/, /en/sign-in/): email + mật khẩu, hoặc Google. */
import { getAdditionalUserInfo, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import {
  auth,
  checkEmail,
  clearOnInput,
  config,
  fieldError,
  focusFirstInvalid,
  googleProvider,
  keepNextOnLinks,
  lockButtons,
  nextParam,
  safeNext,
  say,
  setBusy,
  setupPasswordToggles,
  welcomeTarget,
} from './client';
import { authErrorMessage, errorCode, m } from './messages';
import { clearUserCache, writeUserCache } from './user-cache';

const form = document.getElementById('signin-form') as HTMLFormElement | null;
if (form) {
  const email = form.querySelector<HTMLInputElement>('#signin-email')!;
  const password = form.querySelector<HTMLInputElement>('#signin-password')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const google = document.querySelector<HTMLButtonElement>('#signin-google');
  const alert = document.getElementById('signin-alert');
  let working = false;

  setupPasswordToggles(form);
  keepNextOnLinks();
  clearOnInput(form);

  if (new URLSearchParams(location.search).get('reset') === '1') say(alert, m('resetDone'), { kind: 'info' });

  // Đang đăng nhập sẵn: báo cho khách và đưa link vào trang tài khoản (không tự chuyển trang).
  onAuthStateChanged(auth, (user) => {
    if (working) return;
    if (user) {
      writeUserCache(user);
      say(alert, m('alreadySignedIn', { email: user.email ?? '' }), {
        kind: 'info',
        link: { href: safeNext(nextParam()), label: m('goToAccount') },
      });
    } else {
      clearUserCache();
    }
  });

  const finish = (busyButton: HTMLButtonElement | null, err: unknown, context: 'default' | 'google' = 'default') => {
    working = false;
    setBusy(busyButton, false);
    lockButtons([submit, google], false);
    say(alert, authErrorMessage(err, context));
    if (errorCode(err) === 'invalid-credential') password.select();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (working) return;
    say(alert, '');
    checkEmail(email);
    fieldError(password, password.value ? '' : m('passwordRequired'));
    if (focusFirstInvalid(form)) return;

    working = true;
    setBusy(submit, true, 'busySignIn');
    lockButtons([google], true);
    try {
      const { user } = await signInWithEmailAndPassword(auth, email.value, password.value);
      writeUserCache(user);
      location.assign(safeNext(nextParam()));
    } catch (err) {
      finish(submit, err);
    }
  });

  // Gọi signInWithPopup ngay trong lúc bấm (không await trước đó) để trình duyệt không chặn cửa sổ.
  google?.addEventListener('click', () => {
    if (working) return;
    say(alert, '');
    working = true;
    setBusy(google, true, 'busyGoogle');
    lockButtons([submit], true);
    signInWithPopup(auth, googleProvider())
      .then((result) => {
        writeUserCache(result.user);
        const isNew = getAdditionalUserInfo(result)?.isNewUser;
        location.assign(isNew ? welcomeTarget('google') : safeNext(nextParam(), config.paths.account));
      })
      .catch((err) => finish(google, err, 'google'));
  });
}
