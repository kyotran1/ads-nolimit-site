/**
 * CẤU HÌNH CHUNG & THÔNG TIN LIÊN HỆ — sửa liên hệ DUY NHẤT ở file này.
 *
 * Mọi số điện thoại, Zalo, Telegram, email, fanpage trên toàn site
 * (header, footer, thanh liên hệ nổi, trang Liên hệ, JSON-LD, trang /en/)
 * đều lấy từ object `contact` bên dưới. Đổi ở đây là đổi ở mọi nơi.
 */

import type { ImageMetadata } from 'astro';
import metaBadge from '../assets/partners/meta-business-partner.png';
import googleBadge from '../assets/partners/google-partner.png';
import shopifyBadge from '../assets/partners/shopify-partners.png';
import tiktokShopBadge from '../assets/partners/tiktok-shop.png';

export interface Partner {
  /** Tên nền tảng */
  name: string;
  /** Chữ thay thế cho ảnh: đúng chữ in trên huy hiệu */
  alt: string;
  image: ImageMetadata;
  /** Link xác minh; '' = không gắn link */
  verifyUrl: string;
}

export const site = {
  /** Tên hiển thị & tên pháp lý trên site: chỉ "ADS-Nolimit". */
  name: 'ADS-Nolimit',
  url: 'https://www.ads-nolimit.agency',
  tagline: 'Quảng cáo & AI Agent cho doanh nghiệp',
  defaultDescription:
    'ADS-Nolimit dựng nhân viên AI trả lời khách 24/7, tự động hóa việc lặp lại và chạy quảng cáo Facebook, Google, TikTok cho shop online và doanh nghiệp nhỏ. Làm quảng cáo từ 2016, hơn 800 khách hàng.',
  locale: 'vi_VN',
  /** Ảnh chia sẻ mạng xã hội (1200×630) trong thư mục public/. */
  ogImage: '/og-image.png',
  foundedYear: 2016,
  clientCount: '800+',
} as const;

/**
 * Thông tin liên hệ chính thức. Chỉ sửa các giá trị chuỗi;
 * link tel:, zalo.me, t.me, mailto:, m.me được tạo tự động ở `links`.
 */
export const contact = {
  /** Hotline */
  hotline: '0989 542 610',
  /** Điện thoại & Zalo */
  zaloPhone: '0888 88 2823',
  /** Trợ lý */
  assistantPhone: '0888 88 1228',
  /** Tên Telegram (không có @) */
  telegramUser: 'ads_nolimit_agency',
  email: 'contact-support@ads-nolimit.agency',
  /** Tên fanpage hiển thị */
  facebookName: 'ADS-Nolimit',
  /** Phần đuôi đường dẫn fanpage: facebook.com/<facebookPage> */
  facebookPage: 'adsnolimit.agency2610',
} as const;

const digits = (s: string) => s.replace(/\D/g, '');

export const links = {
  hotline: `tel:${digits(contact.hotline)}`,
  phone: `tel:${digits(contact.zaloPhone)}`,
  zalo: `https://zalo.me/${digits(contact.zaloPhone)}`,
  assistant: `tel:${digits(contact.assistantPhone)}`,
  telegram: `https://t.me/${contact.telegramUser}`,
  email: `mailto:${contact.email}`,
  facebook: `https://www.facebook.com/${contact.facebookPage}`,
  messenger: `https://m.me/${contact.facebookPage}`,
} as const;

/** Số điện thoại dạng quốc tế cho JSON-LD (+84...). */
export const intlPhone = (s: string) => `+84${digits(s).replace(/^0/, '')}`;

/** Danh sách kênh liên hệ dùng cho trang Liên hệ, footer, CTA. */
export const channels = [
  { id: 'zalo', label: 'Zalo', value: contact.zaloPhone, href: links.zalo, external: true },
  { id: 'hotline', label: 'Hotline', value: contact.hotline, href: links.hotline, external: false },
  { id: 'phone', label: 'Điện thoại & Zalo', value: contact.zaloPhone, href: links.phone, external: false },
  { id: 'assistant', label: 'Trợ lý', value: contact.assistantPhone, href: links.assistant, external: false },
  { id: 'messenger', label: 'Messenger', value: `Fanpage ${contact.facebookName}`, href: links.messenger, external: true },
  { id: 'telegram', label: 'Telegram', value: `@${contact.telegramUser}`, href: links.telegram, external: true },
  { id: 'email', label: 'Email', value: contact.email, href: links.email, external: false },
  { id: 'facebook', label: 'Fanpage', value: contact.facebookName, href: links.facebook, external: true },
] as const;

/**
 * Huy hiệu đối tác nền tảng (dải "Đối tác nền tảng" ở trang chủ, /quang-cao/, /ve-chung-toi/, /en/).
 * Ảnh nằm trong src/assets/partners/ (Astro tự xuất WebP). Mọi ảnh cùng khung 260×104,
 * hiển thị 130×52, logo đã căn giữa sẵn trong khung.
 *
 * `verifyUrl`: link trang xác minh tư cách đối tác (hồ sơ trong danh bạ đối tác của nền tảng).
 * Để trống '' thì huy hiệu chỉ là ảnh; điền link thì huy hiệu thành link mở tab mới.
 */
export const partners: readonly Partner[] = [
  { name: 'Meta', alt: 'Meta Business Partner', image: metaBadge, verifyUrl: '' },
  { name: 'Google', alt: 'Google Partner', image: googleBadge, verifyUrl: '' },
  { name: 'Shopify', alt: 'Shopify Partners', image: shopifyBadge, verifyUrl: '' },
  { name: 'TikTok', alt: 'TikTok Shop', image: tiktokShopBadge, verifyUrl: '' },
];

/** Điều hướng chính. */
export const solutionsNav = [
  { href: '/giai-phap-ai-agent/', label: 'AI Agent bán hàng & CSKH' },
  { href: '/tu-dong-hoa/', label: 'Tự động hóa quy trình' },
  { href: '/quang-cao/', label: 'Quảng cáo hiệu suất' },
  { href: '/thiet-ke-website/', label: 'Website & phần mềm bán hàng' },
  { href: '/phan-mem/', label: 'Công cụ & phần mềm AI' },
] as const;

export const mainNav = [
  { href: '/bang-gia/', label: 'Bảng giá' },
  { href: '/du-an/', label: 'Dự án' },
  { href: '/blog/', label: 'Blog' },
  { href: '/ve-chung-toi/', label: 'Về chúng tôi' },
] as const;
