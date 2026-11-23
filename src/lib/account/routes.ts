/**
 * Các mục của trang tài khoản (một trang, chuyển mục bằng #neo).
 * Dùng cả lúc build (menu bên trái trong src/views/AccountPage.astro) và trên trình duyệt (src/lib/account/main.ts).
 *
 * Mỗi mục có #neo tiếng Việt và tiếng Anh; trang nào cũng hiểu cả hai (link cũ của V3 như #yeu-cau vẫn chạy).
 * Mục con: #khoa-hoc/<id khóa học>, #huong-dan/<id bài>.
 */
import type { IconName } from '../../components/icon-paths';

type Text = { vi: string; en: string };

export type SectionId = 'overview' | 'topup' | 'orders' | 'ads' | 'services' | 'courses' | 'guides' | 'keys' | 'profile' | 'security';

export interface Section {
  id: SectionId;
  vi: string;
  en: string;
  icon: IconName;
  label: Text;
  /** Tiêu đề lớn trên thanh trên cùng (mặc định = label) */
  title?: Text;
}

export const sections: readonly Section[] = [
  { id: 'overview', vi: 'tong-quan', en: 'overview', icon: 'grid', label: { vi: 'Tổng quan', en: 'Overview' } },
  {
    id: 'topup',
    vi: 'nap-tien',
    en: 'top-up',
    icon: 'wallet',
    label: { vi: 'Nạp tiền & Số dư', en: 'Top up & balance' },
  },
  { id: 'orders', vi: 'don-hang', en: 'orders', icon: 'bag', label: { vi: 'Đơn hàng', en: 'Orders' } },
  { id: 'ads', vi: 'bao-cao-ads', en: 'ad-reports', icon: 'chart', label: { vi: 'Báo cáo quảng cáo', en: 'Ad reports' } },
  {
    id: 'services',
    vi: 'dich-vu',
    en: 'services',
    icon: 'spark',
    label: { vi: 'Dịch vụ', en: 'Services' },
    title: { vi: 'Chọn dịch vụ', en: 'Choose a service' },
  },
  { id: 'courses', vi: 'khoa-hoc', en: 'courses', icon: 'book', label: { vi: 'Khóa học', en: 'Courses' } },
  { id: 'guides', vi: 'huong-dan', en: 'guides', icon: 'guide', label: { vi: 'Hướng dẫn sử dụng', en: 'User guides' } },
  { id: 'keys', vi: 'key-may', en: 'keys', icon: 'key', label: { vi: 'Key & máy', en: 'Keys & devices' } },
  { id: 'profile', vi: 'ho-so', en: 'profile', icon: 'user', label: { vi: 'Hồ sơ', en: 'Profile' } },
  {
    id: 'security',
    vi: 'bao-mat',
    en: 'security',
    icon: 'shield',
    label: { vi: 'Bảo mật', en: 'Security' },
    title: { vi: 'Đăng nhập & bảo mật', en: 'Sign-in & security' },
  },
];

/** Nhóm mục trên menu bên trái. */
export const navGroups: readonly { label: Text; ids: SectionId[] }[] = [
  { label: { vi: 'Tài khoản', en: 'Account' }, ids: ['overview', 'topup', 'orders', 'ads'] },
  { label: { vi: 'Dịch vụ & học tập', en: 'Services & learning' }, ids: ['services', 'courses', 'guides', 'keys'] },
  { label: { vi: 'Cài đặt', en: 'Settings' }, ids: ['profile', 'security'] },
];

/** #neo cũ (V3) → mục mới. */
const legacy: Record<string, SectionId> = {
  'yeu-cau': 'services',
  'yeu-cau-da-gui': 'services',
  'xoa-tai-khoan': 'security',
  'lien-he': 'profile',
};

export interface Route {
  section: SectionId;
  /** phần sau dấu "/" (id khóa học, id bài hướng dẫn) */
  sub: string;
}

/** Đọc #neo (không có dấu #). Không nhận ra → null. */
export const parseHash = (hash: string): Route | null => {
  const raw = decodeURIComponent(hash.replace(/^#/, '')).trim();
  if (!raw) return null;
  const [head, ...rest] = raw.split('/');
  const sub = rest.join('/').slice(0, 80);
  const found = sections.find((s) => s.vi === head || s.en === head || s.id === head);
  if (found) return { section: found.id, sub };
  if (legacy[head]) return { section: legacy[head], sub: '' };
  return null;
};

export const hashFor = (section: SectionId, lang: 'vi' | 'en', sub = ''): string => {
  const s = sections.find((x) => x.id === section) ?? sections[0];
  return `#${s[lang]}${sub ? `/${encodeURIComponent(sub)}` : ''}`;
};
