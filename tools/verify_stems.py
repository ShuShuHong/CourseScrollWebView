"""分轨校验：口播 / 音效两条 stem 与混音、与源音轨的关系（不需要成片也能跑）。

  ① 两条 stem 时长 == 片长，且 left/right 均为 44.1k 立体声
  ② stem-vo + stem-sfx ≡ out/sfx/mix.wav（逐样本，误差应只剩 16 bit 量化）
  ③ stem-vo 与 audio/tts/timeline.wav 严格同源（滞后 0 样本、相关度 ≈1）
  ④ stem-sfx 与 stem-vo 相关度 ≈0（说明音效轨里没有混进口播）
  ⑤ 若给了成片路径，再验成片音轨 == stem-vo（滞后 / 相关度 / 残差）

  用法：uv run --with numpy --with scipy python tools/verify_stems.py [成片.mp4 ...]
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
SR = 44100
ok, bad = [], []


def chk(name, cond, detail=''):
    (ok if cond else bad).append(f"{'PASS' if cond else 'FAIL'}  {name}{' · ' + detail if detail else ''}")


def load(p):
    sr, a = wavfile.read(p)
    assert sr == SR, f'{p} 采样率 {sr} ≠ {SR}'
    return a.astype(np.float64) / 32768.0


def mono(x):
    return x.mean(1) if x.ndim > 1 else x


def lag_corr(a, b, max_lag=6000):
    """返回 (最佳滞后样本, 该滞后下的相关度)"""
    a = mono(a); b = mono(b)
    n = min(len(a), len(b))
    a, b = a[:n], b[:n]
    a = a - a.mean(); b = b - b.mean()
    best = (0, -1.0)
    for lag in range(-max_lag, max_lag + 1):
        x = a[max(0, lag):n + min(0, lag)]
        y = b[max(0, -lag):n - max(0, lag)]
        d = np.linalg.norm(x) * np.linalg.norm(y)
        if d < 1e-9:
            continue
        c = float(np.dot(x, y) / d)
        if c > best[1]:
            best = (lag, c)
    return best


vo = load(DIST / 'stem-vo.wav')
sfx = load(DIST / 'stem-sfx.wav')
mix = load(ROOT / 'out/sfx/mix.wav')
timeline = load(ROOT / 'audio/tts/timeline.wav')

dur = len(vo) / SR
chk('两条 stem 等长', len(vo) == len(sfx), f'{dur:.3f}s / {len(sfx) / SR:.3f}s')
chk('两条 stem 等长于 mix', abs(len(vo) - len(mix)) <= 1, f'mix {len(mix) / SR:.3f}s')
chk('立体声', vo.ndim == 2 and vo.shape[1] == 2)

n = min(len(vo), len(sfx), len(mix))
s = vo[:n] + sfx[:n]
d = np.abs(s - mix[:n])
chk('stem-vo + stem-sfx ≡ mix.wav', d.max() < 1e-4,
    f'最大差 {d.max():.2e} · RMS 差 {np.sqrt((d ** 2).mean()):.2e}')

lag, c = lag_corr(vo, timeline, 3000)
chk('stem-vo 与源整轨同源', abs(lag) <= 2 and c > 0.999,
    f'滞后 {lag} 样本 · 相关度 {c:.6f}')

lag2, c2 = lag_corr(vo, sfx, 3000)
chk('stem-sfx 里没有口播', abs(c2) < 0.01, f'相关度 {c2:.6f}（滞后 {lag2}）')


def db(x):
    return 20 * np.log10(np.max(np.abs(x)) + 1e-12)


print(f'  时长 {dur:.3f}s · 口播 峰值 {db(vo):.2f} / RMS {db(np.sqrt((mono(vo) ** 2).mean())):.2f} dBFS')
print(f'           音效 峰值 {db(sfx):.2f} / RMS {db(np.sqrt((mono(sfx) ** 2).mean())):.2f} dBFS')
print(f'           混音 峰值 {db(mix):.2f} / RMS {db(np.sqrt((mono(mix) ** 2).mean())):.2f} dBFS')

# ⑤ 可选：视频成片
for vp in sys.argv[1:]:
    p = Path(vp) if Path(vp).is_absolute() else ROOT / vp
    if not p.exists():
        bad.append(f'FAIL  找不到成片 {p}')
        continue
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(p), '-f', 'f32le', '-ac', '2', '-ar', '44100', '-'],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype='<f4').reshape(-1, 2).astype(np.float64)
    lag3, c3 = lag_corr(a, vo, 6000)
    n3 = min(len(a), len(vo))
    seg = a[n3 // 4:n3 // 4 + SR * 4].mean(1)
    r = a[:n3] - vo[:n3]
    chk(f'{p.name} 音轨 == stem-vo', abs(lag3) <= 2 and c3 > 0.999,
        f'滞后 {lag3} 样本 · 相关度 {c3:.6f} · 残差 {db(r):.1f} dBFS')
    chk(f'{p.name} 时长对得上', abs(len(a) / SR - dur) < 0.05, f'{len(a) / SR:.3f}s vs {dur:.3f}s')

for line in ok + bad:
    print(' ', line)
print(f'\n{"✓ 分轨全部通过" if not bad else "✗ 有不通过项"}（{len(ok)} 项）')
sys.exit(0 if not bad else 1)
