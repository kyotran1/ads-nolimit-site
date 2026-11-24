# Tạo bộ biểu tượng app từ logo Chủ tịch gửi 24/11/2026 (brand/logo-app-khung-goc.png). Chạy từ gốc dự án: python3 scripts/make-app-icons.py
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage as ndi

src = Image.open('brand/logo-app-khung-goc.png').convert('RGB')
a = np.asarray(src).astype(int)
dark = (a[..., 0] < 110) & (a[..., 1] < 110) & (a[..., 2] > 90)          # nét khung xanh đậm
lab, n = ndi.label(~dark)
outside = lab == lab[0, 0]                                                 # vùng ngoài khung (nền trắng + quầng sáng)
inside = ndi.binary_fill_holes(~outside)
inside = ndi.binary_erosion(inside, iterations=2)                          # bỏ viền nhòe sáng màu
ys, xs = np.where(inside)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
print('khung:', x0, y0, x1, y1, 'rong', x1 - x0, 'cao', y1 - y0)
alpha = Image.fromarray((inside * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.2))
rgba = src.convert('RGBA'); rgba.putalpha(alpha)
art = rgba.crop((x0, y0, x1, y1))
side = max(art.size)
sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
sq.paste(art, ((side - art.width) // 2, (side - art.height) // 2))
sq.save('brand/logo-app-khung-trong-suot.png')

def fit(img, size, scale=1.0, bg=None):
    canvas = Image.new('RGBA', (size, size), bg if bg else (0, 0, 0, 0))
    s = round(size * scale)
    im = img.resize((s, s), Image.LANCZOS)
    canvas.alpha_composite(im, ((size - s) // 2, (size - s) // 2))
    return canvas

# 1) Biểu tượng thường (máy tính, Android kiểu cũ): góc trong suốt
fit(sq, 512).save('public/icon-512.png'); fit(sq, 192).save('public/icon-192.png')

# 2) iPhone: không hỗ trợ trong suốt → nền trắng, iOS tự bo góc; khung thu 88% để không bị cắt
fit(sq, 180, 0.88, (255, 255, 255, 255)).convert('RGB').save('public/apple-touch-icon.png')

# 3) Android kiểu mới (maskable): hệ điều hành tự cắt hình → nền trắng tràn viền, chỉ logo + chữ trong vùng an toàn
cx0, cx1, cy0, cy1 = x0 + 170, x1 - 170, y0 + 170, y1 - 170                # phần trong khung, bỏ cả quầng sáng sát khung
sub = a[cy0:cy1, cx0:cx1]
ink = sub.min(axis=2) < 150                                                # chỉ nét đậm của logo và chữ
iy, ix = np.where(ink)
pad = 14
bx0, bx1, by0, by1 = ix.min() + cx0 - pad, ix.max() + 1 + cx0 + pad, iy.min() + cy0 - pad, iy.max() + 1 + cy0 + pad
print('logo+chu:', bx0, by0, bx1, by1)
content = src.crop((bx0, by0, bx1, by1)).convert('RGBA')
diag = (content.width ** 2 + content.height ** 2) ** 0.5
k = (0.80 * 512) / diag * 0.97                                             # nằm trong vòng tròn an toàn 80%
cw, ch = round(content.width * k), round(content.height * k)
mk = Image.new('RGBA', (512, 512), (255, 255, 255, 255))
mk.alpha_composite(content.resize((cw, ch), Image.LANCZOS), ((512 - cw) // 2, (512 - ch) // 2))
mk.convert('RGB').save('public/icon-maskable-512.png')
print('maskable noi dung', cw, ch)

# Ảnh xem trước: trên nền hình nền tối và nền sáng, + iPhone bo góc, + Android hình tròn
def rounded(img, radius_ratio):
    m = Image.new('L', img.size, 0)
    from PIL import ImageDraw
    ImageDraw.Draw(m).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=int(img.width * radius_ratio), fill=255)
    out = img.convert('RGBA'); out.putalpha(m); return out
def circle(img):
    from PIL import ImageDraw
    m = Image.new('L', img.size, 0); ImageDraw.Draw(m).ellipse((0, 0, img.width - 1, img.height - 1), fill=255)
    out = img.convert('RGBA'); out.putalpha(m); return out
pv = Image.new('RGB', (1500, 430), (255, 255, 255))
from PIL import ImageDraw
d = ImageDraw.Draw(pv)
d.rectangle((0, 0, 749, 429), fill=(28, 40, 78)); d.rectangle((750, 0, 1499, 429), fill=(232, 236, 244))
i512 = Image.open('public/icon-512.png'); ios = Image.open('public/apple-touch-icon.png').resize((256, 256), Image.LANCZOS); mkp = Image.open('public/icon-maskable-512.png').resize((256, 256), Image.LANCZOS)
for bx in (0, 750):
    pv.paste(i512.resize((256, 256), Image.LANCZOS), (bx + 20, 40), i512.resize((256, 256), Image.LANCZOS))
    pv.paste(i512.resize((48, 48), Image.LANCZOS), (bx + 20, 330), i512.resize((48, 48), Image.LANCZOS))
    pv.paste(i512.resize((32, 32), Image.LANCZOS), (bx + 90, 338), i512.resize((32, 32), Image.LANCZOS))
    r = rounded(ios, 0.2237); pv.paste(r, (bx + 300, 40), r)
    c = circle(mkp); c2 = c.resize((150, 150), Image.LANCZOS); pv.paste(c2, (bx + 580, 40), c2)
    q = rounded(mkp, 0.30).resize((150, 150), Image.LANCZOS); pv.paste(q, (bx + 580, 210), q)
pv.save('/tmp/xem-truoc-bieu-tuong.png')
