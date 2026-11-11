"""
音效合成 + 混音（numpy 程序化合成，不用任何版权素材）

  node tools/sfx_cues.mjs                       # 先把 src/config/sfx.js 导成 out/sfx/cues.json
  uv run --with numpy --with scipy python tools/sfx_render.py            # 合成 + 混音
  uv run ... tools/sfx_render.py --only gun,tape                          # 只重做某几种音色

产出：
  audio/sfx/<id>.wav      每个音效单独一份（听、复用、给后期）
  dist/sfx.mp3            音效床（76.81s，与片子 1:1，已按旁白压音）
  dist/mix.mp3            口播 + 音效（成片直接可用）
  out/sfx/report.json     每次合成的实测数值（给 check_sfx.mjs 用）
"""
import argparse
import json
import pathlib
import subprocess
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
CUES = ROOT / 'out' / 'sfx' / 'cues.json'
SFXDIR = ROOT / 'audio' / 'sfx'
OUT = ROOT / 'out' / 'sfx'
DIST = ROOT / 'dist'
SR = 44100
rng = np.random.default_rng(20261103)          # 固定种子 ⇒ 每次合成完全一致（可复现）


# ────────────────────────────────────────────── 基础工具
def t_axis(n):
    return np.arange(n) / SR


def noise(n, seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    return r.standard_normal(n)


def pink(n, seed=None):
    """白噪 → 粉噪（-3dB/oct）：频域按 1/sqrt(f) 加权。"""
    x = noise(n, seed)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X[1:] /= np.sqrt(f[1:])
    X[0] = 0
    y = np.fft.irfft(X, n)
    return y / (np.abs(y).max() + 1e-9)


def filt(x, kind, lo, hi=None, order=3):
    nyq = SR / 2
    if kind == 'lp':
        sos = signal.butter(order, lo / nyq, 'low', output='sos')
    elif kind == 'hp':
        sos = signal.butter(order, lo / nyq, 'high', output='sos')
    else:
        sos = signal.butter(order, [lo / nyq, hi / nyq], 'band', output='sos')
    return signal.sosfilt(sos, x)


def sweep_bp(x, f0, f1, width_oct=0.7, nperseg=1024):
    """时变带通：STFT 上按时间移动的频带遮罩（做 whoosh / riser 最省事）。"""
    f, tt, Z = signal.stft(x, SR, nperseg=nperseg, noverlap=nperseg * 3 // 4)
    nfr = Z.shape[1]
    u = np.linspace(0, 1, nfr)
    fc = f0 * (f1 / f0) ** u
    g = np.exp(-0.5 * ((np.log2(np.maximum(f, 1))[:, None] - np.log2(fc)[None, :]) / width_oct) ** 2)
    _, y = signal.istft(Z * g, SR, nperseg=nperseg, noverlap=nperseg * 3 // 4)
    return y[:len(x)]


def env_ad(n, attack, decay, curve=3.0):
    a = max(1, int(attack * SR))
    d = max(1, n - a)
    e = np.concatenate([np.linspace(0, 1, a), np.exp(-curve * np.linspace(0, 1, d))])
    return e[:n]


def env_hann(n, pad=0.12):
    e = np.hanning(n)
    p = max(1, int(n * pad))
    e[:p] = np.linspace(0, 1, p) ** 1.5
    e[-p:] = np.linspace(1, 0, p) ** 1.5
    return e


def bell(freq, dur, amps=((1, 1.0), (2.76, 0.36), (5.40, 0.14), (8.93, 0.05)), decay=5.5):
    n = int(dur * SR)
    t = t_axis(n)
    y = np.zeros(n)
    for ratio, amp in amps:
        y += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-decay * ratio ** 0.35 * t / dur * 4)
    return y / (np.abs(y).max() + 1e-9)


def pan2(x, p=0.0):
    """等功率声像：p ∈ [-1, 1]"""
    th = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(th), x * np.sin(th)], 1)


def plate(x, tail=0.35, wet=0.22, seed=7):
    """极简混响：单条衰减噪声当脉冲响应做卷积，够用即可（不加湿度太重）。"""
    x = np.asarray(x, dtype=float)
    n = int(tail * SR)
    ir = noise(n, seed) * np.exp(-4.5 * t_axis(n) / tail)
    ir[:int(0.004 * SR)] = 0
    ir = filt(ir, 'lp', 5200)
    L = len(x) + max(0, n - 1)
    buf = np.zeros((L, 2))
    buf[:len(x)] += x if x.ndim == 2 else np.stack([x, x], 1)
    if x.ndim == 2:
        wl = np.convolve(x[:, 0], ir)
        wr = np.convolve(x[:, 1], ir)
        w = np.stack([wl, wr], 1)
    else:
        w = np.stack([np.convolve(x, ir)] * 2, 1)
    w = w[:L]
    w *= (np.abs(x).max() + 1e-9) / (np.abs(w).max() + 1e-9)
    return buf + wet * w


# ────────────────────────────────────────────── 各音色
def sfx_boot(dur=2.0):
    n = int(dur * SR)
    t = t_axis(n)
    low = np.sin(2 * np.pi * (38 + 6 * np.exp(-2 * t)) * t) * np.exp(-1.2 * t)
    rum = filt(noise(n, 11), 'lp', 90) * np.exp(-1.0 * t) * 2.2
    y = 0.7 * low + 0.5 * rum
    for i, dt in enumerate((0.06, 0.42, 0.78, 1.12)):
        b = bell(1180 + i * 120, 0.16)
        s = int(dt * SR)
        e = min(len(y), s + len(b))
        y[s:e] += 0.22 * b[:e - s]
    return y * env_hann(n, 0.05)


