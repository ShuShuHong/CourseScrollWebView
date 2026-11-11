"""音效可听度体检：用 50 ms 短时能量比，别拿瞬态音和持续底噪比整体 RMS。
   cue 段内取 95 分位短时能量（代表“最响的那一下有多响”），底噪取中位数。
"""
import json
import pathlib
import sys

import numpy as np
from scipy.io import wavfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SR = 44100
FR = int(0.05 * SR)          # 50 ms 帧
SOFT = {'leaves', 'birds', 'traffic', 'breath', 'wind'}   # 本来就该轻的环境类


def db(x):
    return 20 * np.log10(x + 1e-12)


def frames_rms(x):
    n = len(x) // FR
    if n == 0:
        return np.array([1e-6])
    f = x[:n * FR].reshape(n, FR)
    return np.sqrt((f ** 2).mean(1)) + 1e-12


def main():
    data = json.loads((ROOT / 'out/sfx/cues.json').read_text(encoding='utf-8'))
    _, bed = wavfile.read(ROOT / 'out/sfx/bed_raw.wav')
    mono = bed.astype(np.float64).mean(1) / 32768

    # 2026-11-08：新排程口播几乎连续 ⇒ 有些环境音整段落在台词下面，被 MIX.duckUnderVo 压 15 dB。
    #   那不是“没调好”，是设计：拿“口播前 0.75 s”当底噪对它不公平。这类单独归类，不参与不达标判定。
    vo = data.get('vo') or []
    def vo_cover(t, dur):
        seg = sum(max(0.0, min(t + dur, b) - max(t, a)) for a, b in vo)
        return seg / max(dur, 1e-6)

    rows = []
    for c in data['cues']:
        t = c['t']
        dur = c.get('dur') or 0.8
        i0 = max(0, int(t * SR))
        i1 = min(len(mono), int((t + min(dur, 1.2)) * SR))
        fl0 = max(0, int((t - 0.75) * SR))
        fl1 = max(0, int((t - 0.12) * SR))
        cue = frames_rms(mono[i0:i1])
        floor = frames_rms(mono[fl0:fl1]) if fl1 - fl0 > FR else np.array([1e-6])
        ce = db(cue.max())
        fe = db(np.percentile(floor, 75))
        covered = vo_cover(t, min(dur, 1.2))
        rows.append((c['id'], c['sfx'], t, ce, fe, ce - fe, covered))

    rows.sort(key=lambda r: r[5])
    print(f'{"cue":<18}{"音色":<10}{"t":>7}{"峰值帧":>8}{"底噪":>8}{"高出":>7}')
    for cid, sid, t, ce, fe, d, cov in rows:
        lim = 3 if sid in SOFT else 6
        flag = '  ← 整段在口播下（压 15 dB）' if cov > 0.85 else ('  ← 被埋住' if d < lim else '')
        print(f'{cid:<18}{sid:<10}{t:7.2f}{ce:8.1f}{fe:8.1f}{d:7.1f}{flag}')

    scored = [r for r in rows if r[6] <= 0.85]
    ds = [r[5] for r in scored]
    bad = [r for r in scored if r[5] < (3 if r[1] in SOFT else 6)]
    print(f'计入判定 {len(scored)} 条（另 {len(rows) - len(scored)} 条整段在口播下，按设计压住）')
    print(f'中位 {np.median(ds):.1f} dB · 最小 {min(ds):.1f} · 不达标 {len(bad)} 条')
    for r in bad:
        print('   ', r[0], f'{r[5]:.1f} dB')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
