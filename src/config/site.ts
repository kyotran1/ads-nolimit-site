/**
 * CẤU HÌNH CHUNG & THÔNG TIN LIÊN HỆ — sửa liên hệ DUY NHẤT ở file này.
 *
 * Mọi số điện thoại, Zalo, Telegram, email, fanpage trên toàn site
 * (header, footer, thanh liên hệ nổi, trang Liên hệ, JSON-LD, mọi trang /en/)
 * đều lấy từ object `contact` bên dưới. Đổi ở đây là đổi ở mọi nơi.
 */

import type { ImageMetadata } from 'astro';
import metaBadge from '../assets/partners/meta-business-partner.png';
import googleBadge from '../assets/partners/google-partner.png';
import shopifyBadge from '../assets/partners/shopify-partners.png';
import tiktokShopBadge from '../assets/partners/tiktok-shop.png';

/** Cách đăng nhập được bật (Facebook mặc định tắt, bật bằng PUBLIC_FB_LOGIN=on lúc build). Định nghĩa ở auth-providers.ts để mã trình duyệt đọc được mà không kéo theo ảnh. */
export { authProviders } from './auth-providers';

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
  taglineEn: 'Advertising & AI agents for businesses',
  defaultDescription:
    'ADS-Nolimit dựng nhân viên AI trả lời khách 24/7, tự động hóa việc lặp lại và chạy quảng cáo Facebook, Google, TikTok cho shop online và doanh nghiệp nhỏ. Làm quảng cáo từ 2016, hơn 800 khách hàng.',
  locale: 'vi_VN',
  defaultDescriptionEn:
    'ADS-Nolimit builds AI agents that answer customers 24/7, automates repetitive work and runs Facebook, Google and TikTok ads for online shops and small businesses in Vietnam. Running ads since 2016, for 800+ clients.',
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

/** Danh sách kênh liên hệ dùng cho trang Liên hệ (nhãn theo ngôn ngữ ở src/config/i18n.ts). */
export const channels = [
  { id: 'zalo', value: contact.zaloPhone, href: links.zalo, external: true },
  { id: 'hotline', value: contact.hotline, href: links.hotline, external: false },
  { id: 'phone', value: contact.zaloPhone, href: links.phone, external: false },
  { id: 'assistant', value: contact.assistantPhone, href: links.assistant, external: false },
  { id: 'messenger', value: `Fanpage ${contact.facebookName}`, href: links.messenger, external: true },
  { id: 'telegram', value: `@${contact.telegramUser}`, href: links.telegram, external: true },
  { id: 'email', value: contact.email, href: links.email, external: false },
  { id: 'fanpage', value: contact.facebookName, href: links.facebook, external: true },
] as const;

/**
 * Huy hiệu đối tác nền tảng (dải "Đối tác nền tảng" ở trang chủ, /quang-cao/, /ve-chung-toi/ và bản tiếng Anh).
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

/**
 * Điều hướng chính. `href` luôn là đường dẫn tiếng Việt; bản tiếng Anh
 * được đổi tự động qua bảng `routes` trong src/config/i18n.ts.
 */
export const solutionsNav = [
  { href: '/giai-phap-ai-agent/', label: { vi: 'AI Agent bán hàng & CSKH', en: 'AI agents for sales & support' } },
  { href: '/tu-dong-hoa/', label: { vi: 'Tự động hóa quy trình', en: 'Workflow automation' } },
  { href: '/quang-cao/', label: { vi: 'Quảng cáo hiệu suất', en: 'Performance advertising' } },
  { href: '/thiet-ke-website/', label: { vi: 'Website & phần mềm bán hàng', en: 'Websites & sales software' } },
  { href: '/phan-mem/', label: { vi: 'Công cụ & phần mềm AI', en: 'AI tools & software' } },
] as const;

export const mainNav = [
  { href: '/bang-gia/', label: { vi: 'Bảng giá', en: 'Pricing' } },
  { href: '/du-an/', label: { vi: 'Dự án', en: 'Projects' } },
  { href: '/blog/', label: { vi: 'Blog', en: 'Blog' } },
  { href: '/ve-chung-toi/', label: { vi: 'Về chúng tôi', en: 'About' } },
] as const;

/**
 * Kênh liên hệ chính cho nút lớn ở từng ngôn ngữ.
 * Tiếng Việt: Zalo. Tiếng Anh: Telegram (khách nước ngoài dùng nhiều hơn), email hiện ngay bên cạnh.
 */
export const primaryChannel = {
  vi: { href: links.zalo, icon: 'zalo', label: 'Tư vấn miễn phí qua Zalo', short: 'Nhắn Zalo' },
  en: { href: links.telegram, icon: 'telegram', label: 'Message us on Telegram', short: 'Telegram' },
} as const;

/**
 * Trợ lý AI trên web (khung chat góc dưới phải). `endpoint` là địa chỉ web app Apps Script "ADS-Nolimit Tro ly AI"
 * (dạng https://script.google.com/macros/s/…/exec). Để '' thì web không hiện nút chat.
 * Mã trạm: apps-script/tro-ly-ai/Code.gs · thiết kế: docs/superpowers/specs/2026-11-26-tro-ly-ai-design.md
 */
export const aiChat = {
  endpoint: ((import.meta as { env?: Record<string, string | undefined> }).env?.PUBLIC_TRO_LY_ENDPOINT ??
    // Triển khai "Tro ly AI v1" (26/11/2026) của dự án Apps Script "ADS-Nolimit Tro ly AI"
    'https://script.google.com/macros/s/AKfycby6Di59fHpAZYdCZlI7d2JUS4j4FJEdPSKctzoMfxTg3azwWEX9Vtd3Exymd_dMIfwNAA/exec') as string,
} as const;
