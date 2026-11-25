// So từng điểm ảnh hai thư mục ảnh (cùng tên tệp). Dùng: node so-anh.cjs <thư mục gốc> <thư mục mới> [ngưỡng % mỗi kênh=0]
// In ra % điểm ảnh lệch cho từng ảnh; ảnh khác kích thước tính là lệch 100%.
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');
const [a, b, diffDir] = process.argv.slice(2);
if (diffDir) fs.mkdirSync(diffDir, { recursive: true });
const rows = [];
for (const f of fs.readdirSync(a).filter((x) => x.endsWith('.png')).sort()) {
  if (!fs.existsSync(path.join(b, f))) { rows.push([f, 'THIẾU']); continue; }
  const A = PNG.sync.read(fs.readFileSync(path.join(a, f)));
  const B = PNG.sync.read(fs.readFileSync(path.join(b, f)));
  if (A.width !== B.width || A.height !== B.height) { rows.push([f, `khác kích thước ${A.width}x${A.height} vs ${B.width}x${B.height}`, 100]); continue; }
  let n = 0, big = 0, mx = 0, minY = 1e9, maxY = -1;
  const D = diffDir ? new PNG({ width: A.width, height: A.height }) : null;
  for (let i = 0; i < A.data.length; i += 4) {
    const d = A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2];
    const m = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (m > mx) mx = m;
    if (m > 3) big++;
    if (d) { n++; const y = Math.floor(i / 4 / A.width); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    if (D) { D.data[i] = d ? 255 : A.data[i] >> 2; D.data[i + 1] = d ? 0 : A.data[i + 1] >> 2; D.data[i + 2] = d ? 0 : A.data[i + 2] >> 2; D.data[i + 3] = 255; }
  }
  const pct = (100 * n) / (A.width * A.height);
  if (D && n) fs.writeFileSync(path.join(diffDir, f), PNG.sync.write(D));
  rows.push([f, pct.toFixed(4) + '%', pct, n ? `hàng ${minY}-${maxY} (cao ${A.height}) lệch kênh tối đa ${mx}, điểm lệch >3: ${((100 * big) / (A.width * A.height)).toFixed(4)}%` : '']);
}
let worst = 0;
for (const r of rows) { console.log(r[0].padEnd(40), String(r[1]).padEnd(12), r[3] || ''); if (typeof r[2] === 'number') worst = Math.max(worst, r[2]); }
console.log('LỆCH LỚN NHẤT', worst.toFixed(4) + '%');
