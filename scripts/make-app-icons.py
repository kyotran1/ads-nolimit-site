# Tạo bộ biểu tượng app từ logo nền chuyển màu Chủ tịch gửi 24/11/2026 (bản 2).
# Chạy từ gốc dự án web: python3 scripts/make-app-icons.py   (SRC/OUT đổi được bằng biến môi trường)
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = os.environ.get('SRC', 'brand/logo-app-gradient-goc.png')
PUB = os.environ.get('PUB', 'public')
BRAND = os.environ.get('BRAND', 'brand')
PREVIEW = os.environ.get('PREVIEW', '/tmp/xem-truoc-bieu-tuong.png')

Image.MAX_IMAGE_PIXELS = None
src = Image.open(SRC).convert('RGB')
W, H = src.size
a = np.asarray(src).astype(np.int32)

# --- Đo khung: vòng trắng là mốc chắc nhất; nét xanh đậm ngoài cùng dày T, bo góc tròn bán kính R ---
white = a.min(axis=2) > 232
ys, xs = np.where(white)
wx0, wx1, wy0, wy1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
cx, cy = (wx0 + wx1) // 2, (wy0 + wy1) // 2

def stroke_out(line):                                   # số điểm ảnh nét xanh tính từ mép vòng trắng ra ngoài
    n = 0; lead = 0
    for r, g, b in line:
        is_stroke = r < 45 and g < 45 and b > 80         # xanh sáng rồi xanh đậm; nền tím ngoài khung có r ≈ 60
        if is_stroke: n += 1
        elif n == 0 and lead < 24: lead += 1             # vài điểm chuyển tiếp sáng màu sát vòng trắng
        else: break
    return n + lead

T = int(np.median([stroke_out(a[wy0 - 1::-1, cx][:400]), stroke_out(a[wy1:, cx][:400]),
                   stroke_out(a[cy, wx0 - 1::-1][:400]), stroke_out(a[cy, wx1:][:400])]))
d = 30
xl = np.where(white[wy0 + d])[0].min() - wx0             # tại độ sâu d dưới mép trên, vòng trắng bắt đầu ở xl
rw = (xl * xl + d * d) / (2 * (xl - d)) if xl > d else 0  # bán kính cung tròn của mép ngoài vòng trắng (giải từ hình học)
# giải chính xác: xl = r - sqrt(2rd - d^2)
lo, hi = 10.0, 5000.0
for _ in range(60):
    mid = (lo + hi) / 2
    val = mid - (2 * mid * d - d * d) ** 0.5
    if val < xl: lo = mid
    else: hi = mid
rw = (lo + hi) / 2
fx0, fy0, fx1, fy1 = wx0 - T, wy0 - T, wx1 + T, wy1 + T
R = rw + T
side = max(fx1 - fx0, fy1 - fy0)
print(f'anh {W}x{H}; khung ngoai ({fx0},{fy0})-({fx1},{fy1}) canh {side}; net {T}; ban kinh {R:.0f} ({R / side:.3f})')

# --- Bản gốc làm việc 2048px: khung bo góc, ngoài khung trong suốt, mép khử răng cưa ---
M = 2048
fcx, fcy = (fx0 + fx1) / 2, (fy0 + fy1) / 2
box = (round(fcx - side / 2), round(fcy - side / 2), round(fcx + side / 2), round(fcy + side / 2))
tile_rgb = src.crop(box).resize((M, M), Image.LANCZOS)
mask_big = Image.new('L', (M * 4, M * 4), 0)
ImageDraw.Draw(mask_big).rounded_rectangle((4, 4, M * 4 - 5, M * 4 - 5), radius=round(R / side * M * 4), fill=255)
mask = mask_big.resize((M, M), Image.LANCZOS)
tile = tile_rgb.convert('RGBA'); tile.putalpha(mask)
tile.save(os.path.join(BRAND, 'logo-app-khung-trong-suot.png'))

def sharp(img):                                          # làm nét nhẹ sau khi thu nhỏ (chỉ kênh màu, giữ nguyên độ trong suốt)
    if img.mode == 'RGBA':
        r, g, b, al = img.split()
        rgb = Image.merge('RGB', (r, g, b)).filter(ImageFilter.UnsharpMask(radius=1.0, percent=70, threshold=2))
        out = rgb.convert('RGBA'); out.putalpha(al); return out
    return img.filter(ImageFilter.UnsharpMask(radius=1.0, percent=70, threshold=2))

def tile_at(size):
    return sharp(tile.resize((size, size), Image.LANCZOS))

# 1) Máy tính / Android kiểu cũ / thẻ trình duyệt: khung bo góc, góc ngoài trong suốt
tile_at(512).save(os.path.join(PUB, 'icon-512.png'))
tile_at(192).save(os.path.join(PUB, 'icon-192.png'))
tile_at(32).save(os.path.join(PUB, 'favicon-32.png')); tile_at(16).save(os.path.join(PUB, 'favicon-16.png'))
tile_at(32).save(os.path.join(BRAND, 'favicon-32.png'))
tile_at(256).save(os.path.join(PUB, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])

# 2) iPhone: không hỗ trợ trong suốt và tự bo góc → cắt ảnh gốc (nền chuyển màu tràn viền), khung chiếm ~89%
k_ios = 0.892
cs = side / k_ios
ib = (round(fcx - cs / 2), round(fcy - cs / 2), round(fcx + cs / 2), round(fcy + cs / 2))
assert ib[0] >= 0 and ib[1] >= 0 and ib[2] <= W and ib[3] <= H, ib
sharp(src.crop(ib).resize((180, 180), Image.LANCZOS)).save(os.path.join(PUB, 'apple-touch-icon.png'))

