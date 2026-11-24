/**
 * Trang tài khoản V4 — khởi động: bắt buộc đăng nhập, vẽ menu, chuyển mục theo #neo, tải dữ liệu nền.
 * Mỗi mục nằm trong một file riêng (overview.ts, topup.ts, orders.ts, services.ts, courses.ts, guides.ts,
 * keys.ts, profile.ts, security.ts) và tự đăng ký qua register() trong ctx.ts.
 */
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, config as authConfig, say, setupPasswordToggles } from '../auth/client';
import { m } from '../auth/messages';
import { clearUserCache, initialOf, nameOf, profileAvatarUrl, writeUserCache } from '../auth/user-cache';
import { byId } from '../ui/dom';
import { lang, me, modules, money, setMe, setRoute } from './ctx';
import { hashFor, parseHash, sections } from './routes';
import type { Route } from './routes';
import { ensure, on, state } from './store';
import { renderHello } from './overview';
import './topup';
import './orders';
import { selectCard } from './services';
import './courses';
import './guides';
import './keys';
import './ads';
import { loadProfile } from './profile';
import { isLeaving, renderSecurity, whenDeleted } from './security';

const titleEl = byId('dash-title');
const views = Array.from(document.querySelectorAll<HTMLElement>('[data-view]'));
const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-route]'));
const baseTitle = document.title;

/* ---------- Chuyển mục ---------- */

let started = false;

const show = (r: Route, focus: boolean) => {
  const section = sections.find((s) => s.id === r.section) ?? sections[0];
  setRoute(r);
  views.forEach((v) => (v.hidden = v.dataset.view !== section.id));
  navLinks.forEach((a) => {
    if (a.dataset.route === section.id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const label = (section.title ?? section.label)[lang];
  titleEl.textContent = label;
  document.title = `${section.label[lang]} · ${baseTitle}`;
  modules.get(section.id)?.enter(r);
  if (focus) {
    titleEl.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }
  // Điện thoại: đưa mục đang chọn vào giữa thanh mục cuộn ngang
  const active = navLinks.find((a) => a.dataset.route === section.id);
  const nav = active?.closest('.side-nav');
  if (active && nav && nav.scrollWidth > nav.clientWidth) {
    nav.scrollTo({ left: active.offsetLeft - nav.clientWidth / 2 + active.offsetWidth / 2, behavior: 'smooth' });
  }
};

/** Đọc #neo; neo của ngôn ngữ kia / neo cũ của V3 → đổi sang neo đúng của trang (không thêm vào lịch sử). */
const fromHash = (): Route | null => {
  const r = parseHash(location.hash);
  if (!r) return null;
  const canonical = hashFor(r.section, lang, r.sub);
  if (location.hash !== canonical) history.replaceState(history.state, '', location.pathname + location.search + canonical);
  return r;
};

window.addEventListener('hashchange', () => {
  if (!started) return;
  const r = fromHash();
  if (r) show(r, true); // neo lạ (ví dụ #noi-dung của nút "Bỏ qua"): giữ nguyên mục
});

/* ---------- Người dùng ---------- */

/** Ảnh đại diện: ưu tiên ảnh khách tải lên (hồ sơ), rồi ảnh Google; không có → chữ cái đầu. */
const renderAvatar = (user: User) => {
  const box = byId('acc-avatar');
  const name = nameOf(user);
  box.replaceChildren(document.createTextNode(initialOf(name)));
  const src = profileAvatarUrl() || (user.photoURL && /^https:\/\//.test(user.photoURL) ? user.photoURL : '');
  if (src) {
    const img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.addEventListener('load', () => box.replaceChildren(img), { once: true });
    img.src = src;
  }
};

const renderUser = (user: User) => {
  renderAvatar(user);
  byId('side-name').textContent = nameOf(user);
  byId('side-email').textContent = user.email ?? '';
  renderHello();
  renderSecurity(user);
};

/* ---------- Số dư & khóa (mọi chỗ cùng lúc) ---------- */

on(['wallet'], () => {
  const text = state.wallet ? money(state.wallet.balance) : '—';
  document.querySelectorAll<HTMLElement>('[data-bind="balance"]').forEach((el) => (el.textContent = text));
});
on(['access'], () => {
  document.querySelectorAll<HTMLElement>('[data-lock="courses"]').forEach((el) => (el.hidden = state.access.size > 0));
});

/* ---------- ?welcome=… (vừa tạo tài khoản), ?plan=… (chọn sẵn dịch vụ) ---------- */

const readParams = (user: User): Route | null => {
  const params = new URLSearchParams(location.search);
  const welcome = params.get('welcome');
  const notice = byId('acc-notice');
  if (welcome === '1') say(notice, m('welcome', { email: user.email ?? '' }), { kind: 'success' });
  else if (welcome === 'noverify') say(notice, m('welcomeNoVerify'), { kind: 'info' });
  else if (welcome === 'google') say(notice, m('welcomeGoogle'), { kind: 'success' });

  const plan = params.get('plan');
  let route: Route | null = null;
  if (plan && /^[a-z0-9-]{1,40}$/.test(plan)) {
    selectCard(plan);
    route = { section: 'services', sub: '' };
  }
  if (params.has('welcome') || params.has('plan')) {
    params.delete('welcome');
    params.delete('plan');
    const search = params.toString();
    const hash = route ? hashFor('services', lang) : location.hash;
    history.replaceState(history.state, '', location.pathname + (search ? `?${search}` : '') + hash);
  }
  return route;
};

/* ---------- Khởi động: bắt buộc đăng nhập ---------- */

const signInUrl = () => `${authConfig.paths.signIn}?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;

whenDeleted(() => {
  byId('acc-app').hidden = true;
  const done = byId('acc-deleted');
  done.hidden = false;
  done.focus();
  window.scrollTo({ top: 0 });
});

const start = () =>
  onAuthStateChanged(auth, (user) => {
    if (isLeaving()) return;
    if (!user) {
      clearUserCache();
      location.replace(signInUrl());
      return;
    }
    const first = me() === null;
    setMe(user);
    state.uid = user.uid;
    writeUserCache(user);
    renderUser(user);
    if (!first) return;
    byId('acc-loading').hidden = true;
    byId('acc-app').hidden = false;
    const fromParams = readParams(user);
    started = true;
    show(fromParams ?? fromHash() ?? { section: 'overview', sub: '' }, false);
    // Dữ liệu nền cho menu, tổng quan và số dư
    void ensure('wallet', 'access', 'orders', 'keys', 'topups', 'transactions', 'adAccounts');
    void loadProfile(user, (u) => renderUser(u));
  });

setupPasswordToggles(document);
// Chạy sau cùng: mọi phần tử và hàm ở trên đã sẵn sàng khi Firebase báo trạng thái đăng nhập.
start();
