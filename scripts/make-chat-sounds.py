"""Tổng hợp bộ âm thanh cho khung chat minh họa ADS-Nolimit (tự tạo, không bản quyền bên thứ ba).

send    : tiếng "vút" mềm + pop nhẹ khi khách gửi tin
typing  : tiếng gõ phím rất nhẹ khi AI đang soạn (~1.6 s)
receive : chuông 2 nốt kiểu marimba khi AI trả lời
notify  : arpeggio 3 nốt sáng kiểu chuông thủy tinh khi có thông báo hệ thống

Cách tạo lại (cần numpy, scipy, ffmpeg):
  python3 scripts/make-chat-sounds.py /tmp/wav
  for f in send typing receive notify; do
    ffmpeg -y -i /tmp/wav/$f.wav -ac 1 -ar 44100 -c:a libmp3lame -q:a 4 public/sounds/chat-$f.mp3
  done
"""
import sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 48000
rng = np.random.default_rng(2610)
out_dir = sys.argv[1]


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def env_ad(n, attack, decay_tau):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    a = a * a * (3 - 2 * a)  # smoothstep attack
    d = np.exp(-np.maximum(t - attack, 0) / decay_tau)
    return a * d


def bp(x, lo, hi, order=2):
    sos = butter(order, [lo, hi], btype='band', fs=SR, output='sos')
    return sosfilt(sos, x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype='low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype='high', fs=SR, output='sos'), x)


def reverb(x, wet=0.18, length=0.9, damp=5500):
    """Phòng nhỏ, sáng: IR là nhiễu suy giảm mũ, lọc thấp; trộn khô/ướt."""
    n = int(SR * length)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t / (length / 6.5))
    ir = lp(ir, damp)
    ir[: int(SR * 0.012)] = 0  # pre-delay 12 ms
    ir /= np.sqrt(np.sum(ir ** 2))
    y = fftconvolve(x, ir)
    y = np.pad(y, (0, len(x) + n - len(y)))[: len(x) + n]
    dry = np.concatenate([x, np.zeros(n)])
    return (1 - wet) * dry + wet * y


def fade_tail(x, sec=0.05):
    n = int(SR * sec)
    x = x.copy()
    x[-n:] *= np.linspace(1, 0, n) ** 2
    return x


def trim(x, thresh_db=-62):
    th = 10 ** (thresh_db / 20) * np.max(np.abs(x))
    idx = np.where(np.abs(x) > th)[0]
    return x[: idx[-1] + int(SR * 0.02)] if len(idx) else x


def normalize(x, peak_db):
    return x / np.max(np.abs(x)) * 10 ** (peak_db / 20)


def tone(freq, sec, partials, decay_tau, attack=0.002, detune_cents=0.0):
    """Nốt có các họa âm (tỉ lệ, biên độ, hệ số tắt nhanh hơn)."""
    t = t_axis(sec)
    y = np.zeros_like(t)
    for ratio, amp, dk in partials:
        f = freq * ratio * 2 ** (detune_cents / 1200)
        y += amp * np.sin(2 * np.pi * f * t) * np.exp(-t / (decay_tau / dk))
    y = y * env_ad(len(t), attack, 10.0)
    # tắt dần mượt ở 35% cuối để không có tiếng "tách" khi nốt kết thúc
    k = int(len(y) * 0.35)
    y[-k:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, k)))
    return y


def place(dst, src, at_sec, gain=1.0):
    i = int(at_sec * SR)
    end = min(len(dst), i + len(src))
    dst[i:end] += gain * src[: end - i]


