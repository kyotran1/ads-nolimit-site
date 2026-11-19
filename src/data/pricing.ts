/**
 * BẢNG GIÁ — sửa giá DUY NHẤT ở file này (dùng cho cả tiếng Việt và tiếng Anh).
 *
 * Trang chủ (bảng giá rút gọn), /bang-gia/, /en/pricing/ và các trang dịch vụ đều đọc từ đây.
 * Số tiền viết dạng số nguyên (dùng dấu _ cho dễ đọc, ví dụ 4_900_000).
 * - `amount`: giá VNĐ, tiếng Việt hiển thị "4.900.000đ".
 * - `usd`:    giá USD cho trang tiếng Anh, hiển thị "$189" (chủ doanh nghiệp yêu cầu 19/11/2026).
 *   Quy đổi theo 26.000đ = 1 USD (tỷ giá bán Vietcombank đầu 11/2026 khoảng 25.890đ),
 *   làm tròn LÊN số có đuôi 9. Khi đổi giá VNĐ, nhớ sửa luôn số `usd` bên cạnh.
 *
 * Mỗi chữ có hai bản: { vi: '…', en: '…' }.
 *
 * Lưu ý: đây là giá ĐỀ XUẤT theo brief ngày 19/11/2026 — chủ doanh nghiệp duyệt trước khi công bố.
 */
import type { Lang } from '../config/i18n';
import { localize } from '../config/i18n';

type Text = Record<Lang, string>;

