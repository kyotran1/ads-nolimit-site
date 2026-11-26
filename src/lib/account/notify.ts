/**
 * Mục "Thông báo": nhận báo khi TKQC sắp hết ngân sách qua Email, Messenger (nối bằng mã) và Zalo (nhân viên gửi tay).
 * Dữ liệu: users/{uid}.notify (khách tự ghi), notifyCodes/{mã} (khách tạo), notifyLinks/{uid} (Apps Script ghi, khách đọc / bỏ nối).
 * PSID Messenger nằm ở notifyPrivate/{uid}: trình duyệt không đọc được. Phần thuần: ./notify-format.ts.
 * Firestore bản "lite" không có onSnapshot nên khi đang chờ nối, trang hỏi lại notifyLinks mỗi 3 giây (chỉ lúc mục đang mở).
 */
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore/lite';
import { fieldError, say } from '../auth/client';
import { dataErrorMessage } from '../auth/messages';
import { byId, confirmDialog, copyText, toast } from '../ui/dom';
import { isVisible, lang, me, register } from './ctx';
import { messengerDecision, messengerMode, NOTIFY_TEST_KEY } from '../../config/notify-flags';
import { CODE_RE, DEFAULT_NOTIFY, makeCode, messengerLink, messengerText, normalizeZaloPhone, parseNotify, pendingValid } from './notify-format';
import type { NotifyPrefs } from './notify-format';
import { db } from './store';

const T = {
  vi: {
    saved: 'Đã lưu.',
    saveFailed: 'Chưa lưu được.',
    phoneBad: 'Số Zalo chưa đúng. Nhập 10 số bắt đầu bằng 0, ví dụ 0912345678.',
    phoneNeeded: 'Nhập số Zalo của bạn trước khi bật nhắc qua Zalo.',
    zaloOff: 'Đã tắt nhắc qua Zalo.',
    connectFailed: 'Chưa tạo được mã nối. Kiểm tra mạng rồi thử lại.',
    popupBlocked: 'Messenger chưa tự mở. Bấm "Mở lại Messenger" bên dưới.',
    codeCopied: 'Đã chép dòng mã. Dán vào Messenger nếu không thấy nút Bắt đầu.',
    notYet: 'Chưa thấy tin của bạn. Gửi tin có sẵn trong Messenger, chờ vài giây rồi bấm lại.',
    linked: 'Đã nối Messenger.',
    unlinked: 'Đã bỏ nối Messenger.',
    unlinkTitle: 'Bỏ nối Messenger?',
    unlinkBody: 'Bạn sẽ không nhận thông báo qua Messenger nữa. Bạn có thể nối lại bất cứ lúc nào.',
    unlinkYes: 'Bỏ nối',
    cancel: 'Giữ lại',
    copied: 'Đã chép',
    copy: 'Chép',
    waitLong: 'Đã chờ khá lâu. Nếu bạn đã gửi tin mà chưa thấy "Đã nối", bấm "Tôi đã gửi" hoặc Hủy rồi nối lại.',
    retry: 'Thử lại',
  },
  en: {
    saved: 'Saved.',
    saveFailed: 'Could not save.',
    phoneBad: 'That Zalo number looks wrong. Enter 10 digits starting with 0, for example 0912345678.',
    phoneNeeded: 'Enter your Zalo number before turning on Zalo reminders.',
    zaloOff: 'Zalo reminders are off.',
    connectFailed: 'Could not create a connect code. Check your network and try again.',
    popupBlocked: 'Messenger did not open by itself. Press "Reopen Messenger" below.',
    codeCopied: 'Code line copied. Paste it in Messenger if you do not see Get started.',
    notYet: 'We do not see your message yet. Send the ready-made message in Messenger, wait a few seconds and press again.',
    linked: 'Messenger connected.',
    unlinked: 'Messenger disconnected.',
    unlinkTitle: 'Disconnect Messenger?',
    unlinkBody: 'You will stop receiving notices on Messenger. You can connect again at any time.',
    unlinkYes: 'Disconnect',
    cancel: 'Keep it',
    copied: 'Copied',
    copy: 'Copy',
    waitLong: 'This has taken a while. If you already sent the message but do not see "Connected", press "I sent it" or Cancel and connect again.',
    retry: 'Try again',
  },
}[lang];

