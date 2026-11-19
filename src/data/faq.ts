/**
 * Câu hỏi thường gặp (tiếng Việt + tiếng Anh). Giá lấy từ src/data/pricing.ts để không lệch nhau.
 */
import type { Lang } from '../config/i18n';
import { localize } from '../config/i18n';
import { getPlan, priceInline, getPriceNote, getStarterLeadTime } from './pricing';

export interface FaqItem {
  q: string;
  /** Có thể chứa HTML đơn giản (liên kết) do chính site soạn */
  a: string;
}

export const getFaq = (lang: Lang = 'vi') => {
  const starter = getPlan('ai-starter', lang);
  const sales = getPlan('ai-sales', lang);
  const automation = getPlan('automation', lang);
  const note = getPriceNote(lang);
  const lead = getStarterLeadTime(lang);
  const pricing = localize('/bang-gia/', lang);
  const privacy = localize('/chinh-sach-bao-mat/', lang);

  const vi = {
    cost: {
      q: 'Chi phí AI Agent là bao nhiêu?',
      a: `Gói ${starter.name}: ${priceInline(starter)} (${starter.limit?.toLowerCase()}). Gói ${sales.name}: ${priceInline(sales)} (${sales.limit?.toLowerCase()}). ${note} Xem đủ ở <a href="${pricing}">bảng giá</a>.`,
    },
    leadTime: {
      q: 'Bao lâu thì AI Agent chạy được?',
      a: `Gói ${starter.name} thường triển khai trong ${lead}, tính từ khi bạn gửi đủ tài liệu: bảng giá, câu hỏi khách hay hỏi, chính sách đổi trả, giờ làm việc. Gói nhiều kênh hoặc cần kết nối tồn kho sẽ báo thời gian cụ thể sau khảo sát.`,
    },
    data: {
      q: 'Dữ liệu khách hàng có an toàn không?',
      a: `AI Agent chỉ hỏi những thông tin cần cho việc chăm sóc khách, như tên và số điện thoại. Thông tin được lưu vào Google Sheet hoặc tài khoản do chính doanh nghiệp sở hữu; ADS-Nolimit chỉ dùng quyền truy cập để cài đặt, bảo trì, và bạn có thể thu hồi quyền bất cứ lúc nào. Khi khách yêu cầu xóa dữ liệu, bạn xóa được ngay. Xem thêm <a href="${privacy}">chính sách bảo mật</a>.`,
    },
    tech: {
      q: 'Tôi không rành công nghệ, có dùng được không?',
      a: 'Được. ADS-Nolimit cài đặt toàn bộ. Bạn chỉ cần gửi tài liệu bán hàng, duyệt kịch bản trả lời và nhận thông báo khách mới qua Telegram hoặc Zalo như nhắn tin bình thường.',
    },
    wrongAnswer: {
      q: 'Nếu AI trả lời sai thì sao?',
      a: 'AI Agent chỉ trả lời dựa trên tài liệu bạn cung cấp. Với câu hỏi ngoài tài liệu hoặc nhạy cảm (khiếu nại, sức khỏe, giảm giá ngoài chính sách), AI được cài để chuyển cho nhân viên thay vì tự đoán. Trong giai đoạn đo và tối ưu, ADS-Nolimit xem lại các câu AI chưa trả lời được để bổ sung tài liệu.',
    },
    automation: {
      q: 'Tự động hóa một quy trình tốn bao nhiêu?',
      a: `${priceInline(automation)}. Mức giá cụ thể phụ thuộc số bước và số phần mềm cần kết nối; ADS-Nolimit báo giá sau buổi khảo sát miễn phí.`,
    },
  };

  const en = {
    cost: {
      q: 'How much does an AI agent cost?',
      a: `${starter.name}: ${priceInline(starter, 'en')} (${starter.limit?.toLowerCase()}). ${sales.name}: ${priceInline(sales, 'en')} (${sales.limit?.toLowerCase()}). ${note} See the full <a href="${pricing}">pricing</a>.`,
    },
    leadTime: {
      q: 'How long until the AI agent is live?',
      a: `The ${starter.name} plan usually takes ${lead}, counted from when you send us everything we need: your price list, the questions customers ask most, your returns policy and opening hours. For several channels or a stock connection, we confirm the timeline after the assessment.`,
    },
    data: {
      q: 'Is my customers’ data safe?',
      a: `The AI agent only asks for what customer care needs, such as a name and phone number. Details are saved to a Google Sheet or another account your business owns. ADS-Nolimit uses its access only to set up and maintain the agent, and you can revoke that access at any time. If a customer asks for their data to be deleted, you can delete it straight away. See our <a href="${privacy}">privacy policy</a>.`,
    },
    tech: {
      q: 'I’m not technical. Can I still use it?',
      a: 'Yes. ADS-Nolimit handles the whole setup. You send us your sales documents, approve the reply scripts, and get new-lead alerts on Telegram or Zalo like any other message.',
    },
    wrongAnswer: {
      q: 'What if the AI gives a wrong answer?',
      a: 'The AI agent answers only from the documents you provide. For questions outside those documents or sensitive topics (complaints, health, discounts outside your policy), it is set up to hand over to a staff member instead of guessing. During the measure-and-improve stage, ADS-Nolimit reviews the questions it could not answer and fills the gaps in the documents.',
    },
    automation: {
      q: 'How much does it cost to automate a workflow?',
      a: `${priceInline(automation, 'en')}. The exact price depends on the number of steps and the apps that need connecting; ADS-Nolimit sends a quote after the free assessment.`,
    },
  };

  const items = lang === 'en' ? en : vi;
  return {
    ...items,
    home: [items.cost, items.leadTime, items.data, items.tech] as FaqItem[],
    agent: [items.cost, items.leadTime, items.wrongAnswer, items.data, items.tech] as FaqItem[],
  };
};