def sfx_reveal(dur=2.4):
    n = int(dur * SR)
    sw = sweep_bp(noise(n, 12), 420, 5200, 0.9)
    sw = sw / (np.abs(sw).max() + 1e-9) * env_ad(n, 0.35, 0.9, 2.2)
    y = 0.8 * sw
    for i, (f, dt) in enumerate(((1250, 0.18), (1660, 0.34), (2100, 0.50))):
        b = bell(f, 0.9, decay=4.0)
        s = int(dt * SR)
        e = min(len(y), s + len(b))
        y[s:e] += 0.30 * b[:e - s]
    return y


def sfx_crowd(dur=5.0, bright=1.0):
    n = int(dur * SR)
    a = pink(n, 21)
    b = pink(n, 22)
    lo, hi = (300, 2800) if bright <= 1 else (420, 4200)
    a = filt(a, 'bp', lo, hi)
    b = filt(b, 'bp', lo, hi)
    # 人群起伏：慢速随机包络（2 个 LFO + 抖动）
    tt = t_axis(n)
    k = max(4, int(dur * 3))
    pts = rng.uniform(0.55, 1.0, k)
    mod = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, k), pts)
    mod *= 1 + 0.12 * np.sin(2 * np.pi * 3.1 * tt) + 0.08 * np.sin(2 * np.pi * 5.7 * tt + 1.1)
    y = np.stack([a, b], 1) * mod[:, None]
    return y / (np.abs(y).max() + 1e-9) * env_hann(n, 0.22)[:, None]


def sfx_cheer(dur=3.0):
    """欢呼：人群底 + 两三声"哇"，整体快速起、慢慢落。"""
    n = int(dur * SR)
    base = sfx_crowd(dur, bright=1.3)
    tt = t_axis(n)
    whoop = np.zeros(n)
    for dt, f0, f1 in ((0.16, 620, 980), (0.62, 700, 1060), (1.18, 560, 900)):
        ln = n
        ph = 2 * np.pi * np.cumsum(np.linspace(f0, f1, ln)) / SR
        whoop += np.exp(-((tt - dt) ** 2) / (2 * 0.18 ** 2)) * np.sin(ph)
    whoop = whoop / (np.abs(whoop).max() + 1e-9)
    y = base + np.stack([0.30 * whoop, 0.24 * whoop], 1)
    y *= np.exp(-0.9 * tt)[:, None]
    return y / (np.abs(y).max() + 1e-9)


def sfx_gun(dur=1.4):
    n = int(dur * SR)
    t = t_axis(n)
    click = np.zeros(n)
    click[:int(0.002 * SR)] = 1.0
    burst = noise(n, 31) * np.exp(-70 * t)
    body = filt(burst, 'bp', 240, 5200)
    thump = np.sin(2 * np.pi * np.cumsum(np.linspace(135, 42, n)) / SR) * np.exp(-9 * t)
    tail = filt(noise(n, 32), 'lp', 1100) * np.exp(-3.2 * t) * 0.35
    y = 0.55 * click + 0.9 * body / (np.abs(body).max() + 1e-9) + 0.85 * thump + tail
    return plate(y * 0.9, tail=0.5, wet=0.18)


def sfx_card(dur=0.9):
    """地标图卡出场：一记轻脆的"卡" + 尾巴里两点很轻的亮片（认出是"解锁"而不是 UI 噪音）。"""
    n = int(dur * SR)
    t = t_axis(n)
    tok = filt(noise(n, 41), 'bp', 620, 1750) * np.exp(-58 * t)
    tok = tok / (np.abs(tok).max() + 1e-9)
    body = np.zeros(n)
    for f, a, dt in ((1180, 0.55, 0.0), (1570, 0.30, 0.02), (2093, 0.16, 0.05)):
        b = bell(f, 0.7, decay=4.2)
        s0 = int(dt * SR)
        e0 = min(n, s0 + len(b))
        body[s0:e0] += a * b[:e0 - s0]
    spark = np.zeros(n)
    for f, dt in ((2350, 0.20), (3136, 0.30)):
        b = bell(f, 0.28, decay=7.0) * 0.18
        s0 = int(dt * SR)
        e0 = min(n, s0 + len(b))
        spark[s0:e0] += b[:e0 - s0]
    y = 0.6 * tok * np.exp(-46 * t) + 0.85 * body + spark
    return y / (np.abs(y).max() + 1e-9) * 0.92


def sfx_rumble(dur=3.4):
    n = int(dur * SR)
    t = t_axis(n)
    env = np.interp(t, [0, dur * 0.35, dur * 0.8, dur], [0, 1, 0.75, 0])
    low = np.sin(2 * np.pi * np.cumsum(np.linspace(27, 41, n)) / SR)
    rum = filt(noise(n, 51), 'lp', 105)
    rum = rum / (np.abs(rum).max() + 1e-9)
    rum2 = filt(noise(n, 52), 'lp', 60)
    rum2 = rum2 / (np.abs(rum2).max() + 1e-9)
    y = (0.55 * low + 0.75 * rum + 0.5 * rum2) * env
    return y


