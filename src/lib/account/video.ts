/**
 * Nhúng video bài học / hướng dẫn: YouTube (bản youtube-nocookie), Google Drive, Vimeo, hoặc file video trực tiếp (.mp4/.webm).
 * Link khác: hiện nút mở trong tab mới. Chỉ nhận link https.
 */
import { h, icon } from '../ui/dom';
import { tx } from './text';

export const embedFor = (raw: string): { kind: 'iframe' | 'video' | 'link'; src: string } | null => {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^www\.|^m\./, '');
  const id = (s: string | null | undefined) => (s && /^[A-Za-z0-9_-]{6,64}$/.test(s) ? s : '');

  if (host === 'youtu.be') {
    const v = id(url.pathname.slice(1));
    if (v) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${v}?rel=0` };
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    const v = id(url.searchParams.get('v')) || (['embed', 'shorts', 'live'].includes(parts[0]) ? id(parts[1]) : '');
    if (v) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${v}?rel=0` };
  }
  if (host === 'drive.google.com') {
    const m = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/);
    const v = m ? m[1] : id(url.searchParams.get('id'));
    if (v) return { kind: 'iframe', src: `https://drive.google.com/file/d/${v}/preview` };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = url.pathname.match(/(\d{6,12})/);
    if (m) return { kind: 'iframe', src: `https://player.vimeo.com/video/${m[1]}` };
  }
  if (/\.(mp4|webm|ogg|mov)$/i.test(url.pathname)) return { kind: 'video', src: url.href };
  return { kind: 'link', src: url.href };
};

/** Khung video 16:9 cho một link; không có link → null. */
export const videoFrame = (raw: string, title: string): HTMLElement | null => {
  if (!raw) return null;
  const e = embedFor(raw);
  if (!e) return null;
  if (e.kind === 'iframe')
    return h(
      'div',
      { class: 'video-frame' },
      h('iframe', {
        src: e.src,
        title,
        loading: 'lazy',
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen',
        referrerpolicy: 'strict-origin-when-cross-origin',
      }),
    );
  if (e.kind === 'video') return h('div', { class: 'video-frame' }, h('video', { src: e.src, controls: true, preload: 'metadata', playsinline: true }));
  return h(
    'div',
    { class: 'video-frame video-frame--link' },
    h('p', { text: tx('lessonVideoUnsupported') }),
    h('a', { class: 'btn btn-sm', href: e.src, target: '_blank', rel: 'noopener' }, icon('external'), tx('openVideo')),
  );
};

/** "12:30" / "1:02:03" → giây (sai dạng → 0). */
export const durationSeconds = (s: string): number => {
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(s.trim())) return 0;
  return s
    .trim()
    .split(':')
    .map(Number)
    .reduce((acc, n) => acc * 60 + n, 0);
};

/** Giây → "1 giờ 05 phút" / "1 h 05 min" (gọn). */
export const humanDuration = (seconds: number, lang: 'vi' | 'en'): string => {
  if (!seconds) return '';
  const hrs = Math.floor(seconds / 3600);
  const min = Math.round((seconds % 3600) / 60);
  if (lang === 'en') return hrs ? `${hrs} h ${String(min).padStart(2, '0')} min` : `${min} min`;
  return hrs ? `${hrs} giờ ${String(min).padStart(2, '0')} phút` : `${min} phút`;
};
