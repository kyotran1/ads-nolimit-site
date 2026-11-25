// Kiểm độ tương phản tự động: mọi phần tử có chữ nhìn thấy → tỉ lệ giữa màu chữ và màu nền thật phía sau
// (đi ngược lên cha, chồng các lớp nền bán trong suốt cho tới khi gặp nền đặc; lớp gradient thử từng điểm màu, lấy trường hợp xấu nhất).
// Ngưỡng: ≥ 4.5 (chữ thường); ≥ 3 (chữ ≥ 24px, hoặc ≥ 18.66px và đậm ≥ 700).
// Dùng như module: const { auditPage } = require('./tuong-phan.cjs'); const loi = await auditPage(page);
// Hoặc chạy trực tiếp: node tuong-phan.cjs <cổng web> <thư mục dist> [sang|toi]
const AUDIT = () => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const parse = (str) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#000';
    cx.fillStyle = str;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    // canvas trả giá trị đã nhân alpha ngược lại không chính xác khi a nhỏ; dùng cách đo thứ hai trên nền trắng/đen
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, 1, 1);
    cx.fillStyle = str; cx.fillRect(0, 0, 1, 1);
    const w = cx.getImageData(0, 0, 1, 1).data;
    cx.fillStyle = '#000'; cx.fillRect(0, 0, 1, 1);
    cx.fillStyle = str; cx.fillRect(0, 0, 1, 1);
    const k = cx.getImageData(0, 0, 1, 1).data;
    // w = c*a + 255(1-a); k = c*a  → a = 1 - (w-k)/255
    const a = Math.min(1, Math.max(0, 1 - (w[0] - k[0]) / 255));
    if (a < 0.003) return [0, 0, 0, 0];
    return [Math.min(255, k[0] / a), Math.min(255, k[1] / a), Math.min(255, k[2] / a), a];
  };
  const over = (top, bot) => {
    const a = top[3] + bot[3] * (1 - top[3]);
    if (a === 0) return [0, 0, 0, 0];
    return [0, 1, 2].map((i) => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat(a);
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const colorRe = /rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g;
  const stopsOf = (bi) => (bi.match(colorRe) || []).map(parse).filter((c) => c[3] > 0.02);
  const sel = (el) => {
    const parts = [];
    for (let n = el, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentElement, i++) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += '#' + n.id;
      else if (n.classList.length) s += '.' + [...n.classList].slice(0, 2).join('.');
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const out = [];
  const seen = new Set();
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'TEMPLATE', 'OPTION'].includes(el.tagName.toUpperCase())) continue;
    let text = '';
    for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent;
    text = text.replace(/\s+/g, ' ').trim();
    const isField = (el.tagName === 'INPUT' && !['checkbox', 'radio', 'file', 'hidden', 'range'].includes(el.type) && el.value) || (el.tagName === 'TEXTAREA' && el.value);
    if (!text && !isField) continue;
    if (!text) text = String(el.value).slice(0, 30);
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (el.closest('[hidden], [aria-hidden="true"]')) continue; // chữ trang trí (vd dấu | ngăn VI | EN)
    if (el.classList.contains('skip-link') && r.top < 0) continue; // link nhảy: chỉ hiện khi được focus (kiểm riêng trong e2e-nut.cjs)
    // chữ có phủ trong suốt do cha mờ
    let opacity = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const o = parseFloat(getComputedStyle(n).opacity);
      opacity *= isNaN(o) ? 1 : o;
    }
    if (opacity < 0.05) continue;
    // màu chữ (có thể là gradient cắt theo chữ)
    let fgCands;
    if (cs.webkitTextFillColor && parse(cs.webkitTextFillColor)[3] === 0 && /text/.test(cs.webkitBackgroundClip || cs.backgroundClip)) {
      fgCands = stopsOf(cs.backgroundImage);
      if (!fgCands.length) continue;
    } else {
      fgCands = [parse(cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color)];
    }
    // các lớp nền từ trong ra ngoài
    const layers = [];
    let solid = false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      const bc = parse(s.backgroundColor);
      const clipText = /text/.test(s.webkitBackgroundClip || s.backgroundClip);
      // Tách các lớp ảnh nền (cách nhau bởi dấu phẩy ngoài ngoặc); lớp đầu nằm trên cùng
      const imgs = [];
      { let depth = 0, cur = ''; for (const ch of s.backgroundImage) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { imgs.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) imgs.push(cur.trim()); }
      const bsAll = (s.backgroundSize || '').split(/,\s*/);
      const clips = (s.backgroundClip || '').split(/,\s*/);
      const borderOnlyMix = clips.includes('padding-box') && clips.includes('border-box');
      imgs.forEach((img, i) => {
        if (!/gradient/.test(img) || clipText) return;
        const bs = (bsAll[i % bsAll.length] || '').split(/\s+/);
        // gradient làm gạch chân/hiệu ứng nhỏ (kích thước 0% hoặc cao ≤ 3px) không phải nền chữ
        if (/^0(%|px)?$/.test(bs[0]) || (bs[1] && /px$/.test(bs[1]) && parseFloat(bs[1]) <= 3)) return;
        // viền gradient: lớp border-box nằm sau lớp padding-box đặc
        if (borderOnlyMix && clips[i % clips.length] === 'border-box') return;
        const st = stopsOf(img);
        if (st.length) layers.push({ opts: st.concat(/transparent|rgba\([^)]*,\s*0\)/.test(img) ? [[0, 0, 0, 0]] : []) });
      });
      if (bc[3] > 0) { layers.push({ opts: [bc] }); if (bc[3] >= 0.995) { solid = true; break; } }
    }
    if (!solid) layers.push({ opts: [parse(getComputedStyle(document.documentElement).backgroundColor), [255, 255, 255, 1]].slice(0, 1) });
    // thử các tổ hợp (tối đa 80)
    let combos = [[]];
    for (const L of layers) {
      const next = [];
      for (const c of combos) for (const o of L.opts) next.push(c.concat([o]));
      combos = next.length > 80 ? next.filter((_, i) => i % Math.ceil(next.length / 80) === 0) : next;
    }
    let worst = null;
    for (const c of combos) {
      // c[0] là lớp trong cùng; ghép từ ngoài vào trong
      let bg = [255, 255, 255, 1];
      for (let i = c.length - 1; i >= 0; i--) bg = over(c[i], bg);
      for (const f of fgCands) {
        const fa = [f[0], f[1], f[2], f[3] * opacity];
        const fg = over(fa, bg);
        const ra = ratio(fg, bg);
        if (!worst || ra < worst.ra) worst = { ra, fg, bg };
      }
    }
    if (!worst) continue;
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (worst.ra + 0.005 >= need) continue;
    const key = sel(el) + '|' + worst.fg.map(Math.round) + '|' + worst.bg.map(Math.round);
    if (seen.has(key)) continue;
    seen.add(key);
    const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    out.push({ sel: sel(el), text: text.slice(0, 40), ratio: +worst.ra.toFixed(2), need, fg: hex(worst.fg), bg: hex(worst.bg), size });
  }
  return out;
};