def sfx_wind(dur=6.0):
    n = int(dur * SR)
    t = t_axis(n)
    a = filt(pink(n, 61), 'bp', 320, 2600)
    b = filt(pink(n, 62), 'bp', 320, 2600)
    lfo = 0.72 + 0.28 * np.sin(2 * np.pi * 0.23 * t + 0.7) + 0.12 * np.sin(2 * np.pi * 0.61 * t)
    y = np.stack([a * lfo, b * (1.04 - 0.9 * (lfo - 0.72))], 1)
    return y / (np.abs(y).max() + 1e-9) * env_hann(n, 0.28)[:, None]


def sfx_ding(dur=2.2):
    y = bell(1568, dur, decay=3.2) * 0.9
    b2 = bell(2093, dur * 0.7, decay=4.0)
    s = int(0.07 * SR)
    e = min(len(y), s + len(b2))
    y[s:e] += 0.35 * b2[:e - s]
    return plate(y, tail=0.6, wet=0.25)


def sfx_whoosh(dur=1.5, f0=3200, f1=320):
    n = int(dur * SR)
    sw = sweep_bp(noise(n, 71), f0, f1, 0.85)
    sw = sw / (np.abs(sw).max() + 1e-9) * env_hann(n, 0.2)
    return sw


def sfx_traffic(dur=3.4):
    n = int(dur * SR)
    a = filt(pink(n, 81), 'lp', 420)
    b = filt(pink(n, 82), 'lp', 420)
    t = t_axis(n)
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * 0.37 * t + 0.4)
    y = np.stack([a * lfo, b * lfo], 1)
    return y / (np.abs(y).max() + 1e-9) * env_hann(n, 0.3)[:, None]


def sfx_leaves(dur=3.0):
    n = int(dur * SR)
    x = filt(pink(n, 91), 'bp', 1900, 7200)
    # 颗粒化：随机小包络叠加，像踩在落叶上
    g = np.zeros(n)
    for _ in range(int(dur * 26)):
        s = int(rng.uniform(0, dur - 0.05) * SR)
        ln = int(rng.uniform(0.02, 0.07) * SR)
        w = np.hanning(ln) * rng.uniform(0.4, 1.0)
        g[s:s + ln] += w[:max(0, min(ln, n - s))]
    y = x * g * env_hann(n, 0.2)
    return pan2(y / (np.abs(y).max() + 1e-9), 0.2)


def sfx_birds(dur=3.2):
    n = int(dur * SR)
    y = np.zeros(n)
    for _ in range(int(dur * 2.2)):
        dt = rng.uniform(0, dur - 0.2)
        ln = int(rng.uniform(0.05, 0.13) * SR)
        f0 = rng.uniform(2100, 2900)
        f1 = f0 + rng.uniform(600, 1500)
        t = t_axis(ln)
        ph = 2 * np.pi * np.cumsum(np.linspace(f0, f1, ln)) / SR
        ph += 0.4 * np.sin(2 * np.pi * 32 * t)
        w = np.sin(ph) * np.hanning(ln) * rng.uniform(0.3, 0.7)
        s = int(dt * SR)
        y[s:s + ln] += w[:max(0, min(ln, n - s))]
    return pan2(y, 0.25) / (np.abs(y).max() + 1e-9)


def sfx_breath(dur=2.4):
    n = int(dur * SR)
    x = filt(pink(n, 101), 'bp', 380, 1700)
    t = t_axis(n)
    env = np.zeros(n)
    for c in (0.15, 0.85, 1.55):                      # 三次呼吸
        env += np.exp(-((t - c) ** 2) / (2 * 0.16 ** 2))
    y = x * env
    return pan2(y, -0.1) / (np.abs(y).max() + 1e-9)


def sfx_uturn(dur=1.2):
    n = int(dur * SR)
    sw = sweep_bp(noise(n, 111), 2200, 420, 0.8)
    sw = sw / (np.abs(sw).max() + 1e-9)
    e = np.interp(t_axis(n), [0, 0.12, 0.42, dur], [0, 0.75, 1.0, 0])
    scrape = filt(noise(n, 112), 'bp', 1200, 3200) * np.exp(-24 * np.abs(t_axis(n) - 0.42))
    scrape = scrape / (np.abs(scrape).max() + 1e-9)
    thud = np.sin(2 * np.pi * 78 * t_axis(n)) * np.interp(t_axis(n), [0, 0.40, 0.52, 0.9], [0, 0, 1, 0]) * 0.7
    y = 0.9 * sw * e + 0.35 * scrape + 0.5 * thud
    return y


def sfx_fork(dur=1.4):
    """分流：左右各一记 whoosh，错开 70 ms，像“往两边分开”的示意。"""
    n = int(dur * SR)
    a = sfx_whoosh(dur, 900, 3600) * env_hann(n, 0.2)
    b = sfx_whoosh(dur * 0.88, 900, 3600)
    off = int(0.07 * SR)
    bpad = np.zeros(n)
    bpad[off:off + min(len(b), n - off)] = b[:n - off]
    y = np.stack([a + 0.45 * bpad, a * 0.9 + 0.55 * sfx_whoosh(dur * 0.9, 900, 3600)[:n] if len(b) >= n else a * 0.9 + 0.55 * bpad], 1)
    return y / (np.abs(y).max() + 1e-9)


def sfx_split(dur=1.0):
    n = int(dur * SR)
    a = sweep_bp(noise(n, 121), 700, 3200, 0.9)
    a = a / (np.abs(a).max() + 1e-9)
    e = np.interp(t_axis(n), [0, 0.3, 0.55, dur], [0, 1, 0.6, 0])
    y = a * e
    bl = bell(980, 0.35, decay=4)
    y[:len(bl)] += 0.35 * bl
    return y[:n]