/** Có thẻ Messenger trong trang này không (cờ build + chế độ thử + thẻ có trong HTML). Tắt thì không đụng tới phần tử/dữ liệu Messenger nào. */
const messengerActive = (() => {
  if (messengerMode === 'off') return false;
  const card = document.getElementById('nt-msg-card');
  if (!card) return false;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(NOTIFY_TEST_KEY);
  } catch {
    /* không đọc được: coi như chưa bật */
  }
  const d = messengerDecision(messengerMode, location.search, stored);
  try {
    if (d.write === '1') localStorage.setItem(NOTIFY_TEST_KEY, '1');
    else if (d.write === 'remove') localStorage.removeItem(NOTIFY_TEST_KEY);
  } catch {
    /* chế độ riêng tư: vẫn bật cho lần tải trang này */
  }
  card.hidden = !d.show;
  return d.show;
})();

const els = {
  grid: byId('nt-grid'),
  alert: byId('nt-alert'),
  status: byId('nt-status'),
  email: byId<HTMLInputElement>('nt-email'),
  msg: byId('nt-msg'),
  connect: byId<HTMLButtonElement>('nt-connect'),
  check: byId<HTMLButtonElement>('nt-check'),
  cancel: byId<HTMLButtonElement>('nt-cancel'),
  reopen: byId<HTMLAnchorElement>('nt-reopen'),
  codeText: byId('nt-code-text'),
  codeCopy: byId<HTMLButtonElement>('nt-code-copy'),
  messenger: byId<HTMLInputElement>('nt-messenger'),
  unlink: byId<HTMLButtonElement>('nt-unlink'),
  zaloForm: byId<HTMLFormElement>('nt-zalo-form'),
  zaloPhone: byId<HTMLInputElement>('nt-zalo-phone'),
  zalo: byId<HTMLInputElement>('nt-zalo'),
  zaloSave: byId<HTMLButtonElement>('nt-zalo-save'),
};

let prefs: NotifyPrefs = { ...DEFAULT_NOTIFY };
let loaded = false;
let loading = false;
let linked = false;
let saving = false;
/** Khách đang gõ dở ô số Zalo (chưa lưu): đừng ghi đè bằng giá trị đã lưu khi vẽ lại. */
let phoneDirty = false;
/** Số điện thoại trong hồ sơ, đã chuẩn hóa (gợi ý cho ô số Zalo). */
let phoneHint = '';

/* ---------- Mã nối đang chờ (nhớ ở máy này, vì khách rời trang sang Messenger rồi quay lại) ---------- */

const PENDING_KEY = 'nolimit.notify.pending';
interface Pending {
  code: string;
  uid: string;
  at: number;
}
let pending: Pending | null = null;

const readPending = (uid: string): Pending | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as Pending | null;
    if (raw && raw.uid === uid && CODE_RE.test(String(raw.code)) && pendingValid(Number(raw.at), Date.now())) return raw;
  } catch {
    /* localStorage bị chặn hoặc hỏng: coi như không có */
  }
  return null;
};
const savePending = (p: Pending | null) => {
  pending = p;
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* bỏ qua */
  }
};

/* ---------- Vẽ giao diện ---------- */

type MsgState = 'off' | 'wait' | 'on';

const setMsgState = (state: MsgState) => {
  els.msg.dataset.state = state;
  els.msg.querySelectorAll<HTMLElement>('[data-when]').forEach((b) => (b.hidden = b.dataset.when !== state));
  if (state === 'wait' && pending) {
    els.codeText.textContent = messengerText(pending.code);
    els.reopen.href = messengerLink(pending.code);
  }
};

