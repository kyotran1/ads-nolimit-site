/**
 * Trợ lý AI — khung chat góc dưới phải (trình duyệt). Nạp lười: chỉ tải khi khách bấm nút hoặc khung đang mở dở.
 * Chữ của AI không bao giờ chèn dạng HTML: đọc qua parseReply rồi dựng bằng textContent.
 * Lưu trên máy khách: cuộc trò chuyện của thẻ trình duyệt (sessionStorage), mã phiên (localStorage).
 */
import { icon } from '../ui/dom';
import { MAX_INPUT, MAX_KEEP, buildRequest, cleanInput, errKind, isSid, newSid, parseReply } from './core';
import type { Block, ErrKind, Inline, Msg } from './core';

type Item = Msg | { role: 'note'; content: ErrKind };
type Lang = 'vi' | 'en';

const STORE = 'trl-v1';
const SID = 'trl-sid';
const TIMEOUT = 40_000;

const text = {
  vi: {
    title: 'Trợ lý AI ADS-Nolimit',
    sub: 'Trả lời tự động bằng AI · có thể nhầm',
    close: 'Đóng trợ lý AI',
    hello: 'Chào bạn! Mình là trợ lý AI của ADS-Nolimit. Bạn hỏi gì cũng được: dịch vụ, bảng giá, quảng cáo, AI Agent… Cần gặp người thật thì bấm Zalo bên dưới nhé.',
    chips: ['Bảng giá AI Agent thế nào?', 'Chạy quảng cáo Facebook với ADS-Nolimit ra sao?', 'Nạp ngân sách quảng cáo thế nào?'],
    placeholder: 'Nhập câu hỏi…',
    send: 'Gửi',
    typing: 'Trợ lý đang soạn trả lời',
    zalo: 'Gặp người thật qua Zalo',
    clear: 'Xóa trò chuyện',
    note: 'Tin nhắn được gửi tới Claude (Anthropic) để trả lời. ADS-Nolimit không lưu nội dung.',
    left: (n: number) => `Còn ${n} ký tự`,
    err: {
      limit: 'Bạn đã hỏi khá nhiều trong vài giờ qua. Bạn nhắn Zalo để được hỗ trợ tiếp nhé.',
      busy: 'Trợ lý đang bận, bạn thử gửi lại sau ít phút nhé.',
      daily: 'Hôm nay trợ lý đã trả lời rất nhiều, tạm nghỉ đến ngày mai. Bạn nhắn Zalo để được hỗ trợ ngay nhé.',
      long: 'Câu hỏi hơi dài, bạn rút gọn dưới 800 ký tự giúp mình nhé.',
      down: 'Trợ lý tạm thời chưa trả lời được. Bạn thử lại sau hoặc nhắn Zalo nhé.',
    },
  },
  en: {
    title: 'ADS-Nolimit AI assistant',
    sub: 'Automatic AI answers · may make mistakes',
    close: 'Close AI assistant',
    hello: 'Hi! I’m the ADS-Nolimit AI assistant. Ask me anything: services, pricing, advertising, AI agents… To talk to a person, tap Zalo below.',
    chips: ['How much does an AI agent cost?', 'How do you run Facebook ads for me?', 'How do I add ad budget?'],
    placeholder: 'Type your question…',
    send: 'Send',
    typing: 'The assistant is typing',
    zalo: 'Talk to a person on Zalo',
    clear: 'Clear chat',
    note: 'Messages are sent to Claude (Anthropic) to answer. ADS-Nolimit does not store them.',
    left: (n: number) => `${n} characters left`,
    err: {
      limit: 'You have asked a lot in the last few hours. Please message us on Zalo to continue.',
      busy: 'The assistant is busy. Please try again in a few minutes.',
      daily: 'The assistant has reached today’s limit. Please message us on Zalo for help right away.',
      long: 'That question is a bit long. Please keep it under 800 characters.',
      down: 'The assistant can’t answer right now. Please try again later or message us on Zalo.',
    },
  },
} as const;

/* ---------- lưu trên máy (mọi lỗi lưu trữ đều bỏ qua) ---------- */

