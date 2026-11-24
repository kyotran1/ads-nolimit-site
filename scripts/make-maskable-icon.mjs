/**
 * Sinh public/icon-maskable-512.png: thu icon-512.png còn 460px (logo thu ~10% cho chắc vùng an toàn của mặt nạ),
 * đặt giữa nền #070a1a 512x512. Chạy một lần: node scripts/make-maskable-icon.mjs (rồi commit ảnh).
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../public/icon-512.png', import.meta.url));
const out = fileURLToPath(new URL('../public/icon-maskable-512.png', import.meta.url));

const inner = await sharp(src).resize(460, 460).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#070a1a' } })
  .composite([{ input: inner, gravity: 'centre' }])
  .png()
  .toFile(out);
console.log('Đã ghi', out);