const currentState = (): MsgState => (linked ? 'on' : pending ? 'wait' : 'off');

const lockUi = (locked: boolean) => {
  els.grid.setAttribute('aria-busy', String(locked));
  for (const el of [els.email, els.zalo, els.zaloPhone, els.zaloSave, ...(messengerActive ? [els.messenger] : [])]) el.disabled = locked;
};

const render = () => {
  els.email.checked = prefs.email;
  if (messengerActive) els.messenger.checked = prefs.messenger;
  els.zalo.checked = prefs.zalo;
  if (phoneDirty) {
    /* giữ chữ khách đang gõ */
  } else if (prefs.zaloPhone) els.zaloPhone.value = prefs.zaloPhone;
  else if (!els.zaloPhone.value) {
    // Gợi ý sẵn số trong hồ sơ nếu dùng được (chưa lưu cho tới khi khách bấm Lưu / bật công tắc)
    if (phoneHint) els.zaloPhone.value = phoneHint;
  }
  if (messengerActive) setMsgState(currentState());
};

/* ---------- Ghi users/{uid}.notify ---------- */

/** Hồ sơ users/{uid} đã có (kết quả getDoc trong load()). null = chưa biết. */
let profileExists: boolean | null = null;

const isCode = (err: unknown, part: string) => String((err as { code?: string })?.code ?? '').includes(part);

const writeNotify = async (next: NotifyPrefs) => {
  const user = me();
  if (!user) throw new Error('no-user');
  const ref = doc(db, 'users', user.uid);
  const notify = { email: next.email, messenger: next.messenger, zalo: next.zalo, zaloPhone: next.zaloPhone };
  // Khách chưa có hồ sơ users/{uid} (đăng nhập bằng cách khác, hồ sơ chưa kịp tạo): tạo hồ sơ tối thiểu kèm notify bằng setDoc(merge),
  // không dùng updateDoc (sẽ lỗi not-found). Đã có hồ sơ thì updateDoc để không đụng trường khác.
  const create = async () => {
    const data: Record<string, unknown> = { displayName: (user.displayName ?? '').slice(0, 120), notify, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    if (user.email) data.email = user.email;
    await setDoc(ref, data, { merge: true });
    profileExists = true;
  };
  if (profileExists === false) {
    try {
      await create();
    } catch (err) {
      // Luật có thể coi đây là "sửa" nếu hồ sơ vừa được tạo ở nơi khác: thử lại bằng updateDoc
      if (!isCode(err, 'permission-denied')) throw err;
      await updateDoc(ref, { notify, updatedAt: serverTimestamp() });
      profileExists = true;
    }
    return;
  }
  try {
    await updateDoc(ref, { notify, updatedAt: serverTimestamp() });
  } catch (err) {
    if (!isCode(err, 'not-found')) throw err;
    await create();
  }
};

/** Lưu tùy chọn mới; lỗi thì trả lại giao diện về giá trị đã lưu. Trả về true nếu lưu được. */
const save = async (next: NotifyPrefs, message = T.saved): Promise<boolean> => {
  if (saving) return false;
  saving = true;
  say(els.alert, '');
  try {
    await writeNotify(next);
    prefs = next;
    phoneDirty = false;
    say(els.status, message);
    return true;
  } catch (err) {
    say(els.alert, `${T.saveFailed} ${dataErrorMessage(err)}`);
    return false;
  } finally {
    saving = false;
    render();
  }
};

/* ---------- Công tắc ---------- */

els.email.addEventListener('change', () => void save({ ...prefs, email: els.email.checked }));
if (messengerActive) els.messenger.addEventListener('change', () => void save({ ...prefs, messenger: els.messenger.checked }));

/** Đọc ô số Zalo; báo lỗi ngay dưới ô nếu sai. Trả về số đã chuẩn hóa ('' = chưa nhập) hoặc null nếu sai. */
const readPhone = (): string | null => {
  const phone = normalizeZaloPhone(els.zaloPhone.value);
  if (phone === null) {
    fieldError(els.zaloPhone, T.phoneBad);
    return null;
  }
  els.zaloPhone.value = phone;
  fieldError(els.zaloPhone, '');
  return phone;
};

els.zaloPhone.addEventListener('input', () => {
  phoneDirty = true;
  fieldError(els.zaloPhone, '');
});

els.zalo.addEventListener('change', async () => {
  say(els.status, '');
  if (!els.zalo.checked) {
    await save({ ...prefs, zalo: false }, T.zaloOff);
    return;
  }
  const phone = readPhone();
  if (phone === null) {
    els.zalo.checked = false;
    els.zaloPhone.focus();
    return;
  }
  if (phone === '') {
    els.zalo.checked = false;
    fieldError(els.zaloPhone, T.phoneNeeded);
    els.zaloPhone.focus();
    return;
  }
  await save({ ...prefs, zalo: true, zaloPhone: phone });
});

els.zaloForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  say(els.status, '');
  const phone = readPhone();
  if (phone === null) {
    els.zaloPhone.focus();
    return;
  }
  // Xóa số thì tắt luôn nhắc Zalo (không nhắc khi không có số)
  await save({ ...prefs, zaloPhone: phone, zalo: phone === '' ? false : prefs.zalo });
});