# ---------- send ----------
def make_send():
    dur = 0.42
    n = int(SR * dur)
    t = np.arange(n) / SR
    # vút: nhiễu qua bộ lọc band quét lên 700 -> 3600 Hz
    noise = rng.standard_normal(n)
    y_whoosh = np.zeros(n)
    seg = int(SR * 0.006)
    for s in range(0, n, seg):
        prog = min(1.0, s / (SR * 0.16))
        c = 700 * (3600 / 700) ** prog
        blk = noise[max(0, s - 512): s + seg]
        f = bp(blk, c * 0.7, min(c * 1.4, SR / 2 - 100))
        y_whoosh[s: s + seg] = f[-len(noise[s: s + seg]):]
    y_whoosh *= env_ad(n, 0.07, 0.05) * 0.55
    # pop: sine trượt 480 -> 920 Hz
    f_inst = 480 + (920 - 480) * (1 - np.exp(-t / 0.035))
    phase = 2 * np.pi * np.cumsum(f_inst) / SR
    pop = np.sin(phase) * env_ad(n, 0.004, 0.06)
    pop_d = np.zeros(n)
    place(pop_d, pop, 0.085)
    y = y_whoosh + 0.9 * pop_d
    y = hp(y, 180)
    y = reverb(y, wet=0.12, length=0.5)
    return normalize(fade_tail(trim(y)), -9.0)


# ---------- receive ----------
MARIMBA = [(1.0, 1.0, 1.0), (3.98, 0.2, 3.6), (9.9, 0.035, 7.0), (2.0, 0.08, 1.6)]


def make_receive():
    dur = 1.6
    y = np.zeros(int(SR * dur))
    # G5 -> C6 (quãng 4 đi lên, cảm giác "có tin mới" dễ chịu)
    n1 = tone(783.99, 1.1, MARIMBA, decay_tau=0.32, attack=0.0025)
    n2 = tone(1046.5, 1.3, MARIMBA, decay_tau=0.42, attack=0.0025)
    # lớp đệm nhẹ một quãng tám dưới cho dày tiếng
    n2b = tone(523.25, 1.3, [(1.0, 1.0, 1.0)], decay_tau=0.35, attack=0.006)
    place(y, n1, 0.0, 0.85)
    place(y, n2, 0.105, 1.0)
    place(y, n2b, 0.105, 0.22)
    y = hp(y, 220)
    y = reverb(y, wet=0.2, length=1.0)
    return normalize(fade_tail(trim(y)), -7.5)


# ---------- notify ----------
BELL = [(1.0, 1.0, 1.0), (2.756, 0.32, 1.9), (5.404, 0.12, 3.2), (8.933, 0.04, 5.0)]


def make_notify():
    dur = 2.0
    y = np.zeros(int(SR * dur))
    notes = [1046.5, 1318.5, 1568.0]  # C6 E6 G6
    for i, f in enumerate(notes):
        nb = tone(f, 1.6, BELL, decay_tau=0.38 + i * 0.12, attack=0.0015, detune_cents=(i - 1) * 2)
        place(y, nb, i * 0.072, [0.8, 0.85, 1.0][i])
    # "lấp lánh" rất nhẹ ở trên cùng
    shimmer = tone(3136.0, 0.9, [(1.0, 1.0, 1.0)], decay_tau=0.18, attack=0.003)
    place(y, shimmer, 0.15, 0.12)
    y = hp(y, 300)
    y = lp(y, 9000)
    y = reverb(y, wet=0.24, length=1.2)
    return normalize(fade_tail(trim(y)), -12.5)


# ---------- typing ----------
def click():
    n = int(SR * 0.03)
    t = np.arange(n) / SR
    burst = rng.standard_normal(n) * np.exp(-t / 0.0028)
    body = bp(burst, 1800, 5200)
    thump = np.sin(2 * np.pi * rng.uniform(170, 230) * t) * np.exp(-t / 0.006) * 0.35
    return body + thump


def make_typing():
    dur = 1.7
    y = np.zeros(int(SR * dur))
    at = 0.03
    while at < dur - 0.08:
        place(y, click(), at, rng.uniform(0.45, 1.0))
        at += rng.uniform(0.075, 0.15)
        if rng.random() < 0.12:
            at += rng.uniform(0.12, 0.22)  # ngừng ngắn giữa các từ
    y = lp(y, 7000)
    y = reverb(y, wet=0.08, length=0.3)
    y = y[: int(SR * dur)]
    return normalize(fade_tail(y, 0.08), -13.0)


for name, fn in [('send', make_send), ('receive', make_receive), ('notify', make_notify), ('typing', make_typing)]:
    x = fn().astype(np.float32)
    wavfile.write(f'{out_dir}/{name}.wav', SR, x)
    print(name, f'{len(x) / SR:.2f}s', f'peak {20 * np.log10(np.max(np.abs(x))):.1f} dBFS')
