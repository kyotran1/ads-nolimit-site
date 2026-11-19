/**
 * Khóa học: lưới khóa học (courses/ đã đăng), mở khóa bằng số dư (đơn + quyền học courseAccess/ trong một transaction),
 * trang khóa học (#khoa-hoc/<id>) với danh sách bài + trình phát video. Bài học (courses/{id}/lessons) chỉ đọc được
 * khi có quyền học (luật Firestore chặn nếu chưa mở khóa).
 */
import { collection, getDocs } from 'firebase/firestore/lite';
import { dataErrorMessage } from '../auth/messages';
import { formatUsd } from '../money';
import { byId, confirmDialog, h, icon, toast } from '../ui/dom';
import { go, isVisible, lang, loadError, me, money, register, route } from './ctx';
import { db, ensure, errors, isLoaded, on, ops, reload, state } from './store';
import type { Course, Lesson } from './store';
import { payFromBalance } from './pay';
import { tx } from './text';
import { durationSeconds, humanDuration, videoFrame } from './video';

const index = byId('courses-index');
const grid = byId('course-grid');
const empty = byId('courses-empty');
const alert = byId('courses-alert');
const view = byId('course-view');

const COVERS = ['aurora', 'ocean', 'sunset', 'forest', 'violet', 'gold'];
const coverOf = (c: Course) => (COVERS.includes(c.cover) ? c.cover : COVERS[Math.abs(hash(c.id)) % COVERS.length]);
const hash = (s: string) => Array.from(s).reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);

const title = (c: { title: string; titleEn: string }) => (lang === 'en' && c.titleEn ? c.titleEn : c.title);
const desc = (c: Course) => (lang === 'en' && c.descriptionEn ? c.descriptionEn : c.description);
const priceText = (c: Course) =>
  c.price === 0 ? tx('free') : lang === 'en' && c.priceUsd ? `${formatUsd(c.priceUsd)} · ${money(c.price)}` : money(c.price);
const hasAccess = (c: Course) => state.access.has(c.id);
const totalDuration = (c: Course) => humanDuration(c.outline.reduce((s, o) => s + durationSeconds(o.duration), 0), lang);

/* ---------- Mở khóa ---------- */

const unlock = async (c: Course, button?: HTMLButtonElement) => {
  const user = me();
  if (!user) return;
  if (button) button.disabled = true;
  try {
    if (c.price === 0) {
      await ops.unlockFreeCourse(user.uid, c.id);
      await reload('access');
      toast(tx('unlockedOk', { title: title(c) }));
      go('courses', c.id);
      return;
    }
    await payFromBalance({
      kind: 'course',
      productId: c.id,
      name: title(c),
      total: c.price,
      success: () => tx('unlockedOk', { title: title(c) }),
      after: () => {
        void reload('access').then(() => go('courses', c.id));
      },
    });
  } catch (err) {
    toast(dataErrorMessage(err), 'error');
  } finally {
    if (button) button.disabled = false;
  }
};

const unlockButton = (c: Course, block = false) => {
  const b = h(
    'button',
    { type: 'button', class: `btn btn-primary${block ? ' btn-block' : ''}` },
    icon(c.price === 0 ? 'spark' : 'lock'),
    c.price === 0 ? tx('unlockFree') : tx('unlockFor', { price: priceText(c) }),
  );
  b.addEventListener('click', async () => {
    if (c.price > 0) {
      const answer = await confirmDialog({
        title: tx('unlockTitle', { title: title(c) }),
        body: [tx('unlockBody', { price: money(c.price) })],
        confirm: tx('unlockYes'),
        cancel: tx('back'),
      });
      if (!answer.ok) return;
    }
    void unlock(c, b);
  });
  return b;
};

/* ---------- Lưới khóa học ---------- */

const card = (c: Course) => {
  const open = hasAccess(c);
  const href = `#${lang === 'en' ? 'courses' : 'khoa-hoc'}/${encodeURIComponent(c.id)}`;
  const n = c.outline.length;
  return h(
    'li',
    { class: `course-card${open ? ' is-open' : ''}`, 'data-glow': true },
    h(
      'a',
      { class: `course-cover cover--${coverOf(c)}`, href, 'aria-hidden': 'true', tabindex: -1 },
      h('span', { class: 'course-cover-icon' }, icon('book')),
      h('span', { class: `course-state ${open ? 'is-open' : ''}` }, icon(open ? 'check' : 'lock'), open ? tx('unlocked') : tx('locked')),
    ),
    h(
      'div',
      { class: 'course-body' },
      h('h3', { class: 'course-title' }, h('a', { href, text: title(c) })),
      desc(c) ? h('p', { class: 'course-desc', text: desc(c) }) : null,
      h(
        'p',
        { class: 'course-meta' },
        icon('play'),
        h('span', { text: n ? tx('lessonsCount', { n }) : tx('lessonsNone') }),
        totalDuration(c) ? h('span', { text: `· ${totalDuration(c)}` }) : null,
      ),
      h(
        'div',
        { class: 'course-foot' },
        open
          ? h('a', { class: 'btn btn-sm', href }, icon('play'), tx('startLearning'))
          : h('span', { class: 'course-price', text: priceText(c) }),
        open ? null : unlockButton(c),
      ),
    ),
  );
};

const renderIndex = () => {
  const err = errors.get('courses') ?? errors.get('access');
  if (err) {
    loadError(alert, err, () => void reload('courses', 'access'));
    return;
  }
  alert.replaceChildren();
  if (!isLoaded('courses') || !isLoaded('access')) return;
  empty.hidden = state.courses.length > 0;
  grid.replaceChildren(...state.courses.map(card));
};