def sfx_sparkle(dur=1.6):
    n = int(dur * SR)
    y = np.zeros(n)
    for i in range(9):
        dt = 0.04 + i * rng.uniform(0.05, 0.2)
        f = rng.uniform(1500, 3200)
        b = bell(f, rng.uniform(0.25, 0.5), decay=6.5) * rng.uniform(0.25, 0.6)
        s = int(dt * SR)
        if s >= n:
            break
        y[s:s + len(b)] += b[:max(0, min(len(b), n - s))]
    return y / (np.abs(y).max() + 1e-9)


def sfx_tape(dur=1.1):
    n = int(dur * SR)
    t = t_axis(n)
    snap = filt(noise(n, 131), 'bp', 1500, 6200) * np.exp(-90 * t)
    snap = snap / (np.abs(snap).max() + 1e-9)
    crack = np.sin(2 * np.pi * np.cumsum(np.linspace(780, 190, n)) / SR) * np.exp(-38 * t)
    y = 0.85 * snap + 0.55 * crack
    return plate(y, tail=0.45, wet=0.2)


def sfx_fanfare(dur=2.8):
    """三音上行 + 轻微的铜管泛音；刻意做得柔（不要军号味）。"""
    n = int(dur * SR)
    y = np.zeros(n)
    notes = ((523.25, 0.00), (659.25, 0.26), (783.99, 0.52), (1046.5, 0.82))
    for f, dt in notes:
        ln = int(0.9 * SR)
        t = t_axis(ln)
        saw = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 7))
        e = env_ad(ln, 0.03, 0.85, 2.6)
        w = filt(saw * e, 'lp', 3400)
        s = int(dt * SR)
        e2 = min(n, s + ln)
        y[s:e2] += 0.30 * w[:e2 - s]
    tail = bell(1568, 1.6, decay=3.6) * 0.35
    y[-len(tail):] += tail
    return plate(y, tail=0.5, wet=0.22) / (np.abs(y).max() + 1e-9)


def sfx_end(dur=2.4):
    n = int(dur * SR)
    t = t_axis(n)
    boom = np.sin(2 * np.pi * 62 * t) * np.exp(-3.4 * t)
    sh = bell(1174, dur, decay=3.0) * np.exp(-2.2 * t) * 0.5
    y = 0.75 * boom + sh
    return plate(y, tail=0.7, wet=0.3)


def amb_crowd(dur):
    """起点/终点/舞台：人群底噪，缓慢起伏，两头淡入淡出。"""
    n = int(dur * SR)
    a = filt(pink(n, 301), 'bp', 220, 2400)
    b = filt(pink(n, 302), 'bp', 220, 2400)
    t = t_axis(n)
    mod = (0.78 + 0.14 * np.sin(2 * np.pi * 0.17 * t + 0.3) + 0.08 * np.sin(2 * np.pi * 0.43 * t + 1.7))
    mod *= 1 + 0.05 * rng.standard_normal(n) * 0.2
    y = np.stack([a * mod, b * mod], 1)
    return y / (np.abs(y).max() + 1e-9) * env_hann(n, 0.18)[:, None]


def amb_street(dur):
    """城区：低沉的街道噪声 + 偶发远处车声。"""
    n = int(dur * SR)
    a = filt(pink(n, 311), 'lp', 900)
    b = filt(pink(n, 312), 'lp', 900)
    t = t_axis(n)
    mod = 0.8 + 0.2 * np.sin(2 * np.pi * 0.11 * t)
    pas = np.zeros(n)
    for _ in range(max(1, int(dur / 3.5))):
        c = rng.uniform(0.5, dur - 1.5)
        ln = int(1.6 * SR)
        i0 = int(c * SR)
        j = min(n, i0 + ln)
        sw = filt(pink(ln, 313), 'bp', 300, 1800)[:j - i0]
        e = np.hanning(len(sw)) * rng.uniform(0.25, 0.5)
        pas[i0:j] += sw * e
    y = np.stack([a * mod + pas * 0.5, b * mod + pas * 0.4], 1)
    return y / (np.abs(y).max() + 1e-9) * env_hann(n, 0.22)[:, None]


def amb_wind(dur):
    """桥面：风。低频一点轰鸣 + 高频呼啸。"""
    n = int(dur * SR)
    t = t_axis(n)
    a = filt(pink(n, 321), 'bp', 260, 3000)
    b = filt(pink(n, 322), 'bp', 260, 3000)
    low = filt(pink(n, 323), 'lp', 180)
    lfo = 0.72 + 0.22 * np.sin(2 * np.pi * 0.19 * t + 0.5) + 0.1 * np.sin(2 * np.pi * 0.53 * t)
    y = np.stack([a * lfo + 0.35 * low, b * (0.98 - 0.5 * (lfo - 0.72)) + 0.35 * low], 1)
    return y / (np.abs(y).max() + 1e-9) * env_hann(n, 0.25)[:, None]


