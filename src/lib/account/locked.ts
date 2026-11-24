/**
 * Mục chưa được cấp (V4.2): Báo cáo quảng cáo, Khóa học, Key & máy, Hướng dẫn vẫn nằm trên menu (có biểu tượng khóa);
 * mở ra thấy giới thiệu ngắn + nút liên hệ để mở, thay vì trang trống. Mục mở khi chủ cấp quyền (customerServices.access)
 * HOẶC đã có dữ liệu thật (TKQC gắn, khóa học đã mua, key đã cấp) — xem isOpen() trong ../customer/services.
 *
 * main.ts chỉ gọi hai chỗ: gate(section, view) trong show() và initLocks(reshow) lúc khởi động.
 */
import { primaryChannel } from '../../config/site';
import { isOpen } from '../customer/services';
import type { AccessKey } from '../customer/services';
import { h, icon } from '../ui/dom';
import type { IconName } from '../../components/icon-paths';
import { go, lang, route } from './ctx';
import type { SectionId } from './routes';
import { autoFacts, ensure, errors, isLoaded, isLoading, on, state } from './store';

// Khóa học KHÔNG khóa: khách phải xem được danh mục để tự mua/mở khóa (như V4.1); bài học vẫn theo courseAccess.
const LOCKABLE: readonly AccessKey[] = ['ads', 'keys', 'guides'];
const isLockable = (id: SectionId): id is AccessKey => (LOCKABLE as readonly string[]).includes(id);

const T = {
  vi: {
    locked: 'Chưa mở cho tài khoản của bạn',
    contact: 'Liên hệ để mở',
    services: 'Xem dịch vụ',
    ads: {
      title: 'Báo cáo quảng cáo',
      text: 'Khi ADS-Nolimit chạy quảng cáo hoặc cấp tài khoản quảng cáo cho bạn, mục này hiện số dư, chi tiêu và kết quả từng ngày của từng tài khoản, số liệu lấy thẳng từ Meta.',
      icon: 'chart',
    },
    courses: {
      title: 'Khóa học',
      text: 'Khóa học quảng cáo, AI và tự động hóa do ADS-Nolimit biên soạn. Mua bằng số dư hoặc được cấp khi bạn dùng dịch vụ đào tạo.',
      icon: 'book',
    },
    keys: {
      title: 'Key & máy',
      text: 'Quản lý key phần mềm ADS-NOLIMIT AI Office và các máy đã kích hoạt. Mục này mở khi bạn được cấp key.',
      icon: 'key',
    },
    guides: {
      title: 'Hướng dẫn sử dụng',
      text: 'Hướng dẫn từng bước cho phần mềm và dịch vụ bạn đang dùng. ADS-Nolimit mở mục này cho khách đang dùng dịch vụ.',
      icon: 'guide',
    },
  },
  en: {
    locked: 'Not enabled for your account yet',
    contact: 'Contact us to enable',
    services: 'Browse services',
    ads: {
      title: 'Ad reports',
      text: 'Once ADS-Nolimit runs ads or provides an ad account for you, this section shows balance, spend and daily results per account, straight from Meta.',
      icon: 'chart',
    },
    courses: {
      title: 'Courses',
      text: 'Advertising, AI and automation courses by ADS-Nolimit. Buy with your balance, or get access with a training service.',
      icon: 'book',
    },
    keys: {
      title: 'Keys & devices',
      text: 'Manage your ADS-NOLIMIT AI Office software keys and activated devices. Opens once you are issued a key.',
      icon: 'key',
    },
    guides: {
      title: 'User guides',
      text: 'Step-by-step guides for the software and services you use. ADS-Nolimit enables this for active customers.',
      icon: 'guide',
    },
  },
}[lang];

/** Dữ liệu cần có trước khi quyết định khóa/mở. */
const READY = ['customerServices', 'adAccounts', 'access', 'keys'] as const;
// "Xong" = đã tải hoặc tải LỖI (lỗi → mở như thường để module tự hiện thông báo + Thử lại; không gọi ensure lặp)
const done = (k: (typeof READY)[number]) => isLoaded(k) || errors.has(k);
const ready = () => READY.every(done);
const anyError = () => READY.some((k) => errors.has(k));
const locked = (id: AccessKey) => !isOpen(id, state.customerServices, autoFacts());

/** Nội dung thay cho mục bị khóa. */
export const lockedView = (id: AccessKey): HTMLElement => {
  const c = T[id];
  const support = primaryChannel[lang];
  return h(
    'div',
    { class: 'locked-view', 'data-locked': id },
    h('span', { class: 'icon-tile icon-tile--lg', 'aria-hidden': 'true' }, icon(c.icon as IconName)),
    h('p', { class: 'locked-tag' }, icon('lock'), T.locked),
    h('h2', { text: c.title }),
    h('p', { class: 'locked-text', text: c.text }),
    h(
      'div',
      { class: 'btn-row' },
      h('a', { class: 'btn btn-primary', href: support.href, target: '_blank', rel: 'noopener' }, icon(support.icon as IconName), T.contact),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => go('services') }, T.services, icon('arrow')),
    ),
  );
};

const originals = new WeakMap<HTMLElement, Node[]>();

/**
 * Gọi trong show() của main.ts, trước khi vào module của mục.
 * 'open': cứ vào như thường; 'locked': đã thay nội dung bằng lockedView; 'pending': chưa đủ dữ liệu, đang chờ (sẽ tự show lại).
 */
export const gate = (id: SectionId, view: HTMLElement | undefined): 'open' | 'locked' | 'pending' => {
  if (!isLockable(id) || !view) return 'open';
  if (!ready()) {
    // chỉ xin tải khóa chưa tải, chưa lỗi và chưa đang tải — không bao giờ xin lại khóa vừa lỗi (tránh lặp request)
    const need = READY.filter((k) => !isLoaded(k) && !errors.has(k) && !isLoading(k));
    if (need.length) void ensure(...need);
    return 'pending';
  }
  if (!anyError() && locked(id)) {
    if (!originals.has(view)) originals.set(view, Array.from(view.childNodes));
    if (!view.querySelector('.locked-view')) view.replaceChildren(lockedView(id));
    return 'locked';
  }
  const orig = originals.get(view);
  if (orig) {
    view.replaceChildren(...orig);
    originals.delete(view);
  }
  return 'open';
};

/** Biểu tượng khóa trên menu ([data-lock="<id>"]) theo quyền/dữ liệu hiện có. */
const applyMenu = () => {
  if (!ready()) return;
  document.querySelectorAll<HTMLElement>('[data-lock]').forEach((el) => {
    const id = el.dataset.lock as SectionId;
    el.hidden = !isLockable(id) || anyError() || !locked(id);
  });
};

/** Khởi động một lần: tải dữ liệu quyền, cập nhật menu, và show lại mục đang xem khi dữ liệu về. */
export const initLocks = (reshow: () => void) => {
  on([...READY], () => {
    applyMenu();
    const r = route();
    if (isLockable(r.section)) reshow();
  });
  void ensure(...READY);
};