/** Định dạng số tiền VNĐ: 4900000 -> "4.900.000đ" */
export const vnd = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(amount)}đ`;

/** Định dạng số tiền USD: 189 -> "$189", 1290 -> "$1,290" */
export const usd = (amount: number) => `$${new Intl.NumberFormat('en-US').format(amount)}`;

/** Giá theo ngôn ngữ: tiếng Việt dùng VNĐ, tiếng Anh dùng USD. */
const money = (p: { amount: number; usd: number }, lang: Lang) => (lang === 'en' ? usd(p.usd) : vnd(p.amount));

interface PriceSpec {
  /** Nhãn ngắn, ví dụ "Cài đặt", "Duy trì" */
  label: Text;
  /** Số tiền VNĐ (bỏ trống khi giá là chữ, ví dụ "Liên hệ báo giá") */
  amount?: number;
  /** Số tiền USD cho trang tiếng Anh (bắt buộc khi có `amount`) */
  usd?: number;
  /** Hiện chữ "từ"/"from" trước số tiền */
  from?: boolean;
  /** Giá dạng chữ khi không có `amount` */
  text?: Text;
  /** Đơn vị/ghi chú ngay sau giá, ví dụ "/tháng" */
  unit?: Text;
  /** Giá chỉ là một chữ ("Liên hệ báo giá"): khi viết gọn trên một dòng thì bỏ nhãn */
  bare?: boolean;
}

interface PlanSpec {
  id: string;
  name: Text;
  /** Nhóm dịch vụ (để gom trên trang bảng giá) */
  group: Text;
  summary: Text;
  prices: PriceSpec[];
  /** Giới hạn/điều kiện ngắn */
  limit?: Text;
  features: Text[];
  /** Trang chi tiết dịch vụ (đường dẫn tiếng Việt, bản tiếng Anh tự đổi) */
  href: string;
  /** Hiện trong bảng giá rút gọn ở trang chủ */
  showOnHome: boolean;
  /** Gói được ưu đãi thí điểm (khi `pilotOffer.active`) */
  pilot?: boolean;
}

const specs: PlanSpec[] = [
  {
    id: 'ai-starter',
    name: { vi: 'AI Agent Khởi đầu', en: 'AI Agent Starter' },
    group: { vi: 'AI Agent bán hàng & chăm sóc khách', en: 'AI agents for sales & customer care' },
    summary: {
      vi: 'Một kênh chat, trả lời câu hỏi thường gặp và giữ lại thông tin khách.',
      en: 'One chat channel. Answers common questions and keeps every lead.',
    },
    prices: [
      { label: { vi: 'Cài đặt', en: 'Setup' }, amount: 4_900_000, usd: 189 },
      { label: { vi: 'Duy trì', en: 'Monthly' }, amount: 990_000, usd: 39, unit: { vi: '/tháng', en: '/month' } },
    ],
    limit: { vi: 'Tới 1.000 hội thoại/tháng', en: 'Up to 1,000 conversations a month' },
    features: [
      {
        vi: '1 kênh: Messenger hoặc Zalo OA hoặc chat trên website',
        en: '1 channel: Messenger, Zalo OA or your website chat',
      },
      {
        vi: 'Trả lời câu hỏi thường gặp dựa trên tài liệu của doanh nghiệp',
        en: 'Answers common questions from your own business documents',
      },
      { vi: 'Xin số điện thoại, lưu khách vào Google Sheet', en: 'Asks for phone numbers and saves leads to Google Sheets' },
      { vi: 'Báo khách mới qua Telegram hoặc Zalo', en: 'Alerts you to new leads via Telegram or Zalo' },
    ],
    href: '/giai-phap-ai-agent/',
    showOnHome: true,
    pilot: true,
  },
  {
    id: 'ai-sales',
    name: { vi: 'AI Agent Bán hàng', en: 'AI Agent Sales' },
    group: { vi: 'AI Agent bán hàng & chăm sóc khách', en: 'AI agents for sales & customer care' },
    summary: {
      vi: 'Nhiều kênh, tra giá và tồn kho, lên đơn nháp, biết lúc nào cần người thật.',
      en: 'Several channels. Checks prices and stock, drafts orders, and knows when to hand over to a person.',
    },
    prices: [
      { label: { vi: 'Cài đặt', en: 'Setup' }, amount: 12_900_000, usd: 499 },
      { label: { vi: 'Duy trì', en: 'Monthly' }, amount: 2_490_000, usd: 99, unit: { vi: '/tháng', en: '/month' } },
    ],
    limit: { vi: 'Tới 5.000 hội thoại/tháng', en: 'Up to 5,000 conversations a month' },
    features: [
      { vi: 'Tới 3 kênh chat', en: 'Up to 3 chat channels' },
      { vi: 'Tra bảng giá, tồn kho', en: 'Looks up your price list and stock' },
      { vi: 'Tạo đơn nháp để nhân viên xác nhận', en: 'Creates draft orders for your staff to confirm' },
      { vi: 'Chuyển cuộc trò chuyện cho nhân viên khi cần', en: 'Hands the conversation to a staff member when needed' },
      { vi: 'Báo cáo hằng tuần', en: 'Weekly report' },
    ],
    href: '/giai-phap-ai-agent/',
    showOnHome: true,
    pilot: true,
  },
  {
    id: 'ads',
    name: { vi: 'Quảng cáo hiệu suất', en: 'Performance advertising' },
    group: { vi: 'Quảng cáo', en: 'Advertising' },
    summary: {
      vi: 'Quản lý và tối ưu quảng cáo Facebook, Google, TikTok mỗi ngày.',
      en: 'Facebook, Google and TikTok ads, managed and optimised every day.',
    },
    prices: [
      {
        label: { vi: 'Phí quản lý', en: 'Management fee' },
        text: { vi: '10–15%', en: '10–15%' },
        unit: { vi: ' ngân sách quảng cáo', en: ' of ad spend' },
      },
      { label: { vi: 'Dùng thử', en: 'Trial' }, text: { vi: '7 ngày', en: '7 days' } },
    ],
    features: [
      {
        vi: 'Lên kế hoạch, dựng chiến dịch, theo dõi và tối ưu hằng ngày',
        en: 'Planning, campaign setup, daily monitoring and optimisation',
      },
      { vi: 'Báo cáo định kỳ, giải thích rõ tiền đã chi vào đâu', en: 'Regular reports that show exactly where the money went' },
      { vi: 'Facebook Ads, Google Ads, TikTok Ads', en: 'Facebook Ads, Google Ads, TikTok Ads' },
    ],
    href: '/quang-cao/',
    showOnHome: true,
  },
  {
    id: 'agency-account',
    name: {
      vi: 'Tài khoản quảng cáo Agency doanh nghiệp (BM2500)',
      en: 'Agency business ad account (BM2500)',
    },
    group: { vi: 'Quảng cáo', en: 'Advertising' },
    summary: {
      vi: 'Tài khoản doanh nghiệp, chạy đúng chính sách quảng cáo của nền tảng.',
      en: 'A business account that runs in line with each platform’s advertising policies.',
    },
    prices: [{ label: { vi: 'Giá', en: 'Price' }, text: { vi: 'Liên hệ báo giá', en: 'Quote on request' }, bare: true }],
    features: [
      {
        vi: 'Dành cho doanh nghiệp có nhu cầu chạy quảng cáo ổn định',
        en: 'For businesses that advertise steadily',
      },
      {
        vi: 'Sản phẩm, nội dung và trang đích tuân thủ chính sách của nền tảng',
        en: 'Products, ad content and landing pages must follow platform policies',
      },
    ],
    href: '/quang-cao/#tai-khoan-agency',
    showOnHome: false,
  },
  {
    id: 'automation',
    name: { vi: 'Tự động hóa quy trình theo yêu cầu', en: 'Custom workflow automation' },
    group: { vi: 'Tự động hóa', en: 'Automation' },
    summary: {
      vi: 'Biến một việc lặp lại hằng ngày thành quy trình tự chạy.',
      en: 'Turn one repetitive daily task into a workflow that runs on its own.',
    },
    prices: [
      { label: { vi: 'Khảo sát', en: 'Assessment' }, text: { vi: 'Miễn phí', en: 'Free' } },
      {
        label: { vi: 'Triển khai', en: 'Build' },
        amount: 15_000_000,
        usd: 579,
        from: true,
        unit: { vi: '/quy trình', en: '/workflow' },
      },
      { label: { vi: 'Bảo trì', en: 'Maintenance' }, amount: 1_500_000, usd: 59, from: true, unit: { vi: '/tháng', en: '/month' } },
    ],
    features: [
      { vi: 'Báo cáo quảng cáo tự động mỗi sáng', en: 'Automatic ad report every morning' },
      { vi: 'Đồng bộ đơn hàng giữa các kênh', en: 'Order syncing across channels' },
      { vi: 'Soạn nội dung hàng loạt', en: 'Bulk content drafting' },
      { vi: 'Nhắc lịch khách', en: 'Appointment reminders' },
    ],
    href: '/tu-dong-hoa/',
    showOnHome: true,
  },
  {
    id: 'web',
    name: { vi: 'Thiết kế website & phần mềm bán hàng online', en: 'Websites & online sales software' },
    group: { vi: 'Website & phần mềm', en: 'Websites & software' },
    summary: {
      vi: 'Website, landing page và phần mềm hỗ trợ bán hàng trên mạng xã hội.',
      en: 'Websites, landing pages and software that helps you sell on social media.',
    },
    prices: [{ label: { vi: 'Giá', en: 'Price' }, text: { vi: 'Liên hệ báo giá', en: 'Quote on request' }, bare: true }],
    features: [
      {
        vi: 'Website giới thiệu, landing page cho chiến dịch quảng cáo',
        en: 'Company websites and landing pages for ad campaigns',
      },
      {
        vi: 'Phần mềm hỗ trợ bán hàng online trên mạng xã hội',
        en: 'Software that supports selling online on social media',
      },
    ],
    href: '/thiet-ke-website/',
    showOnHome: true,
  },
  {
    id: 'training',
    name: { vi: 'Đào tạo AI cho chủ shop', en: 'AI training for shop owners' },
    group: { vi: 'Đào tạo', en: 'Training' },
    summary: {
      vi: 'Workshop 1 buổi, mang về bộ mẫu câu lệnh dùng được ngay.',
      en: 'A one-session workshop. You leave with prompt templates you can use right away.',
    },
    prices: [{ label: { vi: 'Học phí', en: 'Fee' }, amount: 990_000, usd: 39, unit: { vi: '/người', en: '/person' } }],
    features: [
      { vi: 'Workshop 1 buổi', en: 'One-session workshop' },
      { vi: 'Kèm bộ mẫu câu lệnh', en: 'Set of prompt templates included' },
    ],
    href: '/bang-gia/#training',
    showOnHome: true,
  },
];

/* ---------- Dữ liệu đã chuyển ngữ (các component dùng phần này) ---------- */

export interface PriceLine {
  label: string;
  /** Giá đã định dạng, ví dụ "4.900.000đ", "từ 15.000.000đ" hoặc "Liên hệ báo giá" */
  value: string;
  unit?: string;
  bare?: boolean;
}

export interface Plan {
  id: string;
  name: string;
  group: string;
  summary: string;
  prices: PriceLine[];
  limit?: string;
  features: string[];
  /** Link trang dịch vụ, đã đổi sang đúng ngôn ngữ */
  href: string;
  showOnHome: boolean;
  pilot: boolean;
}

const fromWord: Text = { vi: 'từ', en: 'from' };

/** Báo lỗi ngay khi build nếu có giá VNĐ mà quên điền giá USD. */
const requireUsd = (planId: string, p: PriceSpec) => {
  if (p.usd === undefined) throw new Error(`Gói "${planId}" có giá VNĐ nhưng thiếu giá USD (usd) trong src/data/pricing.ts`);
  return p.usd;
};

const toPlan = (spec: PlanSpec, lang: Lang): Plan => ({
  id: spec.id,
  name: spec.name[lang],
  group: spec.group[lang],
  summary: spec.summary[lang],
  prices: spec.prices.map((p) => ({
    label: p.label[lang],
    value:
      p.amount !== undefined
        ? `${p.from ? `${fromWord[lang]} ` : ''}${money({ amount: p.amount, usd: requireUsd(spec.id, p) }, lang)}`
        : (p.text?.[lang] ?? ''),
    unit: p.unit?.[lang],
    bare: p.bare,
  })),
  limit: spec.limit?.[lang],
  features: spec.features.map((f) => f[lang]),
  href: localize(spec.href, lang),
  showOnHome: spec.showOnHome,
  pilot: Boolean(spec.pilot),
});

export const getPlans = (lang: Lang = 'vi'): Plan[] => specs.map((s) => toPlan(s, lang));

export const getPlan = (id: string, lang: Lang = 'vi'): Plan => {
  const spec = specs.find((p) => p.id === id);
  if (!spec) throw new Error(`Không tìm thấy gói giá "${id}" trong src/data/pricing.ts`);
  return toPlan(spec, lang);
};

/** Ưu đãi thí điểm. Đặt `active: false` khi đã đủ 3 khách (ẩn ở mọi nơi, cả tiếng Anh). */
const pilot = {
  active: true,
  title: { vi: 'Ưu đãi thí điểm', en: 'Pilot offer' },
  short: { vi: 'giảm 50% phí cài đặt', en: '50% off setup' },
  text: {
    vi: '3 khách AI Agent đầu tiên được giảm 50% phí cài đặt, đổi lại cho phép ADS-Nolimit làm case study.',
    en: 'The first 3 AI agent clients get 50% off the setup fee, in exchange for letting ADS-Nolimit publish a case study.',
  },
};

export const getPilotOffer = (lang: Lang = 'vi') => ({
  active: pilot.active,
  title: pilot.title[lang],
  short: pilot.short[lang],
  text: pilot.text[lang],
});

/** Ghi chú bắt buộc dưới mọi bảng giá. */
const priceNoteText: Text = {
  vi: 'Chi phí quảng cáo trả cho nền tảng tính riêng.',
  en: 'Ad spend paid to the platforms is billed separately.',
};
export const getPriceNote = (lang: Lang = 'vi') => priceNoteText[lang];

/** Ghi chú đơn vị tiền cho trang tiếng Anh. */
export const currencyNote = 'All prices are in US dollars (USD).';

/** Thời gian triển khai gói AI Agent Khởi đầu (dùng trong FAQ, các bước triển khai). */
const leadTime: Text = { vi: '7–14 ngày', en: '7–14 days' };
export const getStarterLeadTime = (lang: Lang = 'vi') => leadTime[lang];

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Chuỗi giá gọn trên một dòng.
 * vi: "Cài đặt 4.900.000đ, duy trì 990.000đ/tháng"
 * en: "Setup $189, $39/month"
 */
export const priceInline = (plan: Plan, lang: Lang = 'vi') =>
  plan.prices
    .map((p, i) => {
      const startsWithNumber = /^[0-9$]/.test(p.value) || p.value.startsWith(fromWord[lang]);
      const value = startsWithNumber ? p.value : lowerFirst(p.value);
      let text = p.bare ? p.value : `${p.label} ${value}${p.unit ?? ''}`;
      // Tiếng Anh tự nhiên hơn: "Free assessment", "7-day trial"
      if (lang === 'en' && p.value === 'Free') text = `Free ${p.label.toLowerCase()}`;
      // "Setup $189, $39/month" thay vì "monthly $39/month"
      if (lang === 'en' && p.label === 'Monthly' && p.unit === '/month') text = `${p.value}${p.unit}`;
      if (lang === 'en' && /^\d+ days$/.test(p.value)) text = `${p.value.replace(' days', '-day')} ${p.label.toLowerCase()}`;
      return i === 0 ? text : lowerFirst(text);
    })
    .join(', ');
