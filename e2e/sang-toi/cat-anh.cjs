// Cắt một ảnh dài thành các đoạn cao <h> để xem. Dùng: node cat-anh.cjs <ảnh> <thư mục ra> [cao=1100]
const sharp = require('sharp');
const path = require('path');
const [src, out, h = '1100'] = process.argv.slice(2);
(async () => {
  const m = await sharp(src).metadata();
  const H = Number(h);
  const base = path.basename(src, '.png');
  for (let y = 0, i = 0; y < m.height; y += H, i++) {
    await sharp(src).extract({ left: 0, top: y, width: m.width, height: Math.min(H, m.height - y) }).toFile(path.join(out, `${base}-${i}.png`));
  }
})();
