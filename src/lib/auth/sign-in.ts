/** Trang Đăng nhập (/dang-nhap/, /en/sign-in/): email + mật khẩu, Google, hoặc Facebook (khi bật cờ). */
import { getAdditionalUserInfo, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { facebookLoginOn } from '../../config/auth-providers';
import {
  auth,
  checkEmail,
  clearOnInput,
  config,
  facebookProvider,
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
import type { LinkOutcome } from './facebook-flow';
import { authErrorMessage, errorCode, m } from './messages';
import { clearUserCache, writeUserCache } from './user-cache';

const form = document.getElementById('signin-form') as HTMLFormElement | null;
if (form) {
  const email = form.querySelector<HTMLInputElement>('#signin-email')!;
  const password = form.querySelector<HTMLInputElement>('#signin-password')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const google = document.querySelector<HTMLButtonElement>('#signin-google');
  const facebook = facebookLoginOn ? document.querySelector<HTMLButtonElement>('#signin-facebook') : null;
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
    lockButtons([submit, google, facebook], false);
    say(alert, authErrorMessage(err, context === 'google' ? 'google-signin' : context));
    if (errorCode(err) === 'invalid-credential') password.select();
  };

  // Khách vừa nối Facebook vào tài khoản cũ: báo một nhịp rồi đi tiếp như thường.
  const afterLink = async (user: User): Promise<LinkOutcome> => (facebookLoginOn ? (await loadFlow()).linkPendingFacebook(user) : 'none');
  const goNext = (url: string, linked: LinkOutcome) => {
    if (linked === 'none') {
      location.assign(url);
      return;
    }
    say(alert, m(linked === 'linked' ? 'fbLinked' : 'fbLinkFailed'), { kind: linked === 'linked' ? 'success' : 'info' });
    setTimeout(() => location.assign(url), 1500);
  };

  // Chỉ khi cờ Facebook bật (hằng lúc build: tắt thì bộ gộp mã bỏ hẳn phần này, kể cả tệp facebook-flow.ts).
  const loadFlow = () => import('./facebook-flow');
  const finishFacebook = async (err: unknown) => {
    const text = (await loadFlow()).facebookFailureText(err, 'signin');
    working = false;
    setBusy(facebook, false);
    lockButtons([submit, google], false);
    say(alert, text);
  };
  if (facebookLoginOn) void loadFlow().then((flow) => flow.applyProviderLayout(document.getElementById('signin-providers')));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (working) return;
    say(alert, '');
    checkEmail(email);
    fieldError(password, password.value ? '' : m('passwordRequired'));
    if (focusFirstInvalid(form)) return;

    working = true;
    setBusy(submit, true, 'busySignIn');
    lockButtons([google, facebook], true);
    try {
      const { user } = await signInWithEmailAndPassword(auth, email.value, password.value);
      writeUserCache(user);
      goNext(safeNext(nextParam()), await afterLink(user));
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
    lockButtons([submit, facebook], true);
    signInWithPopup(auth, googleProvider())
      .then(async (result) => {
        writeUserCache(result.user);
        const isNew = getAdditionalUserInfo(result)?.isNewUser;
        goNext(isNew ? welcomeTarget('google') : safeNext(nextParam(), config.paths.account), await afterLink(result.user));
      })
      .catch((err) => finish(google, err, 'google'));
  });

  // Facebook: cũng gọi signInWithPopup ngay trong lúc bấm (không await trước đó). Không dùng Facebook JS SDK.
  if (facebookLoginOn) facebook?.addEventListener('click', () => {
    if (working) return;
    say(alert, '');
    working = true;
    setBusy(facebook, true, 'busyFacebook');
    lockButtons([submit, google], true);
    signInWithPopup(auth, facebookProvider())
      .then((result) => {
        writeUserCache(result.user);
        const isNew = getAdditionalUserInfo(result)?.isNewUser;
        location.assign(isNew ? welcomeTarget('facebook') : safeNext(nextParam(), config.paths.account));
      })
      .catch(finishFacebook);
  });
}
