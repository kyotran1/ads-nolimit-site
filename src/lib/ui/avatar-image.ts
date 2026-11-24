/**
 * Ảnh đại diện: cắt vuông + thu nhỏ 128px ngay trên trình duyệt → data URL nhỏ (≤ 32 000 ký tự) lưu trong hồ sơ.
 * Dự án Firebase gói Spark không có Storage, nên ảnh phải đủ nhỏ để nằm trong tài liệu users/{uid}.
 */

export const AVATAR_SIZE = 128;
export const AVATAR_MAX_CHARS = 32000;

/** Khung cắt vuông ở giữa ảnh gốc w×h. */
export const cropSquare = (w: number, h: number): { sx: number; sy: number; size: number } => {
  const size = Math.max(1, Math.min(w, h));
  return { sx: Math.floor((w - size) / 2), sy: Math.floor((h - size) / 2), size };
};

const decode = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
  if (!file.type.startsWith('image/')) throw new Error('unreadable');
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* thử cách cũ */
    }
  }
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      fail(new Error('unreadable'));
    };
    img.src = url;
  });
};

/** File ảnh → data URL 128×128 (webp, fallback jpeg). Lỗi: 'unreadable' | 'too-large'. */
export const fileToAvatarDataUrl = async (file: File, size = AVATAR_SIZE): Promise<string> => {
  const img = await decode(file);
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const h = 'naturalHeight' in img ? img.naturalHeight : img.height;
  if (!w || !h) throw new Error('unreadable');
  const { sx, sy, size: s } = cropSquare(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('unreadable');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, sx, sy, s, s, 0, 0, size, size);
  if ('close' in img) img.close();
  const tries: [string, number][] = [
    ['image/webp', 0.8],
    ['image/jpeg', 0.7],
    ['image/jpeg', 0.5],
  ];
  for (const [type, q] of tries) {
    const url = canvas.toDataURL(type, q);
    if (!url.startsWith(`data:${type}`)) continue; // trình duyệt không hỗ trợ định dạng này
    if (url.length <= AVATAR_MAX_CHARS) return url;
  }
  throw new Error('too-large');
};