def amb_park(dur):
    """林间：树叶摩挲 + 稀疏鸟叫。"""
    n = int(dur * SR)
    t = t_axis(n)
    a = filt(pink(n, 331), 'bp', 1400, 6800)
    b = filt(pink(n, 332), 'bp', 1400, 6800)
    lfo = 0.7 + 0.3 * np.sin(2 * np.pi * 0.13 * t + 1.2)
    y = np.stack([a * lfo, b * (0.9 + 0.2 * np.sin(2 * np.pi * 0.31 * t))], 1)
    y /= (np.abs(y).max() + 1e-9)
    chirps = np.zeros(n)
    for _ in range(max(2, int(dur / 1.6))):
        c = rng.uniform(0.2, max(0.3, dur - 0.4))
        ln = int(rng.uniform(0.05, 0.11) * SR)
        f0 = rng.uniform(2300, 3000)
        ph = 2 * np.pi * np.cumsum(np.linspace(f0, f0 + rng.uniform(500, 1200), ln)) / SR
        w = np.sin(ph) * np.hanning(ln) * rng.uniform(0.18, 0.4)
        i0 = int(c * SR)
        j = min(n, i0 + ln)
        chirps[i0:j] += w[:j - i0]
    return (y * env_hann(n, 0.22)[:, None]) + np.stack([chirps, chirps * 0.8], 1)


def amb_rush(dur):
    """快进段：像风从耳边掠过，略带低频轰鸣，暗示“速度”。"""
    n = int(dur * SR)
    t = t_axis(n)
    a = filt(pink(n, 341), 'bp', 420, 5200)
    b = filt(pink(n, 342), 'bp', 420, 5200)
    low = filt(pink(n, 343), 'lp', 150)
    lfo = 0.62 + 0.3 * np.sin(2 * np.pi * 0.29 * t + 0.2) + 0.12 * np.sin(2 * np.pi * 0.77 * t + 2.1)
    y = np.stack([a * lfo + 0.5 * low, b * lfo + 0.45 * low], 1)
    return y / (np.abs(y).max() + 1e-9) * env_hann(n, 0.2)[:, None]


MAKERS = {
    'boot': lambda d=None: sfx_boot(), 'reveal': lambda d=None: sfx_reveal(),
    'crowd': lambda d=None: sfx_crowd(d or 5.0), 'cheer': lambda d=None: sfx_cheer(d or 3.0),
    'gun': lambda d=None: sfx_gun(), 'card': lambda d=None: sfx_card(),
    'rumble': lambda d=None: sfx_rumble(d or 3.4), 'wind': lambda d=None: sfx_wind(d or 6.0),
    'ding': lambda d=None: sfx_ding(), 'whoosh': lambda d=None: sfx_whoosh(d or 1.5),
    'traffic': lambda d=None: sfx_traffic(d or 3.4), 'leaves': lambda d=None: sfx_leaves(d or 3.0),
    'birds': lambda d=None: sfx_birds(d or 3.2), 'breath': lambda d=None: sfx_breath(d or 2.4),
    'uturn': lambda d=None: sfx_uturn(d or 1.2), 'fork': lambda d=None: sfx_fork(d or 1.4),
    'split': lambda d=None: sfx_split(d or 1.0), 'sparkle': lambda d=None: sfx_sparkle(d or 1.6),
    'tape': lambda d=None: sfx_tape(d or 1.1), 'fanfare': lambda d=None: sfx_fanfare(d or 2.8),
    'end': lambda d=None: sfx_end(d or 2.4),
    'amb_crowd': lambda d=None: amb_crowd(d or 8.0), 'amb_street': lambda d=None: amb_street(d or 6.0),
    'amb_wind': lambda d=None: amb_wind(d or 6.0), 'amb_park': lambda d=None: amb_park(d or 6.0),
    'amb_rush': lambda d=None: amb_rush(d or 8.0),
}


def as_stereo(y):
    if y.ndim == 1:
        return np.stack([y, y], 1)
    return y


def db2lin(db):
    return 10 ** (db / 20)


