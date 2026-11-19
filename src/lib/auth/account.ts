/**
 * Trang Tài khoản (/tai-khoan/, /en/account/).
 *
 * Firestore (bản "lite", chỉ đọc/ghi khi cần, không giữ kết nối) chỉ được nạp ở trang này:
 *   users/{uid}    hồ sơ: displayName, phone, company, industry, aiOfficeNews, createdAt, updatedAt
 *   requests/{id}  yêu cầu dịch vụ: uid, planId, note, contact?, lang, status, createdAt
 * Luật bảo mật tương ứng: firestore.rules ở thư mục gốc repo.
 */
import {
  EmailAuthProvider,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reload,
  sendEmailVerification,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore/lite';
import type { DocumentData, Timestamp } from 'firebase/firestore/lite';
import {
  app,
  auth,
  clearOnInput,
  config,
  fieldError,
  focusFirstInvalid,
  googleProvider,
  hasPassword,
  MIN_PASSWORD,
  say,
  scrollToHash,
  setBusy,
  setupPasswordToggles,
  withContinueUrl,
} from './client';
import { authErrorMessage, dataErrorMessage, formatDateTime, m, pageLang, statusLabel } from './messages';
import { clearUserCache, initialOf, nameOf, writeUserCache } from './user-cache';

const db = getFirestore(app);

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const MAX_NAME = 60;
const MAX_TEXT = 120;
const MAX_PHONE = 20;
const MAX_NOTE = 1000;

let me: User | null = null;
/** Đang xóa / đã xóa / đang đăng xuất: không tự chuyển sang trang đăng nhập khi Firebase báo "đã thoát". */
let leaving = false;
/** Hồ sơ users/{uid} đã có chưa (null = chưa biết vì tải lỗi). */
let profileExists: boolean | null = null;

/* ---------- Khởi động: bắt buộc đăng nhập ---------- */

const signInUrl = () =>
  `${config.paths.signIn}?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;

const start = () =>
  onAuthStateChanged(auth, (user) => {
    if (leaving) return;
    if (!user) {
      clearUserCache();
      location.replace(signInUrl());
      return;
    }
    const first = me === null;
    me = user;
    writeUserCache(user);
    renderUser(user);
    if (first) {
      byId('acc-loading').hidden = true;
      byId('acc-app').hidden = false;
      readParams(user);
      scrollToHash();
      void loadProfile(user);
      void loadRequests(user);
    }
  });

/** ?welcome=… (vừa tạo tài khoản) và ?plan=… (chọn sẵn gói); xử lý xong thì gỡ khỏi thanh địa chỉ. */
const readParams = (user: User) => {
  const params = new URLSearchParams(location.search);
  const welcome = params.get('welcome');
  const notice = byId('acc-notice');
  if (welcome === '1') say(notice, m('welcome', { email: user.email ?? '' }), { kind: 'success' });
  else if (welcome === 'noverify') say(notice, m('welcomeNoVerify'), { kind: 'info' });
  else if (welcome === 'google') say(notice, m('welcomeGoogle'), { kind: 'success' });

  const plan = params.get('plan');
  const select = byId<HTMLSelectElement>('r-plan');
  if (plan && Array.from(select.options).some((o) => o.value === plan)) {
    select.value = plan;
    updatePlanInfo();
  }
  if (params.has('welcome') || params.has('plan')) {
    params.delete('welcome');
    params.delete('plan');
    const search = params.toString();
    history.replaceState(history.state, '', location.pathname + (search ? `?${search}` : '') + location.hash);
  }
};

/* ---------- Thông tin đăng nhập ---------- */

const renderAvatar = (user: User) => {
  const box = byId('acc-avatar');
  const name = nameOf(user);
  box.replaceChildren(document.createTextNode(initialOf(name)));
  if (user.photoURL && /^https:\/\//.test(user.photoURL)) {
    const img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.addEventListener('load', () => box.replaceChildren(img), { once: true });
    img.src = user.photoURL;
  }
};

const renderUser = (user: User) => {
  renderAvatar(user);
  byId('acc-hello').textContent = m('hello', { name: nameOf(user) });
  byId('acc-email').textContent = user.email ?? '';

  const badge = byId('acc-verified');
  badge.textContent = m(user.emailVerified ? 'verified' : 'unverified');
  badge.className = `badge ${user.emailVerified ? 'badge--ok' : 'badge--warn'}`;
  byId('acc-verify').hidden = user.emailVerified;

  const providers = user.providerData.map((p) =>
    p.providerId === 'password'
      ? m('providerPassword')
      : p.providerId === 'google.com'
        ? m('providerGoogle')
        : p.providerId,
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
const securityAlert = byId('security-alert');
const securityStatus = byId('security-status');

resendButton.addEventListener('click', async () => {
  if (!me) return;
  const user = me;
  say(securityAlert, '');
  say(securityStatus, '');
  setBusy(resendButton, true, 'busySend');
  try {
    await withContinueUrl(config.paths.account, (settings) => sendEmailVerification(user, settings));
    say(securityStatus, m('verifyResent', { email: user.email ?? '' }));
  } catch (err) {
    say(securityAlert, authErrorMessage(err));
  } finally {
    setBusy(resendButton, false);
  }
});

reloadButton.addEventListener('click', async () => {
  if (!me) return;
  const user = me;
  say(securityAlert, '');
  say(securityStatus, '');
  setBusy(reloadButton, true, 'busyCheck');
  try {
    await reload(user);
    if (user.emailVerified) {
      await user.getIdToken(true);
      renderUser(user);
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

/* ---------- Hồ sơ (users/{uid}) ---------- */

const profileForm = byId<HTMLFormElement>('profile-form');
const pName = byId<HTMLInputElement>('p-name');
const pPhone = byId<HTMLInputElement>('p-phone');
const pCompany = byId<HTMLInputElement>('p-company');
const pIndustry = byId<HTMLInputElement>('p-industry');
const pNews = byId<HTMLInputElement>('p-news');
const profileAlert = byId('profile-alert');
const profileStatus = byId('profile-status');
const rContact = byId<HTMLInputElement>('r-contact');

const str = (data: DocumentData, key: string) => (typeof data[key] === 'string' ? (data[key] as string) : '');
const clean = (value: string) => value.trim().replace(/\s+/g, ' ');

/** Khóa form trong lúc tải hồ sơ, để dữ liệu tải về không ghi đè lên chữ khách đang gõ. */
const lockForm = (form: HTMLFormElement, locked: boolean) => {
  form.setAttribute('aria-busy', String(locked));
  Array.from(form.elements).forEach((field) => {
    if (field instanceof HTMLInputElement || field instanceof HTMLButtonElement) field.disabled = locked;
  });
};

const loadProfile = async (user: User) => {
  say(profileAlert, '');
  pName.value ||= user.displayName ?? '';
  lockForm(profileForm, true);
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    profileExists = snap.exists();
    const data = snap.data() ?? {};
    pName.value = str(data, 'displayName') || user.displayName || '';
    pPhone.value = str(data, 'phone');
    pCompany.value = str(data, 'company');
    pIndustry.value = str(data, 'industry');
    pNews.checked = data.aiOfficeNews === true;
  } catch (err) {
    profileExists = null;
    say(profileAlert, `${m('loadFailed')} ${dataErrorMessage(err)}`, {
      action: { label: m('retry'), run: () => void loadProfile(user) },
    });
  } finally {
    lockForm(profileForm, false);
  }
  // Gợi ý cách liên hệ cho form yêu cầu: số điện thoại trong hồ sơ, nếu không có thì email.
  if (!rContact.value) rContact.value = pPhone.value ? pPhone.value : (user.email ?? '');
};

const PHONE_RE = /^[0-9+() .-]*$/;

const checkPhone = () => {
  const value = clean(pPhone.value);
  pPhone.value = value;
  const digits = value.replace(/\D/g, '').length;
  const ok = !value || (PHONE_RE.test(value) && value.length <= MAX_PHONE && digits >= 8 && digits <= 15);
  fieldError(pPhone, ok ? '' : m('phoneInvalid'));
};

const checkLength = (input: HTMLInputElement | HTMLTextAreaElement, max: number) => {
  input.value = input instanceof HTMLTextAreaElement ? input.value.trim() : clean(input.value);
  fieldError(input, input.value.length > max ? m('tooLong', { n: max }) : '');
};

clearOnInput(profileForm);
profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!me) return;
  const user = me;
  const submit = profileForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  say(profileAlert, '');
  say(profileStatus, '');

  const displayName = clean(pName.value);
  pName.value = displayName;
  fieldError(pName, !displayName ? m('nameRequired') : displayName.length > MAX_NAME ? m('nameLong') : '');
  checkPhone();
  checkLength(pCompany, MAX_TEXT);
  checkLength(pIndustry, MAX_TEXT);
  if (focusFirstInvalid(profileForm)) return;

  setBusy(submit, true, 'busySave');
  try {
    const ref = doc(db, 'users', user.uid);
    if (profileExists === null) profileExists = (await getDoc(ref)).exists();
    const data = {
      displayName,
      phone: pPhone.value,
      company: pCompany.value,
      industry: pIndustry.value,
      aiOfficeNews: pNews.checked,
      updatedAt: serverTimestamp(),
    };
    if (profileExists) await updateDoc(ref, data);
    else await setDoc(ref, { ...data, createdAt: serverTimestamp() });
    profileExists = true;
  } catch (err) {
    setBusy(submit, false);
    say(profileAlert, dataErrorMessage(err));
    return;
  }
  try {
    if (displayName !== (user.displayName ?? '')) await updateProfile(user, { displayName });
    writeUserCache(user);
    renderUser(user);
    say(profileStatus, m('profileSaved'));
  } catch (err) {
    say(profileAlert, authErrorMessage(err));
  } finally {
    setBusy(submit, false);
  }
});

/* ---------- Gửi yêu cầu dịch vụ (requests) ---------- */

const requestForm = byId<HTMLFormElement>('request-form');
const rPlan = byId<HTMLSelectElement>('r-plan');
const rNote = byId<HTMLTextAreaElement>('r-note');
const rNoteCount = byId('r-note-count');
const rNoteOptional = byId('r-note-optional');
const planPrice = byId('r-plan-price');
const requestAlert = byId('request-alert');
const requestStatus = byId('request-status');

/** Tên gói theo id, lấy từ chính các lựa chọn trong ô chọn (đã chuyển ngữ khi build). */
const planName = (id: string) =>
  Array.from(rPlan.options)
    .find((o) => o.value === id && id)
    ?.textContent?.trim() || id;

function updatePlanInfo() {
  const option = rPlan.selectedOptions[0];
  planPrice.replaceChildren();
  if (option?.dataset.price) {
    const label = document.createElement('strong');
    label.textContent = `${planPrice.dataset.label} `;
    planPrice.append(label, option.dataset.price);
    if (option.dataset.href) {
      const link = document.createElement('a');
      link.href = option.dataset.href;
      link.textContent = planPrice.dataset.details ?? '';
      planPrice.append(' · ', link);
    }
  }
  rNoteOptional.hidden = rPlan.value === 'other';
}

const updateNoteCount = () => {
  rNoteCount.textContent = `${rNote.value.length}/${MAX_NOTE}`;
};

rPlan.addEventListener('change', () => {
  updatePlanInfo();
  if (rPlan.value) fieldError(rPlan);
});
rNote.addEventListener('input', updateNoteCount);
clearOnInput(requestForm);

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!me) return;
  const user = me;
  const submit = requestForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  say(requestAlert, '');
  say(requestStatus, '');

  fieldError(rPlan, rPlan.value ? '' : m('planRequired'));
  checkLength(rNote, MAX_NOTE);
  if (!rNote.value && rPlan.value === 'other') fieldError(rNote, m('noteRequiredOther'));
  checkLength(rContact, MAX_TEXT);
  updateNoteCount();
  if (focusFirstInvalid(requestForm)) return;

  const data: Record<string, unknown> = {
    uid: user.uid,
    planId: rPlan.value,
    note: rNote.value,
    lang: pageLang(),
    status: 'new',
    createdAt: serverTimestamp(),
  };
  if (rContact.value) data.contact = rContact.value;

  setBusy(submit, true, 'busySend');
  try {
    await addDoc(collection(db, 'requests'), data);
    rNote.value = '';
    rPlan.value = '';
    updatePlanInfo();
    updateNoteCount();
    say(requestStatus, m('requestSent'));
    void loadRequests(user);
  } catch (err) {
    say(requestAlert, dataErrorMessage(err));
  } finally {
    setBusy(submit, false);
  }
});

/* ---------- Danh sách yêu cầu ---------- */

interface RequestItem {
  id: string;
  planId: string;
  note: string;
  contact: string;
  status: string;
  createdAt: Date | null;
}

const reqList = byId<HTMLUListElement>('req-list');
const reqEmpty = byId('req-empty');
const requestsAlert = byId('requests-alert');
const requestsStatus = byId('requests-status');

const toItem = (id: string, data: DocumentData): RequestItem => ({
  id,
  planId: str(data, 'planId'),
  note: str(data, 'note'),
  contact: str(data, 'contact'),
  status: str(data, 'status'),
  createdAt:
    typeof (data.createdAt as Timestamp | undefined)?.toDate === 'function'
      ? (data.createdAt as Timestamp).toDate()
      : null,
});

const loadRequests = async (user: User) => {
  say(requestsAlert, '');
  try {
    const snap = await getDocs(query(collection(db, 'requests'), where('uid', '==', user.uid)));
    // Sắp xếp mới nhất lên trước ở trình duyệt (khỏi cần tạo chỉ mục ghép trong Firestore).
    const items = snap.docs
      .map((d) => toItem(d.id, d.data()))
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    reqList.replaceChildren(...items.map(renderRequest));
    reqEmpty.textContent = m('noRequests');
    reqEmpty.hidden = items.length > 0;
  } catch (err) {
    reqEmpty.hidden = true;
    say(requestsAlert, `${m('loadFailed')} ${dataErrorMessage(err)}`, {
      action: { label: m('retry'), run: () => void loadRequests(user) },
    });
  }
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const renderRequest = (item: RequestItem): HTMLLIElement => {
  const li = el('li', 'req');
  li.tabIndex = -1;
  li.dataset.id = item.id;

  const top = el('div', 'req-top');
  top.append(
    el('span', 'req-plan', planName(item.planId)),
    el('span', `badge badge--${item.status}`, statusLabel(item.status)),
  );
  li.append(top);
  if (item.createdAt) li.append(el('p', 'req-meta', m('sentAt', { date: formatDateTime(item.createdAt) })));
  if (item.note) li.append(el('p', 'req-note', item.note));
  if (item.contact) li.append(el('p', 'req-meta', `${m('contactLabel')}: ${item.contact}`));
  if (item.status === 'new') li.append(cancelControls(item, li));
  return li;
};

/** Nút "Hủy yêu cầu" → hỏi lại "Hủy yêu cầu này? [Có, hủy] [Không]" ngay trong thẻ. */
const cancelControls = (item: RequestItem, li: HTMLLIElement): HTMLDivElement => {
  const box = el('div', 'req-actions');
  const showStart = (focus = false) => {
    const start = el('button', 'btn btn-sm btn-danger', m('cancelRequest'));
    start.type = 'button';
    start.addEventListener('click', showConfirm);
    box.replaceChildren(start);
    if (focus) start.focus();
  };
  const showConfirm = () => {
    const question = el('p', undefined, m('cancelConfirm'));
    const yes = el('button', 'btn btn-sm btn-danger', m('cancelYes'));
    const no = el('button', 'btn btn-sm btn-ghost', m('cancelNo'));
    yes.type = 'button';
    no.type = 'button';
    no.addEventListener('click', () => showStart(true));
    yes.addEventListener('click', async () => {
      say(requestsAlert, '');
      say(requestsStatus, '');
      setBusy(yes, true, 'busyCancel');
      no.disabled = true;
      try {
        await updateDoc(doc(db, 'requests', item.id), { status: 'cancelled' });
        const updated = renderRequest({ ...item, status: 'cancelled' });
        li.replaceWith(updated);
        updated.focus();
        say(requestsStatus, m('requestCancelled'));
      } catch (err) {
        say(requestsAlert, dataErrorMessage(err));
        showStart(true);
      }
    });
    box.replaceChildren(question, yes, no);
    yes.focus();
  };
  showStart();
  return box;
};

/* ---------- Đổi mật khẩu ---------- */

const passwordForm = byId<HTMLFormElement>('password-form');
const pwCurrent = byId<HTMLInputElement>('pw-current');
const pwNew = byId<HTMLInputElement>('pw-new');
const pwConfirm = byId<HTMLInputElement>('pw-confirm');

clearOnInput(passwordForm);
passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!me?.email) return;
  const user = me;
  const email = me.email;
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

/* ---------- Đăng xuất ---------- */

const signOutButton = byId<HTMLButtonElement>('sign-out');
signOutButton.addEventListener('click', async () => {
  leaving = true;
  setBusy(signOutButton, true, 'busySignOut');
  try {
    await signOut(auth);
    clearUserCache();
    location.assign(config.paths.home);
  } catch (err) {
    leaving = false;
    setBusy(signOutButton, false);
    say(securityAlert, authErrorMessage(err));
  }
});

/* ---------- Xóa tài khoản ---------- */

const deleteForm = byId<HTMLFormElement>('delete-form');
const delPassword = byId<HTMLInputElement>('del-password');
const delConfirm = byId<HTMLInputElement>('del-confirm');
const deleteAlert = byId('delete-alert');

/** "Xóa", "XOA", "xóa" đều được (bỏ dấu, không phân biệt hoa thường). */
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').trim().toUpperCase();

clearOnInput(deleteForm);
deleteForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!me || leaving) return;
  const user = me;
  const submit = deleteForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  const word = deleteForm.dataset.word ?? '';
  const withPassword = hasPassword(user);
  say(deleteAlert, '');

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
      await deleteDoc(doc(db, 'users', user.uid)); // hồ sơ trước (yêu cầu dịch vụ được giữ lại)
      stage = 'auth';
      await deleteUser(user);
      clearUserCache();
      byId('acc-app').hidden = true;
      const done = byId('acc-deleted');
      done.hidden = false;
      done.focus();
      window.scrollTo({ top: 0 });
    })
    .catch((err) => {
      leaving = false;
      setBusy(submit, false);
      const message =
        stage === 'reauth'
          ? authErrorMessage(err, withPassword ? 'reauth' : 'google')
          : stage === 'data'
            ? dataErrorMessage(err)
            : authErrorMessage(err);
      say(deleteAlert, message);
      if (stage === 'reauth' && withPassword) delPassword.select();
    });
});

setupPasswordToggles(document);
updateNoteCount();
// Chạy sau cùng: mọi phần tử và hàm ở trên đã sẵn sàng khi Firebase báo trạng thái đăng nhập.
start();