/* ---------- Nối / bỏ nối Messenger ---------- */

let timer = 0;
let waitStarted = 0;

const stopPolling = () => {
  if (timer) window.clearInterval(timer);
  timer = 0;
};

/** Hỏi lại notifyLinks/{uid}. Trả về true nếu đã nối. */
const checkLink = async (): Promise<boolean> => {
  const user = me();
  if (!user) return false;
  try {
    const snap = await getDoc(doc(db, 'notifyLinks', user.uid));
    const data = snap.data() as { messenger?: { linked?: boolean } } | undefined;
    const isLinked = data?.messenger?.linked === true;
    if (isLinked && !linked) {
      linked = true;
      savePending(null);
      stopPolling();
      say(els.status, ''); // xóa dòng "Đã chờ khá lâu…" nếu đang hiện
      render();
      toast(T.linked);
    }
    return isLinked;
  } catch {
    return false; // lỗi mạng thoáng qua: lần hỏi sau thử lại
  }
};

const startPolling = () => {
  stopPolling();
  waitStarted = Date.now();
  timer = window.setInterval(() => {
    if (!pending || linked || !isVisible('notify')) {
      stopPolling();
      return;
    }
    if (document.hidden) return;
    if (Date.now() - waitStarted > 10 * 60 * 1000) {
      stopPolling();
      say(els.status, T.waitLong, { kind: 'info' });
      return;
    }
    void checkLink();
  }, 3000);
};

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && pending && !linked && isVisible('notify')) void checkLink();
});

els.connect?.addEventListener('click', async () => {
  const user = me();
  if (!user || els.connect.disabled) return;
  say(els.alert, '');
  say(els.status, '');
  els.connect.disabled = true;
  // Điện thoại chỉ cho mở cửa sổ / chép khi còn đang trong thao tác bấm: làm cả hai NGAY ở đây, trước mọi await.
  // Mở cửa sổ trống rồi đổi địa chỉ sau khi mã đã lưu xong; bị chặn (w = null) thì dùng nút "Mở lại Messenger".
  const w = window.open('', '_blank');
  const code = makeCode((b) => crypto.getRandomValues(b));
  const copied = copyText(messengerText(code));
  try {
    // Mỗi khách giữ ít mã nhất có thể: xóa mã cũ của máy này (nếu còn) trước khi tạo mã mới. Không xóa được thì Apps Script sẽ dọn.
    if (pending) {
      try {
        await deleteDoc(doc(db, 'notifyCodes', pending.code));
      } catch {
        /* mã đã hết hạn / đã dùng, hoặc mạng chập chờn */
      }
      savePending(null);
    }
    await setDoc(doc(db, 'notifyCodes', code), { uid: user.uid, createdAt: serverTimestamp() });
    savePending({ code, uid: user.uid, at: Date.now() });
    setMsgState('wait');
    if (w) {
      try {
        w.opener = null;
      } catch {
        /* bỏ qua */
      }
      w.location.href = messengerLink(code);
    }
    const didCopy = await copied;
    if (!w) say(els.status, didCopy ? `${T.popupBlocked} ${T.codeCopied}` : T.popupBlocked, { kind: 'info' });
    else if (didCopy) say(els.status, T.codeCopied, { kind: 'info' });
    startPolling();
  } catch (err) {
    if (w) w.close();
    say(els.alert, `${T.connectFailed} ${dataErrorMessage(err)}`);
  } finally {
    els.connect.disabled = false;
  }
});