# 3) Android kiểu mới (maskable): máy tự cắt tròn / vuông bo → nền chuyển màu tràn viền, cả khung thu vừa vòng an toàn 80%
#    Nền: dải màu chéo của ảnh gốc (lấy từ phần ngoài khung), kéo cho phủ kín ô.
ds = 8
small = np.asarray(src.resize((W // ds, H // ds), Image.BOX)).astype(np.float64)
hh, ww, _ = small.shape
yy, xx = np.mgrid[0:hh, 0:ww]
outside = (xx < fx0 / ds - 6) | (xx > fx1 / ds + 6) | (yy < fy0 / ds - 6) | (yy > fy1 / ds + 6)
u, v = xx / (ww - 1), 1 - yy / (hh - 1)
best = None
for deg in range(20, 71, 2):                             # tìm hướng chéo của dải màu
    th = np.deg2rad(deg)
    t = u * np.cos(th) + v * np.sin(th); t = (t - t.min()) / (t.max() - t.min())
    bins = np.clip((t[outside] * 63).astype(int), 0, 63)
    px = small[outside]
    err = 0.0
    for bi in range(64):
        sel = px[bins == bi]
        if len(sel) > 3: err += ((sel - sel.mean(axis=0)) ** 2).sum()
    if best is None or err < best[0]: best = (err, deg)
deg = best[1]; th = np.deg2rad(deg)
t = u * np.cos(th) + v * np.sin(th); tmin, tmax = t.min(), t.max(); t = (t - tmin) / (tmax - tmin)
NB = 96
bins = np.clip((t[outside] * (NB - 1)).astype(int), 0, NB - 1); px = small[outside]
lut = np.full((NB, 3), np.nan)
for bi in range(NB):
    sel = px[bins == bi]
    if len(sel) > 3: lut[bi] = np.median(sel, axis=0)
idx = np.arange(NB)
for c in range(3):
    ok = ~np.isnan(lut[:, c]); lut[:, c] = np.interp(idx, idx[ok], lut[ok, c])
    lut[:, c] = np.convolve(np.pad(lut[:, c], 3, mode='edge'), np.ones(7) / 7, mode='valid')
print('huong dai mau', deg, 'do; mau dau/cuoi', lut[0].round(), lut[-1].round())

def gradient(size):
    y2, x2 = np.mgrid[0:size, 0:size]
    uu, vv = x2 / (size - 1), 1 - y2 / (size - 1)
    tt = np.clip(((uu * np.cos(th) + vv * np.sin(th)) - tmin) / (tmax - tmin), 0, 1) * (NB - 1)
    i0 = np.floor(tt).astype(int); i1 = np.minimum(i0 + 1, NB - 1); f = (tt - i0)[..., None]
    return Image.fromarray(np.clip(lut[i0] * (1 - f) + lut[i1] * f, 0, 255).astype('uint8'), 'RGB')

rr = R / side
far = (0.5 - rr) * 2 ** 0.5 + rr                         # điểm xa tâm nhất của khung, tính theo cạnh khung
k_mask = 0.40 / far * 0.97
ms = round(512 * k_mask)
mk = gradient(512).convert('RGBA')
tm = tile_at(ms)
mk.alpha_composite(tm, ((512 - ms) // 2, (512 - ms) // 2))
mk.convert('RGB').save(os.path.join(PUB, 'icon-maskable-512.png'))
print('khung tren maskable', round(k_mask, 3))

# --- Ảnh xem trước ---
def rounded(img, ratio):
    m = Image.new('L', (img.width * 4, img.height * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, m.width - 1, m.height - 1), radius=int(m.width * ratio), fill=255)
    out = img.convert('RGBA'); out.putalpha(m.resize(img.size, Image.LANCZOS)); return out
def circle(img):
    m = Image.new('L', (img.width * 4, img.height * 4), 0); ImageDraw.Draw(m).ellipse((0, 0, m.width - 1, m.height - 1), fill=255)
    out = img.convert('RGBA'); out.putalpha(m.resize(img.size, Image.LANCZOS)); return out
pv = Image.new('RGB', (1500, 430), (255, 255, 255)); dr = ImageDraw.Draw(pv)
dr.rectangle((0, 0, 749, 429), fill=(28, 40, 78)); dr.rectangle((750, 0, 1499, 429), fill=(232, 236, 244))
i512 = Image.open(os.path.join(PUB, 'icon-512.png'))
ios = Image.open(os.path.join(PUB, 'apple-touch-icon.png'))
ios_big = sharp(src.crop(ib).resize((256, 256), Image.LANCZOS))
mkp = Image.open(os.path.join(PUB, 'icon-maskable-512.png')).resize((300, 300), Image.LANCZOS)
ico = Image.open(os.path.join(PUB, 'favicon.ico'))
for bx in (0, 750):
    big = tile_at(256); pv.paste(big, (bx + 20, 40), big)
    for sz, px_ in ((48, 20), (32, 90), (16, 140)):
        s_ = tile_at(sz); pv.paste(s_, (bx + px_, 340), s_)
    r_ = rounded(ios_big, 0.2237); pv.paste(r_, (bx + 300, 40), r_)
    c_ = circle(mkp).resize((150, 150), Image.LANCZOS); pv.paste(c_, (bx + 580, 40), c_)
    q_ = rounded(mkp, 0.30).resize((150, 150), Image.LANCZOS); pv.paste(q_, (bx + 580, 210), q_)
pv.save(PREVIEW)
