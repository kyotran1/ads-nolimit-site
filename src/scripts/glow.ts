/**
 * Ánh sáng theo chuột (xem src/styles/fx.css).
 *
 * - Khối có [data-glow] và mỗi section con trực tiếp của <main> nhận --mx / --my
 *   (px, tính từ góc trên trái của khối) để CSS vẽ vệt sáng đúng chỗ con trỏ.
 * - Khối có thêm [data-tilt] nghiêng nhẹ theo chuột (--rx / --ry, tối đa 5°).
 * - Một listener pointermove (passive) cho cả trang, gom cập nhật vào requestAnimationFrame.
 * - Chỉ chạy với chuột thật: (hover: hover) and (pointer: fine). Màn cảm ứng: không làm gì.
 * - prefers-reduced-motion: reduce → không chạy; CSS vẫn sáng tĩnh khi rê chuột.
 */
const SEL = '[data-glow], main > section';
const MAX_TILT = 5;
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

let x = 0;
let y = 0;
let target: Element | null = null;
let raf = 0;
let tilted: HTMLElement | null = null;
let on = false;

const set = (el: HTMLElement, name: string, value: string) => el.style.setProperty(name, value);

const untilt = () => {
  tilted?.style.removeProperty('--rx');
  tilted?.style.removeProperty('--ry');
  tilted = null;
};

const frame = () => {
  raf = 0;
  let tilt: HTMLElement | null = null;
  let el = target?.closest<HTMLElement>(SEL) ?? null;
  while (el) {
    // Khối đang nghiêng: dùng tâm (không đổi khi xoay) + kích thước chưa biến đổi.
    const r = el.getBoundingClientRect();
    const w = el.offsetWidth || r.width;
    const h = el.offsetHeight || r.height;
    const px = x - (r.left + r.width / 2) + w / 2;
    const py = y - (r.top + r.height / 2) + h / 2;
    set(el, '--mx', `${px.toFixed(1)}px`);
    set(el, '--my', `${py.toFixed(1)}px`);
    if (!tilt && el.hasAttribute('data-tilt')) {
      tilt = el;
      set(el, '--ry', `${(((px / w) * 2 - 1) * MAX_TILT).toFixed(2)}deg`);
      set(el, '--rx', `${((1 - (py / h) * 2) * MAX_TILT).toFixed(2)}deg`);
    }
    el = el.parentElement?.closest<HTMLElement>(SEL) ?? null;
  }
  if (tilted !== tilt) untilt();
  tilted = tilt;
};

const queue = () => {
  if (!raf) raf = requestAnimationFrame(frame);
};

const onMove = (e: PointerEvent) => {
  if (e.pointerType !== 'mouse') return;
  x = e.clientX;
  y = e.clientY;
  target = e.target as Element;
  queue();
};

// Cuộn trang mà không động chuột: khối dưới con trỏ đổi, cập nhật lại vệt sáng.
const onScroll = () => {
  if (!target) return;
  target = document.elementFromPoint(x, y);
  queue();
};

const onLeave = () => {
  target = null;
  untilt();
};

const sync = () => {
  const want = fine.matches && !reduce.matches;
  if (want === on) return;
  on = want;
  const method = want ? 'addEventListener' : 'removeEventListener';
  document[method]('pointermove', onMove as EventListener, { passive: true });
  window[method]('scroll', onScroll, { passive: true });
  document.documentElement[method]('pointerleave', onLeave);
  if (!want) onLeave();
};

fine.addEventListener('change', sync);
reduce.addEventListener('change', sync);
sync();