els.check?.addEventListener('click', async () => {
  els.check.disabled = true;
  say(els.status, '');
  const ok = await checkLink();
  if (!ok) say(els.status, T.notYet, { kind: 'info' });
  els.check.disabled = false;
});

els.cancel?.addEventListener('click', async () => {
  const code = pending?.code;
  stopPolling();
  savePending(null);
  setMsgState(currentState());
  say(els.status, '');
  if (code) {
    try {
      await deleteDoc(doc(db, 'notifyCodes', code));
    } catch {
      /* mã sẽ tự hết hạn sau 24 giờ */
    }
  }
});

els.codeCopy?.addEventListener('click', async () => {
  if (!pending) return;
  const ok = await copyText(messengerText(pending.code));
  const label = els.codeCopy.textContent;
  els.codeCopy.textContent = ok ? T.copied : '!';
  window.setTimeout(() => (els.codeCopy.textContent = label === T.copied ? T.copy : label), 1800);
});

els.unlink?.addEventListener('click', async () => {
  const user = me();
  if (!user) return;
  const { ok } = await confirmDialog({ title: T.unlinkTitle, body: [T.unlinkBody], confirm: T.unlinkYes, cancel: T.cancel });
  if (!ok) return;
  els.unlink.disabled = true;
  say(els.alert, '');
  try {
    await setDoc(doc(db, 'notifyLinks', user.uid), { messenger: { linked: false } });
    linked = false;
    savePending(null);
    render();
    toast(T.unlinked);
  } catch (err) {
    say(els.alert, `${T.saveFailed} ${dataErrorMessage(err)}`);
  } finally {
    els.unlink.disabled = false;
  }
});

/* ---------- Tải dữ liệu khi mở mục ---------- */

const load = async () => {
  const user = me();
  if (!user || loading) return;
  loading = true;
  say(els.alert, '');
  lockUi(true);
  try {
    const [profile, link] = await Promise.all([getDoc(doc(db, 'users', user.uid)), messengerActive ? getDoc(doc(db, 'notifyLinks', user.uid)) : Promise.resolve(null)]);
    profileExists = profile.exists();
    prefs = parseNotify(profile.data());
    const rawPhone = profile.data()?.phone;
    phoneHint = typeof rawPhone === 'string' ? (normalizeZaloPhone(rawPhone) ?? '') : '';
    linked = (link?.data() as { messenger?: { linked?: boolean } } | undefined)?.messenger?.linked === true;
    pending = linked || !messengerActive ? null : readPending(user.uid);
    if (linked) savePending(null);
    loaded = true;
    render();
    if (messengerActive && pending && !linked) startPolling();
  } catch (err) {
    say(els.alert, `${T.saveFailed} ${dataErrorMessage(err)}`, { action: { label: T.retry, run: () => void load() } });
  } finally {
    loading = false;
    lockUi(!loaded);
  }
};

register('notify', {
  enter() {
    if (!loaded) void load();
    else if (messengerActive && pending && !linked) {
      void checkLink();
      startPolling();
    }
  },
});
