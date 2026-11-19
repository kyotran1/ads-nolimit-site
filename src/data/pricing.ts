/**
 * BẢNG GIÁ — sửa giá DUY NHẤT ở file này.
 *
 * Trang chủ (bảng giá rút gọn), /bang-gia/ và các trang dịch vụ đều đọc từ đây.
 * Số tiền viết dạng số nguyên (dùng dấu _ cho dễ đọc, ví dụ 4_900_000);
 * hàm `vnd()` tự định dạng thành "4.900.000đ".
 *
 * Lưu ý: đây là giá ĐỀ XUẤT theo brief ngày 19/11/2026 — chủ doanh nghiệp duyệt trước khi công bố.
 */

/** Định dạng số tiền VNĐ: 4900000 -> "4.900.000đ" */
export const vnd = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(amount)}đ`;

export interface PriceLine {
  /** Nhãn ngắn, ví dụ "Cài đặt", "Duy trì" */
  label: string;
  /** Giá đã định dạng, ví dụ "4.900.000đ" hoặc "Liên hệ báo giá" */
  value: string;
  /** Đơn vị/ghi chú ngay sau giá, ví dụ "/tháng" */
  unit?: string;
}

export interface Plan {
  id: string;
  /** Tên gói */
  name: string;
  /** Nhóm dịch vụ (để gom trên trang bảng giá) */
  group: string;
  /** Một câu mô tả gói */
  summary: string;
  prices: PriceLine[];
  /** Giới hạn/điều kiện ngắn, ví dụ "Tới 1.000 hội thoại/tháng" */
  limit?: string;
  features: string[];
  /** Trang chi tiết dịch vụ */
  href: string;
  /** Hiện trong bảng giá rút gọn ở trang chủ */
  showOnHome: boolean;
}

export const plans: Plan[] = [
  {
    id: 'ai-starter',
    name: 'AI Agent Khởi đầu',
    group: 'AI Agent bán hàng & chăm sóc khách',
    summary: 'Một kênh chat, trả lời câu hỏi thường gặp và giữ lại thông tin khách.',
    prices: [
      { label: 'Cài đặt', value: vnd(4_900_000) },
      { label: 'Duy trì', value: vnd(990_000), unit: '/tháng' },
    ],
    limit: 'Tới 1.000 hội thoại/tháng',
    features: [
      '1 kênh: Messenger hoặc Zalo OA hoặc chat trên website',
      'Trả lời câu hỏi thường gặp dựa trên tài liệu của doanh nghiệp',
      'Xin số điện thoại, lưu khách vào Google Sheet',
      'Báo khách mới qua Telegram hoặc Zalo',
    ],
    href: '/giai-phap-ai-agent/',
    showOnHome: true,
  },
  {
    id: 'ai-sales',
    name: 'AI Agent Bán hàng',
    group: 'AI Agent bán hàng & chăm sóc khách',
    summary: 'Nhiều kênh, tra giá và tồn kho, lên đơn nháp, biết lúc nào cần người thật.',
    prices: [
      { label: 'Cài đặt', value: vnd(12_900_000) },
      { label: 'Duy trì', value: vnd(2_490_000), unit: '/tháng' },
    ],
    limit: 'Tới 5.000 hội thoại/tháng',
    features: [
      'Tới 3 kênh chat',
      'Tra bảng giá, tồn kho',
      'Tạo đơn nháp để nhân viên xác nhận',
      'Chuyển cuộc trò chuyện cho nhân viên khi cần',
      'Báo cáo hằng tuần',
    ],
    href: '/giai-phap-ai-agent/',
    showOnHome: true,
  },
  {
    id: 'ads',
    name: 'Quảng cáo hiệu suất',
    group: 'Quảng cáo',
    summary: 'Quản lý và tối ưu quảng cáo Facebook, Google, TikTok mỗi ngày.',
    prices: [
      { label: 'Phí quản lý', value: '10–15%', unit: ' ngân sách quảng cáo' },
      { label: 'Dùng thử', value: '7 ngày' },
    ],
    features: [
      'Lên kế hoạch, dựng chiến dịch, theo dõi và tối ưu hằng ngày',
      'Báo cáo định kỳ, giải thích rõ tiền đã chi vào đâu',
      'Facebook Ads, Google Ads, TikTok Ads',
    ],
    href: '/quang-cao/',
    showOnHome: true,
  },
  {
    id: 'agency-account',
    name: 'Tài khoản quảng cáo Agency doanh nghiệp (BM2500)',
    group: 'Quảng cáo',
    summary: 'Tài khoản doanh nghiệp, chạy đúng chính sách quảng cáo của nền tảng.',
    prices: [{ label: 'Giá', value: 'Liên hệ báo giá' }],
    features: [
      'Dành cho doanh nghiệp có nhu cầu chạy quảng cáo ổn định',
      'Sản phẩm, nội dung và trang đích tuân thủ chính sách của nền tảng',
    ],
    href: '/quang-cao/#tai-khoan-agency',
    showOnHome: false,
  },
  {
    id: 'automation',
    name: 'Tự động hóa quy trình theo yêu cầu',
    group: 'Tự động hóa',
    summary: 'Biến một việc lặp lại hằng ngày thành quy trình tự chạy.',
    prices: [
      { label: 'Khảo sát', value: 'Miễn phí' },
      { label: 'Triển khai', value: `từ ${vnd(15_000_000)}`, unit: '/quy trình' },
      { label: 'Bảo trì', value: `từ ${vnd(1_500_000)}`, unit: '/tháng' },
    ],
    features: [
      'Báo cáo quảng cáo tự động mỗi sáng',
      'Đồng bộ đơn hàng giữa các kênh',
      'Soạn nội dung hàng loạt',
      'Nhắc lịch khách',
    ],
    href: '/tu-dong-hoa/',
    showOnHome: true,
  },
  {
    id: 'web',
    name: 'Thiết kế website & phần mềm bán hàng online',
    group: 'Website & phần mềm',
    summary: 'Website, landing page và phần mềm hỗ trợ bán hàng trên mạng xã hội.',
    prices: [{ label: 'Giá', value: 'Liên hệ báo giá' }],
    features: [
      'Website giới thiệu, landing page cho chiến dịch quảng cáo',
      'Phần mềm hỗ trợ bán hàng online trên mạng xã hội',
    ],
    href: '/thiet-ke-website/',
    showOnHome: true,
  },
  {
    id: 'training',
    name: 'Đào tạo AI cho chủ shop',
    group: 'Đào tạo',
    summary: 'Workshop 1 buổi, mang về bộ mẫu câu lệnh dùng được ngay.',
    prices: [{ label: 'Học phí', value: vnd(990_000), unit: '/người' }],
    features: ['Workshop 1 buổi', 'Kèm bộ mẫu câu lệnh'],
    href: '/bang-gia/#training',
    showOnHome: true,
  },
];

/** Ưu đãi thí điểm. Đặt `active: false` khi đã đủ 3 khách. */
export const pilotOffer = {
  active: true,
  title: 'Ưu đãi thí điểm',
  text: '3 khách AI Agent đầu tiên được giảm 50% phí cài đặt, đổi lại cho phép ADS-Nolimit làm case study.',
};

/** Ghi chú bắt buộc dưới mọi bảng giá. */
export const priceNote = 'Chi phí quảng cáo trả cho nền tảng tính riêng.';

/** Thời gian triển khai gói AI Agent Khởi đầu (dùng trong FAQ). */
export const starterLeadTime = '7–14 ngày';

export const getPlan = (id: string): Plan => {
  const plan = plans.find((p) => p.id === id);
  if (!plan) throw new Error(`Không tìm thấy gói giá "${id}" trong src/data/pricing.ts`);
  return plan;
};

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Chuỗi giá gọn trên một dòng, ví dụ "Cài đặt 4.900.000đ, duy trì 990.000đ/tháng" */
export const priceInline = (plan: Plan) =>
  plan.prices
    .map((p, i) => {
      const value = /^[0-9]/.test(p.value) || p.value.startsWith('từ') ? p.value : lowerFirst(p.value);
      const text = p.label === 'Giá' ? p.value : `${p.label} ${value}${p.unit ?? ''}`;
      return i === 0 ? text : lowerFirst(text);
    })
    .join(', ');
