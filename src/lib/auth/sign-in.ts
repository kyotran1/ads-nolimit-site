/** Trang Đăng nhập (/dang-nhap/, /en/sign-in/): email + mật khẩu, Google, hoặc Facebook (khi bật cờ). */
import { getAdditionalUserInfo, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { facebookLoginOn, facebookTestOnly } from '../../config/auth-providers';
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
import { browserStallEnv, facebookShown, revealFacebook } from './fb-gate';
import { armStallUnlock, EMAIL_ADDED_KEY, inAppBlockedMessage } from './facebook';
import type { LinkOutcome } from './facebook-flow';
import { authErrorMessage, errorCode, inAppBrowser, m, pageLang } from './messages';
import { clearUserCache, writeUserCache } from './user-cache';

const form = document.getElementById('signin-form') as HTMLFormElement | null;
if (form) {
  const email = form.querySelector<HTMLInputElement>('#signin-email')!;
  const password = form.querySelector<HTMLInputElement>('#signin-password')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const google = document.querySelector<HTMLButtonElement>('#signin-google');
  // Facebook hiện cho khách này? (off: không; test: chỉ khi đã bật bằng ?fbtest=1; on: có). Hằng lúc build nên ở bản off phần Facebook là mã chết (không chạy).
  const fbOn = facebookLoginOn && facebookShown();
  if (fbOn && facebookTestOnly) revealFacebook();
  const facebook = fbOn ? document.querySelector<HTMLButtonElement>('#signin-facebook') : null;
  const alert = document.getElementById('signin-alert');
  let working = false;

  setupPasswordToggles(form);
  keepNextOnLinks();
  clearOnInput(form);

  if (new URLSearchParams(location.search).get('reset') === '1') say(alert, m('resetDone'), { kind: 'info' });

  // Vừa thêm email ở trang Tài khoản (Firebase thu hồi phiên khi email đổi): báo lý do phải đăng nhập lại.
  try {
    if (sessionStorage.getItem(EMAIL_ADDED_KEY)) {
      sessionStorage.removeItem(EMAIL_ADDED_KEY);
      say(alert, m('emailAddedRelogin'), { kind: 'info' });
    }
  } catch {
    /* không đọc được sessionStorage: bỏ qua */
  }

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
  const linkSafely = async (user: User): Promise<LinkOutcome> => {
    try {
      return await (await loadFlow()).linkPendingFacebook(user);
    } catch {
      return 'none'; // không nạp được phần Facebook: không được làm hỏng đăng nhập bằng mật khẩu/Google
    }
  };
  const afterLink = async (user: User): Promise<LinkOutcome> => (facebookLoginOn && fbOn ? linkSafely(user) : 'none');
  const goNext = (url: string, linked: LinkOutcome) => {
    if (linked === 'none') {
      location.assign(url);
      return;
    }
    say(alert, m(linked === 'linked' ? 'fbLinked' : linked === 'mismatch' ? 'fbLinkMismatch' : 'fbLinkFailed'), { kind: linked === 'linked' ? 'success' : 'info' });
    setTimeout(() => location.assign(url), 1500);
  };

  // Chỉ khi cờ Facebook bật (ở bản off nhánh này là mã chết: không trang nào nạp facebook-flow; trong dist có thể còn một tệp facebook-flow mồ côi, không ai tham chiếu).
  const loadFlow = () => import('./facebook-flow');
  const unlockFacebook = () => {
    working = false;
    setBusy(facebook, false);
    lockButtons([submit, google], false);
  };
  const finishFacebook = async (err: unknown) => {
    let text: string;
    try {
      text = (await loadFlow()).facebookFailureText(err, 'signin');
    } catch {
      text = authErrorMessage(err, 'facebook'); // không nạp được phần Facebook: vẫn báo lỗi và mở khóa nút
    }
    unlockFacebook();
    say(alert, text);
  };
  if (facebookLoginOn && fbOn) void loadFlow().then((flow) => flow.applyProviderLayout(document.getElementById('signin-providers'))).catch(() => {});

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
  // Trong trình duyệt của app (Facebook/Messenger/Zalo…) cửa sổ đăng nhập có thể không bao giờ trả kết quả:
  // hẹn 45 giây (hoặc khi khách quay lại trang) để mở khóa nút; cú bấm sau mở cửa sổ mới.
  let attempt = 0;
  let disarm: () => void = () => {};
  if (facebookLoginOn && fbOn) facebook?.addEventListener('click', () => {
    if (working) return;
    say(alert, '');
    working = true;
    const mine = ++attempt;
    disarm();
    setBusy(facebook, true, 'busyFacebook');
    lockButtons([submit, google], true);
    if (inAppBrowser()) {
      disarm = armStallUnlock(browserStallEnv(), () => {
        unlockFacebook();
        say(alert, inAppBlockedMessage(pageLang()));
      });
    }
    signInWithPopup(auth, facebookProvider())
      .then((result) => {
        disarm();
        writeUserCache(result.user);
        const isNew = getAdditionalUserInfo(result)?.isNewUser;
        location.assign(isNew ? welcomeTarget('facebook') : safeNext(nextParam(), config.paths.account));
      })
      .catch((err) => {
        disarm();
        if (mine === attempt) void finishFacebook(err); // lượt cũ đã bị lượt bấm mới thay thế thì bỏ qua lỗi
      });
  });
}