async function auditPage(page) {
  return page.evaluate(AUDIT);
}
module.exports = { auditPage };

if (require.main === module) {
  const { chromium } = require('playwright');
  const fs = require('fs');
  const path = require('path');
  const [port, dist, theme = 'sang'] = process.argv.slice(2);
  const BASE = `http://127.0.0.1:${port}`;
  const walk = (d, acc = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, acc); else if (f.name === 'index.html') acc.push(p); } return acc; };
  const pages = walk(dist).filter((p) => !/http-equiv="refresh"/i.test(fs.readFileSync(p, 'utf8'))).map((p) => '/' + path.relative(dist, path.dirname(p)).split(path.sep).join('/') + '/').map((p) => p.replace('/./', '/')).sort();
  (async () => {
    const browser = await chromium.launch();
    let total = 0;
    const groups = new Map();
    for (const w of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w > 600 ? 900 : 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      if (theme === 'sang') await ctx.addInitScript(() => { try { localStorage.setItem('adsnl-theme', 'light'); } catch (e) {} });
      await ctx.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
      for (const p of pages) {
        const page = await ctx.newPage();
        try {
          await page.goto(BASE + p, { waitUntil: 'commit' }); await page.waitForLoadState('load'); await page.waitForTimeout(500);
          await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
          const loi = await auditPage(page);
          total += loi.length;
          for (const l of loi) { const k = `${l.sel} ${l.fg} on ${l.bg}`; const g = groups.get(k) || { l, pages: new Set() }; g.pages.add(p + '@' + w); groups.set(k, g); }
        } catch (e) { console.log('LỖI', p, String(e).slice(0, 100)); }
        await page.close();
      }
      await ctx.close();
    }
    await browser.close();
    for (const [k, g] of groups) console.log(`${g.l.ratio}<${g.l.need} ${g.l.fg} on ${g.l.bg} "${g.l.text}" ${g.l.sel}  [${g.pages.size} trang, vd ${[...g.pages][0]}]`);
    console.log('TỔNG số chỗ không đạt:', total, '- số nhóm khác nhau:', groups.size);
  })();
}