const loadState = (): { items: Item[]; open: boolean } => {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORE) || 'null');
    if (raw && Array.isArray(raw.items)) {
      const items = (raw.items as Item[]).filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'note') && typeof m.content === 'string');
      return { items: items.slice(-MAX_KEEP), open: raw.open === true };
    }
  } catch {
    /* bỏ qua */
  }
  return { items: [], open: false };
};
const saveState = (items: Item[], open: boolean) => {
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ items: items.slice(-MAX_KEEP), open }));
  } catch {
    /* bỏ qua */
  }
};
let memSid = '';
const sid = (): string => {
  try {
    const s = localStorage.getItem(SID);
    if (isSid(s)) return s;
    const n = newSid();
    localStorage.setItem(SID, n);
    return n;
  } catch {
    return (memSid ||= newSid());
  }
};

/* ---------- dựng chữ trả lời ---------- */

const inline = (parts: Inline[]): Node[] =>
  parts.map((p) => {
    if (p.t === 'b') {
      const b = document.createElement('strong');
      b.textContent = p.text;
      return b;
    }
    if (p.t === 'a') {
      const a = document.createElement('a');
      a.href = p.href;
      a.textContent = p.text;
      if (!/^https:\/\/(www\.)?ads-nolimit\.agency\//.test(p.href)) {
        a.target = '_blank';
        a.rel = 'noopener';
      }
      return a;
    }
    return document.createTextNode(p.text);
  });

const blocks = (bs: Block[]): Node[] =>
  bs.map((b) => {
    if (b.t === 'p') {
      const p = document.createElement('p');
      p.append(...inline(b.parts));
      return p;
    }
    const list = document.createElement(b.t);
    for (const it of b.items) {
      const li = document.createElement('li');
      li.append(...inline(it));
      list.append(li);
    }
    return list;
  });

/* ---------- khung chat ---------- */

interface Chat {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
}

const chats = new WeakMap<HTMLElement, Chat>();

