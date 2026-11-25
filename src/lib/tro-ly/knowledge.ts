/**
 * Kiến thức cho trợ lý AI trên web — sinh lúc build từ chính dữ liệu của site (bảng giá, hỏi đáp, liên hệ),
 * in ra /tro-ly-ai/kien-thuc.json. Apps Script "ADS-Nolimit Tro ly AI" tải file này và gắn vào lời dặn của Claude.
 * Đổi giá ở src/data/pricing.ts là trợ lý biết sau lần build kế tiếp; không phải sửa Apps Script.
 */
import { site, contact, links } from '../../config/site';
import type { Lang } from '../../config/i18n';
import { localize } from '../../config/i18n';
import { getPlans, getPriceNote, getPilotOffer, getStarterLeadTime } from '../../data/pricing';
import { getFaq } from '../../data/faq';
import type { FaqItem } from '../../data/faq';
import { stripHtml } from './strip';

const full = (path: string, lang: Lang) => site.url + localize(path, lang);

const pages: Record<Lang, [string, string][]> = {
  vi: [
    ['Trang chủ', '/'],
    ['Giải pháp AI Agent', '/giai-phap-ai-agent/'],
    ['Quảng cáo Facebook, Google, TikTok', '/quang-cao/'],
    ['Tự động hóa quy trình', '/tu-dong-hoa/'],
    ['Thiết kế website & phần mềm bán hàng', '/thiet-ke-website/'],
    ['Công cụ & phần mềm AI', '/phan-mem/'],
    ['Bảng giá', '/bang-gia/'],
    ['Dự án đã làm', '/du-an/'],
    ['Về chúng tôi', '/ve-chung-toi/'],
    ['Liên hệ', '/lien-he/'],
    ['Đăng ký tài khoản', '/dang-ky/'],
    ['Tài khoản khách hàng (nạp tiền, báo cáo quảng cáo, đơn hàng)', '/tai-khoan/'],
  ],
  en: [
    ['Home', '/'],
    ['AI agent solutions', '/giai-phap-ai-agent/'],
    ['Facebook, Google & TikTok ads', '/quang-cao/'],
    ['Workflow automation', '/tu-dong-hoa/'],
    ['Websites & sales software', '/thiet-ke-website/'],
    ['AI tools & software', '/phan-mem/'],
    ['Pricing', '/bang-gia/'],
    ['Projects', '/du-an/'],
    ['About us', '/ve-chung-toi/'],
    ['Contact', '/lien-he/'],
    ['Create an account', '/dang-ky/'],
    ['Customer account (top-ups, ad reports, orders)', '/tai-khoan/'],
  ],
};