/* ---------- Trang một khóa học ---------- */

const lessonsCache = new Map<string, Lesson[]>();

const loadLessons = async (courseId: string): Promise<Lesson[]> => {
  const cached = lessonsCache.get(courseId);
  if (cached) return cached;
  const snap = await getDocs(collection(db, 'courses', courseId, 'lessons'));
  const lessons = snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        title: typeof x.title === 'string' ? x.title : '',
        titleEn: typeof x.titleEn === 'string' ? x.titleEn : '',
        videoUrl: typeof x.videoUrl === 'string' ? x.videoUrl : '',
        duration: typeof x.duration === 'string' ? x.duration : '',
        sort: typeof x.sort === 'number' ? x.sort : 0,
      };
    })
    .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
  lessonsCache.set(courseId, lessons);
  return lessons;
};

let currentLesson = '';

const renderCourse = async (courseId: string) => {
  const c = state.courses.find((x) => x.id === courseId);
  const back = h('a', { class: 'back-link', href: `#${lang === 'en' ? 'courses' : 'khoa-hoc'}` }, icon('arrow-left'), tx('backToCourses'));
  if (!c) {
    view.replaceChildren(back, h('p', { class: 'muted', text: tx('courseNotFound') }));
    return;
  }
  const open = hasAccess(c);
  const head = h(
    'div',
    { class: `course-hero cover--${coverOf(c)}` },
    h(
      'div',
      { class: 'course-hero-text' },
      h('span', { class: `course-state ${open ? 'is-open' : ''}` }, icon(open ? 'check' : 'lock'), open ? tx('unlocked') : tx('locked')),
      h('h2', { text: title(c) }),
      desc(c) ? h('p', { text: desc(c) }) : null,
      h('p', { class: 'course-meta' }, icon('play'), h('span', { text: c.outline.length ? tx('lessonsCount', { n: c.outline.length }) : tx('lessonsNone') }), totalDuration(c) ? h('span', { text: `· ${totalDuration(c)}` }) : null),
      open ? null : unlockButton(c),
    ),
  );
  const player = h('div', { class: 'course-player' });
  const lessonList = h('ol', { class: 'lesson-list' });
  view.replaceChildren(back, head, h('div', { class: 'course-layout' }, player, h('div', { class: 'lesson-panel panel' }, lessonList)));

  if (!open) {
    player.replaceChildren(h('div', { class: 'video-frame video-frame--locked' }, icon('lock'), h('p', { text: tx('lessonsLocked') })));
    lessonList.replaceChildren(
      ...c.outline.map((o, i) =>
        h('li', { class: 'lesson is-locked' }, h('span', { class: 'lesson-num', text: String(i + 1) }), h('span', { class: 'lesson-title', text: title(o) }), h('span', { class: 'lesson-dur' }, o.duration ? o.duration : '', icon('lock'))),
      ),
    );
    return;
  }

  lessonList.replaceChildren(h('li', { class: 'row-loading' }, h('span', { class: 'spinner', 'aria-hidden': 'true' })));
  let lessons: Lesson[];
  try {
    lessons = await loadLessons(c.id);
  } catch (err) {
    lessonList.replaceChildren(h('li', { class: 'muted', text: dataErrorMessage(err) }));
    return;
  }
  if (!lessons.length) {
    player.replaceChildren(h('div', { class: 'video-frame video-frame--locked' }, icon('clock'), h('p', { text: tx('lessonsNone') })));
    lessonList.replaceChildren();
    return;
  }
  if (!lessons.some((l) => l.id === currentLesson)) currentLesson = lessons[0].id;

  const play = (l: Lesson) => {
    currentLesson = l.id;
    const frame = videoFrame(l.videoUrl, title(l));
    player.replaceChildren(
      frame ?? h('div', { class: 'video-frame video-frame--locked' }, icon('play'), h('p', { text: tx('lessonNoVideo') })),
      h('div', { class: 'player-caption' }, h('p', { class: 'eyebrow', text: tx('nowPlaying') }), h('h3', { text: title(l) })),
    );
    lessonList.querySelectorAll('button[data-lesson]').forEach((b) => b.setAttribute('aria-current', String((b as HTMLElement).dataset.lesson === l.id)));
  };

  lessonList.replaceChildren(
    ...lessons.map((l, i) => {
      const b = h(
        'button',
        { type: 'button', class: 'lesson-btn', 'data-lesson': l.id, 'aria-current': 'false' },
        h('span', { class: 'lesson-num', text: String(i + 1) }),
        h('span', { class: 'lesson-title', text: title(l) }),
        h('span', { class: 'lesson-dur', text: l.duration }),
      );
      b.addEventListener('click', () => play(l));
      return h('li', { class: 'lesson' }, b);
    }),
  );
  play(lessons.find((l) => l.id === currentLesson) ?? lessons[0]);
};

/* ---------- Hiển thị ---------- */

const render = () => {
  const sub = route().sub;
  index.hidden = Boolean(sub);
  view.hidden = !sub;
  if (sub) {
    if (isLoaded('courses') && isLoaded('access')) void renderCourse(sub);
  } else renderIndex();
};

on(['courses', 'access'], () => {
  if (isVisible('courses')) render();
});

register('courses', {
  enter() {
    render();
    void ensure('courses', 'access', 'wallet');
  },
});
