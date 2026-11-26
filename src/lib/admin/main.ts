/**
 * Trang quản trị /quan-tri/ — khởi động: bắt buộc đăng nhập, kiểm tra quyền (admins/<uid> trong Firestore),
 * chuyển tab bằng #neo. Không có quyền: hiện "Không có quyền truy cập" kèm UID để chủ tự thêm mình làm quản trị viên.
 */
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore/lite';
import { auth, config as authConfig } from '../auth/client';
import { clearUserCache, nameOf, writeUserCache } from '../auth/user-cache';
import { byId, copyButton, h, icon } from '../ui/dom';
import { db, errText, setAdmin } from './shared';
import { renderCustomers, renderOrders, renderOverview, renderRequests, renderTopups } from './money';
import { renderKeys } from './keys';
import { renderAdAccounts } from './accounts';
import { renderCustomer } from './customer';
import { renderContent } from './content';
import { renderSettings } from './settings';
import { renderZaloQueue } from './zalo-queue';

const tabs: Record<string, { title: string; render: (root: HTMLElement) => Promise<void> | void }> = {
  'tong-quan': { title: 'Tổng quan', render: renderOverview },
  'nap-tien': { title: 'Nạp tiền', render: renderTopups },
  'don-hang': { title: 'Đơn hàng', render: renderOrders },
  'yeu-cau': { title: 'Yêu cầu dịch vụ', render: renderRequests },
  'khach-hang': { title: 'Khách hàng', render: renderCustomers },
  'tai-khoan-quang-cao': { title: 'Tài khoản quảng cáo', render: renderAdAccounts },
  'key-may': { title: 'Key & máy', render: renderKeys },
  'noi-dung': { title: 'Khóa học & Hướng dẫn', render: renderContent },
  'nhac-zalo': { title: 'Nhắc qua Zalo', render: renderZaloQueue },
  'cai-dat': { title: 'Cài đặt thanh toán', render: renderSettings },
};

// Nút "Làm mới": các mục quản trị tự nạp dữ liệu khi mở, nên tải lại trang là lấy số liệu mới nhất (giữ nguyên mục đang xem nhờ hash).
const refreshBtn = document.getElementById('adm-refresh') as HTMLButtonElement | null;
if (refreshBtn) {
  refreshBtn.prepend(icon('refresh'));
  refreshBtn.addEventListener('click', () => {
    refreshBtn.disabled = true;
    refreshBtn.classList.add('is-busy');
    location.reload();
  });
}

const titleEl = byId('dash-title');
const root = byId('adm-view');
const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-tab]'));
let ready = false;
/** Đang đăng xuất: không tự chuyển sang trang đăng nhập khi Firebase báo "đã thoát". */
let leaving = false;

/** #khach-hang/<uid>[/<tab>] → trang chi tiết khách; null nếu không phải. */
const customerRoute = (hash: string): { uid: string; tab: string } | null => {
  const m = /^khach-hang\/([A-Za-z0-9_-]{1,128})(?:\/([a-z-]{1,20}))?$/.exec(hash);
  return m ? { uid: m[1], tab: m[2] ?? 'dich-vu' } : null;
};
const knownHash = (hash: string) => hash in tabs || customerRoute(hash) !== null;

const show = (focus: boolean) => {
  const hash = location.hash.slice(1);
  const cust = customerRoute(hash);
  const id = cust ? 'khach-hang' : hash in tabs ? hash : 'tong-quan';
  links.forEach((a) => (a.dataset.tab === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  titleEl.textContent = tabs[id].title;
  document.title = `${tabs[id].title} · Quản trị | ADS-Nolimit`;
  if (cust) {
    void renderCustomer(root, cust.uid, cust.tab).then(() => {
      const name = root.querySelector('.adm-cust-id h2')?.textContent;
      if (name) {
        titleEl.textContent = `Khách hàng · ${name}`;
        document.title = `${name} · Khách hàng · Quản trị | ADS-Nolimit`;
      }
    });
  } else void tabs[id].render(root);
  if (focus) {
    titleEl.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }
};

window.addEventListener('hashchange', () => {
  if (ready && knownHash(location.hash.slice(1))) show(true);
});

document.querySelectorAll<HTMLButtonElement>('[data-signout]').forEach((b) =>
  b.addEventListener('click', async () => {
    b.disabled = true;
    leaving = true;
    await signOut(auth);
    clearUserCache();
    location.assign('/');
  }),
);

const denied = (uid: string, email: string, reason?: string) => {
  byId('adm-loading').hidden = true;
  const box = byId('adm-denied');
  box.hidden = false;
  byId('adm-denied-email').textContent = email;
  byId('adm-denied-uid').replaceChildren(h('code', { class: 'mono', text: uid }), copyButton(() => uid, { copy: 'Chép UID', copied: 'Đã chép', failed: 'Lỗi' }));
  if (reason) byId('adm-denied-reason').textContent = reason;
};

let started = false;
onAuthStateChanged(auth, async (user) => {
  if (leaving) return;
  if (!user) {
    location.replace(`${authConfig.paths.signIn}?next=${encodeURIComponent(location.pathname + location.hash)}`);
    return;
  }
  if (started) return;
  started = true;
  writeUserCache(user);
  let isAdmin = false;
  try {
    isAdmin = (await getDoc(doc(db, 'admins', user.uid))).exists();
  } catch (err) {
    denied(user.uid, user.email ?? '', errText(err));
    return;
  }
  if (!isAdmin) {
    denied(user.uid, user.email ?? '');
    return;
  }
  setAdmin(user.uid);
  byId('adm-name').textContent = nameOf(user);
  byId('adm-email').textContent = user.email ?? '';
  byId('adm-loading').hidden = true;
  byId('adm-app').hidden = false;
  ready = true;
  show(false);
});
