/**
 * Hướng dẫn sử dụng: chủ đề (category) + danh sách bài (guides/ đã đăng), trang đọc bài (#huong-dan/<id>).
 * Nội dung bài viết dạng chữ thường hoặc Markdown đơn giản: tiêu đề (#, ##), danh sách (-, 1.), **đậm**, *nghiêng*,
 * `mã`, [link](https://…). Vẽ bằng DOM (không innerHTML) nên không chèn được mã lạ.
 */
import { byId, h, icon } from '../ui/dom';
import { isVisible, lang, loadError, register, route, when } from './ctx';
import { ensure, errors, isLoaded, on, reload, state } from './store';
import type { Guide } from './store';
import { tx } from './text';
import { videoFrame } from './video';

const index = byId('guides-index');
const list = byId('guide-list');
const cats = byId('guide-cats');
const empty = byId('guides-empty');
const alert = byId('guides-alert');
const view = byId('guide-view');

let category = '';

const title = (g: Guide) => (lang === 'en' && g.titleEn ? g.titleEn : g.title);
const cat = (g: Guide) => (lang === 'en' && g.categoryEn ? g.categoryEn : g.category);
const body = (g: Guide) => (lang === 'en' && g.bodyEn ? g.bodyEn : g.body);
const base = () => `#${lang === 'en' ? 'guides' : 'huong-dan'}`;

/* ---------- Markdown tối giản ---------- */

const inline = (text: string): Node[] => {
  const out: Node[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^\s)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
    if (m[2]) out.push(h('strong', { text: m[2] }));
    else if (m[3]) out.push(h('em', { text: m[3] }));
    else if (m[4]) out.push(h('code', { text: m[4] }));
    else if (m[5]) out.push(h('a', { href: m[6], target: '_blank', rel: 'noopener', text: m[5] }));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
};

export const renderMarkdown = (src: string): Node[] => {
  const nodes: Node[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let listEl: HTMLUListElement | HTMLOListElement | null = null;
  const flushPara = () => {
    if (para.length) nodes.push(h('p', {}, ...inline(para.join(' '))));
    para = [];
  };
  const flushList = () => {
    if (listEl) nodes.push(listEl);
    listEl = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (heading) {
      flushPara();
      flushList();
      nodes.push(h(heading[1].length === 1 ? 'h2' : 'h3', {}, ...inline(heading[2])));
    } else if (bullet || numbered) {
      flushPara();
      const want = bullet ? 'UL' : 'OL';
      if (!listEl || listEl.tagName !== want) {
        flushList();
        listEl = bullet ? h('ul', {}) : h('ol', {});
      }
      listEl.append(h('li', {}, ...inline((bullet ?? numbered)![1])));
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return nodes;
};

/* ---------- Danh sách ---------- */

const renderIndex = () => {
  const err = errors.get('guides');
  if (err) {
    loadError(alert, err, () => void reload('guides'));
    return;
  }
  alert.replaceChildren();
  if (!isLoaded('guides')) return;
  const guides = state.guides;
  empty.hidden = guides.length > 0;
  const categories = Array.from(new Set(guides.map(cat))).filter(Boolean);
  cats.hidden = categories.length < 2;
  if (category && !categories.includes(category)) category = '';
  cats.replaceChildren(
    ...['', ...categories].map((c) => {
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(c === category), text: c || tx('allCategories') });
      b.addEventListener('click', () => {
        category = c;
        renderIndex();
      });
      return b;
    }),
  );
  const shown = category ? guides.filter((g) => cat(g) === category) : guides;
  list.replaceChildren(
    ...shown.map((g) =>
      h(
        'li',
        {},
        h(
          'a',
          { class: 'guide-item', href: `${base()}/${encodeURIComponent(g.id)}`, 'data-glow': true },
          h('span', { class: 'guide-icon', 'aria-hidden': 'true' }, icon(g.videoUrl ? 'play' : 'guide')),
          h('span', { class: 'guide-main' }, h('span', { class: 'guide-cat', text: cat(g) }), h('span', { class: 'guide-title', text: title(g) })),
          icon('arrow', 'guide-arrow'),
        ),
      ),
    ),
  );
};

const renderArticle = (id: string) => {
  const g = state.guides.find((x) => x.id === id);
  const back = h('a', { class: 'back-link', href: base() }, icon('arrow-left'), tx('backToGuides'));
  if (!g) {
    view.replaceChildren(back, h('p', { class: 'muted', text: tx('guideNotFound') }));
    return;
  }
  const frame = videoFrame(g.videoUrl, title(g));
  view.replaceChildren(
    back,
    h('p', { class: 'eyebrow', text: cat(g) }),
    h('h2', { class: 'guide-article-title', text: title(g) }),
    g.updatedAt ? h('p', { class: 'muted small', text: tx('updatedAt', { date: when(g.updatedAt) }) }) : null,
    frame ? h('div', { class: 'guide-video' }, frame) : null,
    h('div', { class: 'prose guide-body' }, ...renderMarkdown(body(g))),
  );
};

const render = () => {
  const sub = route().sub;
  index.hidden = Boolean(sub);
  view.hidden = !sub;
  if (sub) {
    if (isLoaded('guides')) renderArticle(sub);
  } else renderIndex();
};

on(['guides'], () => {
  if (isVisible('guides')) render();
});

register('guides', {
  enter() {
    render();
    void ensure('guides');
  },
});
