/** Tiện ích thuần cho kiến thức trợ lý AI (có test đơn vị). */
const SITE = 'https://www.ads-nolimit.agency';

/** Bỏ thẻ HTML đơn giản trong câu trả lời hỏi đáp, giữ đường dẫn dạng "chữ (link)". */
export const stripHtml = (html: string): string =>
  html
    .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_m, href: string, text: string) => `${text} (${href.startsWith('/') ? SITE + href : href})`)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
