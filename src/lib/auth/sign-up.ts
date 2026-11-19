/** Trang Tạo tài khoản (/dang-ky/, /en/sign-up/). */
import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
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
  MIN_PASSWORD,
  nextParam,
  safeNext,
  say,
  setBusy,
  setupPasswordToggles,
  welcomeTarget,
  withContinueUrl,
} from './client';
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
    lockButtons([submit, google], false);
    say(alert, authErrorMessage(err, context));
  };

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
    lockButtons([google], true);
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
    lockButtons([submit], true);
    signInWithPopup(auth, googleProvider())
      .then((result) => {
        writeUserCache(result.user);
        const isNew = getAdditionalUserInfo(result)?.isNewUser;
        location.assign(isNew ? welcomeTarget('google') : safeNext(nextParam()));
      })
      .catch((err) => finish(google, err, 'google'));
  });
}
