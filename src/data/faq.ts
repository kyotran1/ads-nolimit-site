/**
 * Câu hỏi thường gặp. Giá lấy từ src/data/pricing.ts để không lệch nhau.
 */
import { getPlan, priceInline, priceNote, starterLeadTime } from './pricing';

export interface FaqItem {
  q: string;
  /** Có thể chứa HTML đơn giản (liên kết) */
  a: string;
}

const starter = getPlan('ai-starter');
const sales = getPlan('ai-sales');
const automation = getPlan('automation');

export const faqCost: FaqItem = {
  q: 'Chi phí AI Agent là bao nhiêu?',
  a: `Gói ${starter.name}: ${priceInline(starter)} (${starter.limit?.toLowerCase()}). Gói ${sales.name}: ${priceInline(sales)} (${sales.limit?.toLowerCase()}). ${priceNote} Xem đủ ở <a href="/bang-gia/">bảng giá</a>.`,
};

export const faqLeadTime: FaqItem = {
  q: 'Bao lâu thì AI Agent chạy được?',
  a: `Gói ${starter.name} thường triển khai trong ${starterLeadTime}, tính từ khi anh/chị gửi đủ tài liệu: bảng giá, câu hỏi khách hay hỏi, chính sách đổi trả, giờ làm việc. Gói nhiều kênh hoặc cần kết nối tồn kho sẽ báo thời gian cụ thể sau khảo sát.`,
};

export const faqData: FaqItem = {
  q: 'Dữ liệu khách hàng có an toàn không?',
  a: 'AI Agent chỉ hỏi những thông tin cần cho việc chăm sóc khách, như tên và số điện thoại. Thông tin được lưu vào Google Sheet hoặc tài khoản do chính doanh nghiệp sở hữu; ADS-Nolimit chỉ dùng quyền truy cập để cài đặt, bảo trì, và anh/chị có thể thu hồi quyền bất cứ lúc nào. Khi khách yêu cầu xóa dữ liệu, anh/chị xóa được ngay. Xem thêm <a href="/chinh-sach-bao-mat/">chính sách bảo mật</a>.',
};

export const faqTech: FaqItem = {
  q: 'Tôi không rành công nghệ, có dùng được không?',
  a: 'Được. ADS-Nolimit cài đặt toàn bộ. Anh/chị chỉ cần gửi tài liệu bán hàng, duyệt kịch bản trả lời và nhận thông báo khách mới qua Telegram hoặc Zalo như nhắn tin bình thường.',
};

export const faqWrongAnswer: FaqItem = {
  q: 'Nếu AI trả lời sai thì sao?',
  a: 'AI Agent chỉ trả lời dựa trên tài liệu anh/chị cung cấp. Với câu hỏi ngoài tài liệu hoặc nhạy cảm (khiếu nại, sức khỏe, giảm giá ngoài chính sách), AI được cài để chuyển cho nhân viên thay vì tự đoán. Trong giai đoạn đo và tối ưu, ADS-Nolimit xem lại các câu AI chưa trả lời được để bổ sung tài liệu.',
};

export const faqAutomation: FaqItem = {
  q: 'Tự động hóa một quy trình tốn bao nhiêu?',
  a: `${priceInline(automation)}. Mức giá cụ thể phụ thuộc số bước và số phần mềm cần kết nối; ADS-Nolimit báo giá sau buổi khảo sát miễn phí.`,
};

export const homeFaq: FaqItem[] = [faqCost, faqLeadTime, faqData, faqTech];
export const agentFaq: FaqItem[] = [faqCost, faqLeadTime, faqWrongAnswer, faqData, faqTech];
