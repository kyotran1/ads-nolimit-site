/**
 * Trợ lý AI — phần thuần (không đụng DOM), có test đơn vị: dựng yêu cầu gửi trạm, cắt lịch sử,
 * đọc chữ trả lời thành khối an toàn để hiển thị (không bao giờ chèn HTML từ AI).
 */

export type Role = 'user' | 'assistant';
export interface Msg {
  role: Role;
  content: string;
}

export const MAX_INPUT = 800;
export const MAX_HISTORY = 12;
/** Số tin tối đa giữ trong khung chat (trên máy khách). */
export const MAX_KEEP = 40;

/** Làm gọn câu khách gõ: bỏ khoảng trắng thừa, tối đa 2 dòng trống liền nhau, cắt 800 ký tự. */
export const cleanInput = (s: string): string =>
  s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_INPUT);

/** Mã phiên ngẫu nhiên 20 ký tự (chữ + số), dùng để trạm đếm lượt theo trình duyệt. */
export const newSid = (rand: () => number = Math.random): string => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 20; i++) s += abc[Math.floor(rand() * abc.length)];
  return s;
};

export const isSid = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(s);

export interface ChatRequest {
  v: 1;
  sid: string;
  lang: 'vi' | 'en';
  page: string;
  messages: Msg[];
}

/** Yêu cầu gửi trạm: 12 tin gần nhất, bắt đầu bằng tin của khách. */
export const buildRequest = (sid: string, lang: 'vi' | 'en', page: string, history: Msg[]): ChatRequest => {
  let messages = history.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim()).slice(-MAX_HISTORY);
  while (messages.length && messages[0].role !== 'user') messages = messages.slice(1);
  return { v: 1, sid, lang, page: page.slice(0, 200), messages: messages.map((m) => ({ role: m.role, content: m.content })) };
};

/** Mã lỗi trạm trả về → loại thông báo hiện cho khách. */
export type ErrKind = 'limit' | 'busy' | 'daily' | 'long' | 'down';
export const errKind = (code: unknown): ErrKind =>
  code === 'limit' ? 'limit' : code === 'busy' ? 'busy' : code === 'daily' ? 'daily' : code === 'long' ? 'long' : 'down';

/* ---------- Hiển thị chữ trả lời ---------- */

export type Inline = { t: 'text'; text: string } | { t: 'b'; text: string } | { t: 'a'; text: string; href: string };
export type Block = { t: 'p'; parts: Inline[] } | { t: 'ul' | 'ol'; items: Inline[][] };

const ALLOWED_HOSTS = ['ads-nolimit.agency', 'www.ads-nolimit.agency', 'zalo.me', 't.me', 'm.me'];

/** Chỉ cho mở link https tới web ADS-Nolimit và kênh liên hệ của ADS-Nolimit. Trả về link đã chuẩn hóa hoặc null. */
export const safeHref = (raw: string): string | null => {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.includes(host)) return null;
    return u.href;
  } catch {
    return null;
  }
};

const TOKEN = /\*\*([^*\n]+?)\*\*|\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

/** Một dòng chữ → các mẩu: chữ thường, in đậm, link (link lạ thành chữ thường). */
export const parseInline = (line: string): Inline[] => {
  const out: Inline[] = [];
  const push = (p: Inline) => {
    const last = out[out.length - 1];
    if (p.t === 'text' && last?.t === 'text') last.text += p.text;
    else if (p.text) out.push(p);
  };
  let i = 0;
  for (const m of line.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > i) push({ t: 'text', text: line.slice(i, at) });
    if (m[1] !== undefined) push({ t: 'b', text: m[1] });
    else if (m[2] !== undefined) {
      const href = safeHref(m[3]);
      push(href ? { t: 'a', text: m[2], href } : { t: 'text', text: m[2] });
    } else {
      const href = safeHref(m[4]);
      push(href ? { t: 'a', text: m[4].replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, ''), href } : { t: 'text', text: m[4] });
    }
    i = at + m[0].length;
  }
  if (i < line.length) push({ t: 'text', text: line.slice(i) });
  return out;
};

/** Chữ trả lời → các khối: đoạn văn, danh sách gạch đầu dòng, danh sách số. Bỏ tiêu đề '#', dấu ``` . */
export const parseReply = (text: string): Block[] => {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { t: 'ul' | 'ol'; items: Inline[][] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', parts: parseInline(para.join('\n')) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/^#{1,6}\s+/, '').replace(/^```.*$/, '').trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d{1,2}[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      flushPara();
      const kind = bullet ? 'ul' : 'ol';
      if (!list || list.t !== kind) {
        flushList();
        list = { t: kind, items: [] };
      }
      list.items.push(parseInline((bullet ?? num)![1]));
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
};