const create = (root: HTMLElement): Chat => {
  const lang: Lang = root.dataset.lang === 'en' ? 'en' : 'vi';
  const T = text[lang];
  const endpoint = root.dataset.endpoint || '';
  const zalo = root.dataset.zalo || 'https://zalo.me/0888882823';
  const fab = root.querySelector<HTMLButtonElement>('.trl-fab')!;
  const state = loadState();
  let items = state.items;
  let busy = false;

  const panel = document.createElement('section');
  panel.id = 'trl-panel';
  panel.className = 'trl-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', T.title);
  panel.hidden = true;

  const head = document.createElement('header');
  head.className = 'trl-head';
  const avatar = document.createElement('span');
  avatar.className = 'trl-avatar';
  avatar.append(icon('spark'));
  const titles = document.createElement('div');
  const h = document.createElement('p');
  h.className = 'trl-title';
  h.textContent = T.title;
  const sub = document.createElement('p');
  sub.className = 'trl-sub';
  sub.textContent = T.sub;
  titles.append(h, sub);
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'trl-x';
  x.setAttribute('aria-label', T.close);
  x.append(icon('x'));
  head.append(avatar, titles, x);

  const log = document.createElement('div');
  log.className = 'trl-log';
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');

  const chips = document.createElement('div');
  chips.className = 'trl-chips';
  for (const c of T.chips) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'trl-chip';
    b.textContent = c;
    b.addEventListener('click', () => void send(c));
    chips.append(b);
  }

  const form = document.createElement('form');
  form.className = 'trl-form';
  const ta = document.createElement('textarea');
  ta.rows = 1;
  ta.maxLength = MAX_INPUT;
  ta.placeholder = T.placeholder;
  ta.setAttribute('aria-label', T.placeholder);
  const go = document.createElement('button');
  go.type = 'submit';
  go.className = 'trl-send';
  go.setAttribute('aria-label', T.send);
  go.append(icon('arrow'));
  form.append(ta, go);
  const count = document.createElement('p');
  count.className = 'trl-count';
  count.hidden = true;

  const foot = document.createElement('div');
  foot.className = 'trl-foot';
  const zl = document.createElement('a');
  zl.href = zalo;
  zl.target = '_blank';
  zl.rel = 'noopener';
  zl.append(icon('zalo'), T.zalo);
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'trl-clear';
  clear.textContent = T.clear;
  foot.append(zl, clear);
  const note = document.createElement('p');
  note.className = 'trl-note';
  note.textContent = T.note;

  panel.append(head, log, chips, form, count, foot, note);
  root.append(panel);
  fab.setAttribute('aria-controls', panel.id);

  const bubble = (m: Item): HTMLElement => {
    const d = document.createElement('div');
    if (m.role === 'note') {
      d.className = 'trl-msg trl-msg--note';
      const p = document.createElement('p');
      p.textContent = T.err[m.content];
      d.append(p);
      return d;
    }
    d.className = `trl-msg trl-msg--${m.role === 'user' ? 'me' : 'ai'}`;
    if (m.role === 'user') {
      const p = document.createElement('p');
      p.textContent = m.content;
      d.append(p);
    } else d.append(...blocks(parseReply(m.content)));
    return d;
  };

  const draw = () => {
    log.replaceChildren(bubble({ role: 'assistant', content: T.hello }), ...items.map(bubble));
    chips.hidden = items.some((m) => m.role === 'user') || busy;
    clear.hidden = items.length === 0;
    log.scrollTop = log.scrollHeight;
  };

  const typing = document.createElement('div');
  typing.className = 'trl-msg trl-msg--ai trl-typing';
  typing.setAttribute('aria-label', T.typing);
  typing.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));

  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 132)}px`;
    const left = MAX_INPUT - ta.value.length;
    count.hidden = left > 120;
    count.textContent = T.left(left);
  };

  const send = async (raw: string) => {
    const q = cleanInput(raw);
    if (!q || busy) return;
    busy = true;
    go.disabled = true;
    items.push({ role: 'user', content: q });
    ta.value = '';
    fit();
    saveState(items, true);
    draw();
    log.append(typing);
    log.scrollTop = log.scrollHeight;
    let result: Item;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const history = items.filter((m): m is Msg => m.role === 'user' || m.role === 'assistant');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(buildRequest(sid(), lang, location.pathname, history)),
        signal: ctl.signal,
      });
      const data = (await res.json()) as { ok?: boolean; reply?: unknown; code?: unknown };
      result = data.ok && typeof data.reply === 'string' && data.reply.trim() ? { role: 'assistant', content: data.reply.trim() } : { role: 'note', content: errKind(data.code) };
    } catch {
      result = { role: 'note', content: 'down' };
    } finally {
      clearTimeout(timer);
    }
    items.push(result);
    items = items.slice(-MAX_KEEP);
    busy = false;
    go.disabled = false;
    saveState(items, true);
    typing.remove();
    draw();
    if (!panel.hidden) ta.focus({ preventScroll: true });
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void send(ta.value);
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      void send(ta.value);
    }
  });
  ta.addEventListener('input', fit);
  clear.addEventListener('click', () => {
    items = [];
    saveState(items, true);
    draw();
    ta.focus();
  });

  const chat: Chat = {
    isOpen: () => !panel.hidden,
    open: () => {
      panel.hidden = false;
      root.classList.add('is-open');
      fab.setAttribute('aria-expanded', 'true');
      saveState(items, true);
      draw();
      ta.focus({ preventScroll: true });
    },
    close: () => {
      panel.hidden = true;
      root.classList.remove('is-open');
      fab.setAttribute('aria-expanded', 'false');
      saveState(items, false);
      fab.focus({ preventScroll: true });
    },
  };
  x.addEventListener('click', chat.close);
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') chat.close();
  });
  return chat;
};

const get = (root: HTMLElement) => {
  let c = chats.get(root);
  if (!c) {
    c = create(root);
    chats.set(root, c);
  }
  return c;
};

export const openChat = (root: HTMLElement) => get(root).open();
export const toggleChat = (root: HTMLElement) => {
  const c = get(root);
  if (c.isOpen()) c.close();
  else c.open();
};