const head: Record<Lang, (lead: string) => string[]> = {
  vi: (lead) => [
    `# ${site.name}`,
    site.defaultDescription,
    `Website: ${site.url}`,
    '',
    '## Liên hệ người thật',
    `- Zalo / điện thoại: ${contact.zaloPhone} (${links.zalo})`,
    `- Hotline: ${contact.hotline}`,
    `- Telegram: @${contact.telegramUser} (${links.telegram})`,
    `- Email: ${contact.email}`,
    `- Fanpage Facebook: ${contact.facebookName} (${links.messenger})`,
    '',
    '## Tài khoản khách hàng trên web',
    `- Khách đăng ký tài khoản miễn phí tại ${full('/dang-ky/', 'vi')}, sau đó vào ${full('/tai-khoan/', 'vi')}.`,
    '- Trong tài khoản: nạp tiền vào số dư bằng chuyển khoản VietQR, đặt dịch vụ trả bằng số dư, xem đơn hàng.',
    '- Khách thuê tài khoản quảng cáo / chạy quảng cáo với ADS-Nolimit xem báo cáo quảng cáo (số dư, chi tiêu từng ngày) cập nhật mỗi giờ, và tạo lệnh "Nạp thêm ngân sách" quảng cáo bằng mã VietQR; chuyển đúng số tiền và nội dung thì hệ thống tự xác nhận.',
    '- Một tài khoản quảng cáo có thể cho tối đa 10 người cùng xem (ví dụ cổ đông của công ty khách), do ADS-Nolimit cấp quyền.',
    '- Có thể cài trang tài khoản thành ứng dụng trên điện thoại và máy tính (nút "Cài ứng dụng" trong trang tài khoản).',
    `- Gói AI Agent Khởi đầu thường triển khai trong ${lead}, tính từ khi khách gửi đủ tài liệu.`,
  ],
  en: (lead) => [
    `# ${site.name}`,
    site.defaultDescriptionEn,
    `Website: ${site.url}/en/`,
    '',
    '## Talk to a person',
    `- Zalo / phone: ${contact.zaloPhone} (${links.zalo})`,
    `- Hotline: ${contact.hotline}`,
    `- Telegram: @${contact.telegramUser} (${links.telegram})`,
    `- Email: ${contact.email}`,
    `- Facebook page: ${contact.facebookName} (${links.messenger})`,
    '',
    '## Customer account on the website',
    `- Customers create a free account at ${full('/dang-ky/', 'en')}, then use ${full('/tai-khoan/', 'en')}.`,
    '- In the account: top up a balance by VietQR bank transfer, order services paid from the balance, track orders.',
    '- Clients who rent ad accounts or run ads with ADS-Nolimit see ad reports (balance, daily spend) updated hourly, and can create an "Add ad budget" request with a VietQR code; the right amount and transfer note are confirmed automatically.',
    '- One ad account can be shared with up to 10 extra viewers (for example a client company’s shareholders), granted by ADS-Nolimit.',
    '- The account page can be installed as an app on phones and computers ("Install app" button in the account).',
    `- The AI Agent Starter plan usually goes live in ${lead}, counted from when the client sends all materials.`,
  ],
};

const faqList = (lang: Lang): FaqItem[] => {
  const f = getFaq(lang) as unknown as Record<string, FaqItem | FaqItem[]>;
  return Object.values(f).filter((x): x is FaqItem => !Array.isArray(x) && typeof x?.q === 'string');
};

/** Văn bản kiến thức của một ngôn ngữ (Markdown gọn). */
export const knowledgeText = (lang: Lang): string => {
  const lines = head[lang](getStarterLeadTime(lang));
  lines.push('', lang === 'vi' ? '## Dịch vụ và bảng giá' : '## Services and prices');
  for (const p of getPlans(lang)) {
    lines.push('', `### ${p.name} (${p.group})`, p.summary);
    for (const pr of p.prices) lines.push(`- ${pr.label}: ${pr.value}${pr.unit ? ` ${pr.unit}` : ''}`);
    if (p.limit) lines.push(`- ${lang === 'vi' ? 'Giới hạn' : 'Limit'}: ${p.limit}`);
    if (p.features.length) lines.push(`- ${lang === 'vi' ? 'Gồm' : 'Includes'}: ${p.features.join('; ')}`);
    lines.push(`- ${lang === 'vi' ? 'Chi tiết' : 'Details'}: ${site.url}${p.href}`);
  }
  lines.push('', `- ${getPriceNote(lang)}`);
  const pilot = getPilotOffer(lang);
  if (pilot.active) lines.push(`- ${pilot.title}: ${pilot.text}`);
  lines.push('', lang === 'vi' ? '## Hỏi đáp' : '## FAQ');
  const seen = new Set<string>();
  for (const item of faqList(lang)) {
    if (seen.has(item.q)) continue;
    seen.add(item.q);
    lines.push('', `Q: ${item.q}`, `A: ${stripHtml(item.a)}`);
  }
  lines.push('', lang === 'vi' ? '## Các trang trên web' : '## Website pages');
  for (const [name, path] of pages[lang]) lines.push(`- ${name}: ${full(path, lang)}`);
  return lines.join('\n');
};

export interface Knowledge {
  v: 1;
  builtAt: string;
  vi: string;
  en: string;
}

export const buildKnowledge = (builtAt = new Date().toISOString()): Knowledge => ({ v: 1, builtAt, vi: knowledgeText('vi'), en: knowledgeText('en') });
