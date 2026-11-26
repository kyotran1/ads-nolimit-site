/** Trang Tạo tài khoản (/dang-ky/, /en/sign-up/): email + mật khẩu, Google, hoặc Facebook (khi bật cờ). */
import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
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
  MIN_PASSWORD,
  nextParam,
  safeNext,
  say,
  setBusy,
  setupPasswordToggles,
  welcomeTarget,
  withContinueUrl,
} from './client';
import type { LinkOutcome } from './facebook-flow';
import { authErrorMessage, m } from './messages';
import { clearUserCache, writeUserCache } from './user-cache';

const MAX_NAME = 60;

const form = document.getElementById('signup-form') as HTMLFormElement | null;
if (form) {
  const name = form.querySelector<HTMLInputElement>('#signup-name')!;
  const email = form.querySelector<HTMLInputElement>('#signup-email')!;
  const password = form.querySelector<HTMLInputElement>('#signup-password')!;
  const confirm = form.querySelector<HTMLInputElement>('#signup-confirm')!;
  const consent = form.querySelector<HTMLInputElement>('#signup-consent')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const google = document.querySelector<HTMLButtonElement>('#signup-google');
  const facebook = facebookLoginOn ? document.querySelector<HTMLButtonElement>('#signup-facebook') : null;
  const alert = document.getElementById('signup-alert');
  let working = false;

  setupPasswordToggles(form);
  keepNextOnLinks();
  clearOnInput(form);
  consent.addEventListener('change', () => consent.checked && fieldError(consent));

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

  const checkConsent = () => {
    fieldError(consent, consent.checked ? '' : m('consentRequired'));
    return consent.checked;
  };

  const finish = (busyButton: HTMLButtonElement | null, err: unknown, context: 'default' | 'google' = 'default') => {
    working = false;
    setBusy(busyButton, false);
    lockButtons([submit, google, facebook], false);
    say(alert, authErrorMessage(err, context === 'google' ? 'google-signin' : context));
  };

  // Khách vừa nối Facebook vào tài khoản Google cũ: báo một nhịp rồi đi tiếp như thường.
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
    const text = (await loadFlow()).facebookFailureText(err, 'signup');
    working = false;
    setBusy(facebook, false);
    lockButtons([submit, google], false);
    say(alert, text);
  };
  if (facebookLoginOn) void loadFlow().then((flow) => flow.applyProviderLayout(document.getElementById('signup-providers')));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (working) return;
    say(alert, '');

    const displayName = name.value.trim().replace(/\s+/g, ' ');
    name.value = displayName;
    if (!displayName) fieldError(name, m('nameRequired'));
    else if (displayName.length > MAX_NAME) fieldError(name, m('nameLong'));
    else fieldError(name);
    checkEmail(email);
    if (!password.value) fieldError(password, m('passwordRequired'));
    else if (password.value.length < MIN_PASSWORD) fieldError(password, m('passwordShort'));
    else fieldError(password);
    fieldError(confirm, confirm.value === password.value ? '' : m('passwordMismatch'));
    checkConsent();
    if (focusFirstInvalid(form)) return;

    working = true;
    setBusy(submit, true, 'busySignUp');
    lockButtons([google, facebook], true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.value, password.value);
      try {
        await updateProfile(user, { displayName });
      } catch {
        /* Tên có thể đặt lại ở trang tài khoản */
      }
      let verifySent = true;
      try {
        await withContinueUrl(config.paths.account, (settings) => sendEmailVerification(user, settings));
      } catch {
        verifySent = false;
      }
      writeUserCache(user);
      location.assign(welcomeTarget(verifySent ? '1' : 'noverify'));
    } catch (err) {
      finish(submit, err);
    }
  });

  google?.addEventListener('click', () => {
    if (working) return;
    say(alert, '');
    if (!checkConsent()) {
      consent.focus();
      return;
    }
    working = true;
    setBusy(google, true, 'busyGoogle');
    lockButtons([submit, facebook], true);
    signInWithPopup(auth, googleProvider())
      .then(async (result) => {
        writeUserCache(result.user);
        const isNew = getAdditionalUserInfo(result)?.isNewUser;
        goNext(isNew ? welcomeTarget('google') : safeNext(nextParam()), await afterLink(result.user));
      })
      .catch((err) => finish(google, err, 'google'));
  });

  // Facebook: gọi signInWithPopup ngay trong lúc bấm (không await trước đó), sau khi khách đã tick đồng ý. Không dùng Facebook JS SDK.
  if (facebookLoginOn) facebook?.addEventListener('click', () => {
    if (working) return;
    say(alert, '');
    if (!checkConsent()) {
      consent.focus();
      return;
    }
    working = true;
    setBusy(facebook, true, 'busyFacebook');
    lockButtons([submit, google], true);
    signInWithPopup(auth, facebookProvider())
      .then((result) => {
        writeUserCache(result.user);
        const isNew = getAdditionalUserInfo(result)?.isNewUser;
        location.assign(isNew ? welcomeTarget('facebook') : safeNext(nextParam()));
      })
      .catch(finishFacebook);
  });
}