def edge_fade(y, fin=0.008, fout=0.030):
    """首尾各做一小段淡入淡出：噪声类音效直接切会“啪”一声（爆音）。"""
    y = np.asarray(y, dtype=float).copy()
    n = len(y)
    a = min(int(fin * SR), n // 4)
    b = min(int(fout * SR), n // 4)
    if a > 1:
        y[:a] *= np.linspace(0, 1, a)[:, None] if y.ndim == 2 else np.linspace(0, 1, a)
    if b > 1:
        ramp = np.linspace(1, 0, b)
        y[-b:] *= ramp[:, None] if y.ndim == 2 else ramp
    return y


# ────────────────────────────────────────────── 脚步床
def build_steps(spec, n_total):
    """按 STEPS.sections 铺脚步：每步 = 短噪声（按路面/桥面不同滤波）+ 低频轻击。"""
    y = np.zeros((n_total, 2))
    t0, t1 = spec['t0'], spec['t1']
    count = 0
    for sec in spec['sections']:
        a, b = max(sec['t0'], t0), min(sec['t1'], t1)
        if b <= a:
            continue
        rate = sec['rate']
        g = db2lin(spec['gain'] + sec['gain'])
        tone = sec['tone']
        tcur = a
        while tcur < b:
            i = int(tcur * SR)
            if i >= n_total - 200:
                break
            ln = int(0.085 * SR)
            x = noise(ln, 200 + count)
            if tone == 'deck':
                x = filt(x, 'bp', 120, 520)            # 桥面：闷
            else:
                x = filt(x, 'bp', 240, 1450)           # 路面：脆一点
            x = x / (np.abs(x).max() + 1e-9)
            e = np.exp(-38 * t_axis(ln)) * (1 - np.exp(-900 * t_axis(ln)))
            hit = x * e
            thump = np.sin(2 * np.pi * (tone == 'deck' and 64 or 92) * t_axis(ln)) * np.exp(-46 * t_axis(ln)) * 0.5
            step = (0.85 * hit + thump) * g * rng.uniform(0.82, 1.0)
            p = rng.uniform(-0.18, 0.18)
            st = pan2(step, p)
            e2 = min(n_total, i + ln)
            y[i:e2] += st[:e2 - i]
            count += 1
            tcur += 1.0 / rate
    return y, count


# ────────────────────────────────────────────── 主流程
def render_amb(amb, only=None):
    SFXDIR.mkdir(parents=True, exist_ok=True)
    cache = {}
    for a in amb:
        sid = a['sfx']
        if only and sid not in only:
            continue
        dur = round(a['t1'] - a['t0'], 2)
        key = (sid, dur)
        if key in cache:
            continue
        y = as_stereo(MAKERS[sid](dur))
        y = edge_fade(y, fin=0.02, fout=0.020)
        pk = np.abs(y).max()
        if pk > 0:
            y = y / pk * 0.92
        wavfile.write(SFXDIR / f'{sid}_{int(round(dur * 10))}d.wav', SR, (y * 32767).astype(np.int16))
        cache[key] = y
        print(f'  合成 {sid + "_" + str(int(round(dur * 10))) + "d":<16} {len(y) / SR:5.2f}s  底噪')
    return cache


def render_cues(cues, only=None):
    SFXDIR.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    if not only:                       # 全量重做时先清空，避免留下上一版的孤儿文件（会骗过体检）
        for f in SFXDIR.glob('*.wav'):
            f.unlink()
    cache = {}
    for c in cues:
        sid, dur = c['sfx'], c.get('dur')
        if only and sid not in only:
            continue
        key = (sid, dur)
        if key in cache:
            continue
        y = as_stereo(MAKERS[sid](dur))
        y = edge_fade(y)
        if np.abs(y).max() > 0:
            y = y / np.abs(y).max() * 0.92
        FIXED = {'gun', 'card', 'ding', 'tape', 'fanfare', 'end', 'boot', 'reveal', 'uturn', 'sparkle', 'split'}
        name = sid if (dur is None or sid in FIXED) else f'{sid}_{int(round(dur * 10))}d'
        wavfile.write(SFXDIR / f'{name}.wav', SR, (y * 32767).astype(np.int16))
        cache[key] = y
        print(f'  合成 {name:<14} {len(y) / SR:5.2f}s  峰值 {20 * np.log10(np.abs(y).max() + 1e-12):5.1f} dBFS')
    return cache


def build_bed(cues, amb, cache, amb_cache, spec, n_total):
    bed = np.zeros((n_total, 2))
    for c in cues:
        key = (c['sfx'], c.get('dur'))
        y = cache[key]
        g = db2lin(c['gain'])
        st = y * g if y.ndim == 2 else pan2(y * g, c.get('pan', 0.0))
        if y.ndim == 2 and c.get('pan'):
            st = pan2(y.mean(1) * g, c['pan']) * 1.0 if False else y * g
        i = int(round(c['t'] * SR))
        if i >= n_total:
            continue
        e = min(n_total, i + len(st))
        bed[i:e] += st[:e - i]
    # 底噪床：按自己的 t0/t1 铺，接缝本来就有淡入淡出 ⇒ 叠上去自然交叉
    for a in amb:
        key = (a['sfx'], round(a['t1'] - a['t0'], 2))
        y = amb_cache.get(key)
        if y is None:
            continue
        g = db2lin(a['gain'])
        i = int(round(a['t0'] * SR))
        e = min(n_total, i + len(y))
        if i < n_total:
            bed[i:e] += y[:e - i] * g
    steps, nsteps = build_steps(spec, n_total)
    bed += steps
    return bed, nsteps


def duck_curve(n_total, vo, mix):
    """按旁白区间做侧链压音：说话时压低 duckUnderVo dB，起落按 attack/release 斜坡。"""
    target = np.ones(n_total)
    duck = db2lin(mix['duckUnderVo'])
    for a, b in vo:
        i0 = max(0, int((a - mix['voLead']) * SR))
        i1 = min(n_total, int((b + 0.02) * SR))
        target[i0:i1] = duck
    atk = max(1, int(mix['duckAttack'] * SR))
    rel = max(1, int(mix['duckRelease'] * SR))
    # 双向一阶平滑（升快降慢）
    out = np.empty_like(target)
    cur = target[0]
    for i in range(n_total):
        goal = target[i]
        k = (1 - np.exp(-1 / atk)) if goal < cur else (1 - np.exp(-1 / rel))
        cur += (goal - cur) * k
        out[i] = cur
    return out


def wav_to_mp3(wav_path, mp3_path, bitrate='192k'):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav_path), '-codec:a', 'libmp3lame',
                    '-b:a', bitrate, '-ar', str(SR), str(mp3_path)], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='', help='逗号分隔的音色名，只重做这几种')
    ap.add_argument('--no-mix', action='store_true')
    a = ap.parse_args()
    only = set(a.only.split(',')) if a.only else None

    data = json.loads(CUES.read_text(encoding='utf-8'))
    dur, cues, spec, mix = data['duration'], data['cues'], data['steps'], data['mix']
    n_total = int(round(dur * SR))
    print(f'片长 {dur}s · {len(cues)} 条 cue · {len(data["ids"])} 种音色')
    cache = render_cues(cues, only)
    amb_cache = render_amb(data['amb'], only)
    bed, nsteps = build_bed(cues, data['amb'], cache, amb_cache, spec, n_total)
    print(f'  脚步 {nsteps} 步（{spec["t0"]:.2f}–{spec["t1"]:.2f}s）')

    # 预压音的原始床也存一份（分析/调电平用；不进成片）
    raw_pk = np.abs(bed).max()
    wavfile.write(OUT / 'bed_raw.wav', SR, (bed / (raw_pk + 1e-12) * 0.89 * 32767).astype(np.int16))

    mask0 = np.zeros(n_total, bool)
    for a0, b0 in data['vo']:
        mask0[max(0, int(a0 * SR)):int(b0 * SR)] = True
    duck = duck_curve(n_total, data['vo'], mix)[:, None]
    bed_ducked = bed * duck
    # 归一化：目标 RMS（峰值靠 tanh 软限幅兜），这样“底噪床”整体够听得见、又不冒尖
    rms0 = float(np.sqrt((bed_ducked ** 2).mean()) + 1e-12)
    bed_ducked *= db2lin(mix['bedRmsDb']) / rms0
    lim = 10 ** (mix['bedPeakDb'] / 20)
    bed_ducked = np.tanh(bed_ducked / lim) * lim

    wav_bed = OUT / 'sfx_bed.wav'
    wavfile.write(wav_bed, SR, (bed_ducked * 32767).astype(np.int16))
    DIST.mkdir(exist_ok=True)
    wav_to_mp3(wav_bed, DIST / 'sfx.mp3')
    print(f'  音效床 → dist/sfx.mp3  峰值 {20 * np.log10(np.abs(bed_ducked).max()):5.1f} dBFS')

    report = {'duration': dur, 'cues': cues, 'steps': nsteps, 'mix': mix, 'only': sorted(only) if only else 'all'}

    # ── BGM：客户 2026-11-04 撤销，mix['bgm'] 为 false 时完全不参与混音
    bgm_path = ROOT / 'out' / 'bgm' / 'edit.wav'
    bgm_on = bool(mix.get('bgm', False))
    report['bgmEnabled'] = bgm_on
    bgm = None
    if bgm_on and bgm_path.exists():
        sr_b, yb = wavfile.read(bgm_path)
        yb = yb.astype(np.float64) / 32768.0
        if yb.ndim == 1:
            yb = np.stack([yb, yb], 1)
        if sr_b != SR:
            from fractions import Fraction
            fr = Fraction(SR, sr_b).limit_denominator(1000)
            yb = signal.resample_poly(yb, fr.numerator, fr.denominator, axis=0)
        buf = np.zeros((n_total, 2))
        e2 = min(n_total, len(yb))
        buf[:e2] = yb[:e2]
        act = buf[np.abs(buf).max(1) > 1e-4]
        rms_b = float(np.sqrt((act ** 2).mean()) + 1e-12) if len(act) else 1.0
        buf *= db2lin(mix['bgmRmsDb']) / rms_b
        duck2 = duck_curve(n_total, data['vo'], mix)
        bgm_ducked = buf * (duck2 ** (abs(mix['bgmDuckDb']) / abs(mix['duckUnderVo']))) [:, None]
        report['bgm'] = {
            'file': 'out/bgm/edit.wav', 'rmsOpenDb': mix['bgmRmsDb'], 'duckDb': mix['bgmDuckDb'],
            'rmsSpeechDb': round(20 * np.log10(float(np.sqrt((bgm_ducked[mask0] ** 2).mean()) + 1e-12)), 2),
            'rmsGapDb': round(20 * np.log10(float(np.sqrt((bgm_ducked[~mask0] ** 2).mean()) + 1e-12)), 2),
        }
        print(f"  BGM：开放 {report['bgm']['rmsGapDb']} dBFS · 说话时 {report['bgm']['rmsSpeechDb']} dBFS")
    else:
        bgm_ducked = None

    if not a.no_mix:
        # 口播：从新音轨读，前补 audioOffset、后补 tail
        vo_src = ROOT / data['audioFile']          # 唯一来源：voice.js 的 AUDIO.file
        sr_vo, vo = wavfile.read(vo_src)
        vo = vo.astype(np.float64) / 32768.0
        if vo.ndim == 1:
            vo = np.stack([vo, vo], 1)
        if sr_vo != SR:
            raise SystemExit(f'口播采样率 {sr_vo} ≠ {SR}')
        pre = int(round(data['audioOffset'] * SR))
        # 客户 2026-11-08-e：口播 / 音效两个独立开关 + 两条可对轨的分轨。
        #   增益一律按「满配（口播+音效+BGM）」的峰值算 ⇒ 分轨相加恒等于满配成片，
        #   客户在剪辑软件里只要把两条轨叠起来、动 fader 就行，不会出现电平跳变。
        vo_on = bool(mix.get('vo', True))
        sfx_on = bool(mix.get('sfx', True))
        t_vo = np.zeros((n_total, 2))
        e = min(n_total, pre + len(vo))
        t_vo[pre:e, :] = vo[:e - pre, :2]
        t_sfx = bed_ducked.copy()
        t_bgm = bgm_ducked if bgm_ducked is not None else np.zeros((n_total, 2))
        pk2 = np.abs(t_vo + t_sfx + t_bgm).max()
        g2 = db2lin(mix['mixPeakDb']) / (pk2 + 1e-12) if pk2 > 0 else 1.0
        mixbuf = np.zeros((n_total, 2))
        if vo_on:
            mixbuf += t_vo
        if sfx_on:
            mixbuf += t_sfx
        if bgm_on:
            mixbuf += t_bgm
        mixbuf *= g2

        # ── 分轨（同一增益）：剪辑软件里直接对轨用
        stem_vo = (t_vo * g2).astype(np.float64)
        stem_sfx = (t_sfx * g2).astype(np.float64)
        wavfile.write(OUT / 'stem_vo.wav', SR, np.clip(stem_vo * 32767, -32768, 32767).astype(np.int16))
        wavfile.write(OUT / 'stem_sfx.wav', SR, np.clip(stem_sfx * 32767, -32768, 32767).astype(np.int16))
        import shutil
        shutil.copyfile(OUT / 'stem_vo.wav', DIST / 'stem-vo.wav')
        shutil.copyfile(OUT / 'stem_sfx.wav', DIST / 'stem-sfx.wav')
        rec = np.abs((stem_vo + stem_sfx) - mixbuf).max() if (vo_on and sfx_on) else None
        report['stems'] = {
            'vo': 'dist/stem-vo.wav', 'sfx': 'dist/stem-sfx.wav',
            'voPeakDb': round(20 * np.log10(float(np.abs(stem_vo).max()) + 1e-12), 2),
            'sfxPeakDb': round(20 * np.log10(float(np.abs(stem_sfx).max()) + 1e-12), 2),
            'voRmsDb': round(20 * np.log10(float(np.sqrt((stem_vo ** 2).mean()) + 1e-12)), 2),
            'sfxRmsDb': round(20 * np.log10(float(np.sqrt((stem_sfx ** 2).mean()) + 1e-12)), 2),
            'sumEqualsMixMaxDiff': None if rec is None else round(float(rec), 9),
            'enabled': {'vo': vo_on, 'sfx': sfx_on},
        }
        print(f"  分轨 → dist/stem-vo.wav（峰值 {report['stems']['voPeakDb']} dBFS）"
              f" · dist/stem-sfx.wav（峰值 {report['stems']['sfxPeakDb']} dBFS）")
        if bgm_ducked is not None:
            # 无 BGM 对照版（与成片同一增益）：给客户 AB、也给自检核对“BGM 真的混进去了”
            no_bgm = np.zeros((n_total, 2))
            no_bgm[pre:e, :] += vo[:e - pre, :2]
            no_bgm += bed_ducked
            no_bgm *= g2
            wavfile.write(OUT / 'mix_nobgm.wav', SR, (no_bgm * 32767).astype(np.int16))
            wav_to_mp3(OUT / 'mix_nobgm.wav', DIST / 'mix-nobgm.mp3')
            delta = mixbuf - no_bgm
            report['bgmDeltaRmsDb'] = round(20 * np.log10(float(np.sqrt((delta ** 2).mean()) + 1e-12)), 2)
            report['bgmDeltaPeakDb'] = round(20 * np.log10(float(np.abs(delta).max()) + 1e-12), 2)
            print(f"  无 BGM 对照版 → dist/mix-nobgm.mp3（同增益，差值 RMS {report['bgmDeltaRmsDb']} dBFS）")
        wav_mix = OUT / 'mix.wav'
        wavfile.write(wav_mix, SR, (mixbuf * 32767).astype(np.int16))
        wav_to_mp3(wav_mix, DIST / 'mix.mp3')
        print(f'  成片混音 → dist/mix.mp3  峰值 {20 * np.log10(np.abs(mixbuf).max()):5.1f} dBFS')

        # 实测：说话时 / 空隙时的音效床电平（验证压音真的生效）
        def rms(seg):
            return float(np.sqrt((seg ** 2).mean()) + 1e-12)
        segs_speech, segs_gap = [], []
        mask = np.zeros(n_total, bool)
        for a0, b0 in data['vo']:
            mask[max(0, int(a0 * SR)):int(b0 * SR)] = True
        speech = bed_ducked[mask]
        gap = bed_ducked[~mask]
        report['bedRmsSpeechDb'] = round(20 * np.log10(rms(speech)), 2)
        report['bedRmsGapDb'] = round(20 * np.log10(rms(gap)), 2)
        report['duckDepthDb'] = round(report['bedRmsGapDb'] - report['bedRmsSpeechDb'], 2)
        report['mixPeakDb'] = round(20 * np.log10(np.abs(mixbuf).max()), 2)
        report['bedPeakDb'] = round(20 * np.log10(np.abs(bed_ducked).max()), 2)
        for k in ('bedRmsSpeechDb', 'bedRmsGapDb', 'duckDepthDb', 'mixPeakDb', 'bedPeakDb'):
            print(f'  {k:<16} {report[k]}')

    if 'bgm' in report:
        # 口播电平（说话区间，含片头留白后的真实位置）
        sr_v, vo_all = wavfile.read(ROOT / data['audioFile'])
        vo_all = vo_all.astype(np.float64) / 32768.0
        mixvo = np.zeros(n_total)
        pre0 = int(round(data['audioOffset'] * SR))
        e0 = min(n_total, pre0 + len(vo_all))
        mixvo[pre0:e0] = vo_all[:e0 - pre0].mean(1) if vo_all.ndim == 2 else vo_all[:e0 - pre0]
        vo_rms = 20 * np.log10(float(np.sqrt((mixvo[mask0] ** 2).mean()) + 1e-12))
        report['voRmsSpeechDb'] = round(vo_rms, 2)
        report['bgmBelowVoDb'] = round(report['bgm']['rmsSpeechDb'] - report['voRmsSpeechDb'], 2)
        print(f"  口播说话 {report['voRmsSpeechDb']} dBFS ⇒ BGM 比口播低 {abs(report['bgmBelowVoDb'])} dB")
    (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
    print('  报告 → out/sfx/report.json')


if __name__ == '__main__':
    sys.exit(main())
