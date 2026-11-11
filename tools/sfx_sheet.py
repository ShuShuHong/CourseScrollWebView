"""音效内容体检 + 出“声音设计表”图：
   ① 每种音色的频谱重心/时长/峰值（判断合成得对不对，不靠耳朵）
   ② 每条 cue 的首尾是否有跳变（爆音）
   ③ 画一张带 cue 标记的波形图（给人看）
"""
import json
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.io import wavfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SFX = ROOT / 'audio' / 'sfx'
SR = 44100
FONT = 'C:/Windows/Fonts/msyh.ttc'
FONTB = 'C:/Windows/Fonts/msyhbd.ttc'

# 每种音色“该长什么样”：重心 Hz 的合理区间
EXPECT = {
    'gun': (600, 4000), 'tape': (1200, 6000), 'card': (600, 6500), 'ding': (700, 5000),
    'bellx': (900, 3000), 'rumble': (20, 260), 'wind': (200, 2500), 'crowd': (180, 2400),
    'cheer': (250, 3000), 'whoosh': (200, 4000), 'traffic': (80, 900), 'leaves': (1200, 7000),
    'birds': (1800, 5000), 'breath': (250, 2200), 'uturn': (300, 4000), 'fork': (400, 4500),
    'split': (400, 4000), 'sparkle': (1200, 5500), 'fanfare': (200, 4500), 'end': (40, 1800),
    'boot': (20, 3200), 'reveal': (300, 5000), 'amb_crowd': (150, 2400), 'amb_street': (60, 1200),
    'amb_wind': (150, 3000), 'amb_park': (900, 7000), 'amb_rush': (250, 5000),
}
SOFT = {'leaves', 'birds', 'traffic', 'breath', 'wind', 'amb_park', 'amb_street', 'amb_rush', 'amb_wind'}
# 只有噪声类音效才查首尾跳变（铃、枪、绷带这类“一击”本来就是从峰值起）
NOISE = {'crowd', 'cheer', 'wind', 'breath', 'split', 'end', 'whoosh', 'fork', 'leaves', 'birds',
         'traffic', 'amb_crowd', 'amb_street', 'amb_wind', 'amb_park', 'amb_rush', 'uturn', 'reveal'}


def centroid(x):
    X = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return float((X * f).sum() / (X.sum() + 1e-12))


def db(x):
    return 20 * np.log10(x + 1e-12)


def main():
    data = json.loads((ROOT / 'out/sfx/cues.json').read_text(encoding='utf-8'))
    rows, bad = [], []

    # ① 逐音色频谱
    print('=== ① 音色体检（合成是否落在预期的频段）===')
    print(f'{"文件":<22}{"时长":>7}{"重心":>8}{"预期":>16}{"峰值":>8}{"首尾跳变":>10}')
    for f in sorted(SFX.glob('*.wav')):
        sr, y = wavfile.read(f)
        y = y.astype(np.float64) / 32768
        m = y.mean(1) if y.ndim == 2 else y
        if len(m) < 200:
            continue
        c = centroid(m[:min(len(m), SR * 2)])
        base = f.stem.rsplit('_', 1)[0] if f.stem.split('_')[-1].endswith('d') else f.stem
        lo, hi = EXPECT.get(base, (0, 20000))
        w = int(0.0006 * SR)      # 0.6 ms：足够判“有没有硬切”，又不会被正常起振误伤
        edge = max(np.abs(m[:w]).max(), np.abs(m[-w:]).max())
        jump = db(edge) - db(np.abs(m).max())
        okc = lo <= c <= hi
        if not okc and base not in SOFT:
            bad.append(f'{f.stem} 重心 {c:.0f}Hz 越界 {lo}–{hi}')
        if jump > -12 and base in NOISE:
            bad.append(f'{f.stem} 首尾跳变 {jump:.1f}dB（可能爆音）')
        print(f'{f.stem:<22}{len(m) / SR:6.2f}s{c:8.0f}{lo:7.0f}–{hi:<7.0f}{db(np.abs(m).max()):8.1f}{jump:9.1f}')

    # ② 每条 cue 的清点
    print('\n=== ② 排布 ===')
    by_kind = {}
    for c in data['cues']:
        by_kind[c['sfx']] = by_kind.get(c['sfx'], 0) + 1
    print('  ' + ' · '.join(f'{k}×{v}' for k, v in sorted(by_kind.items(), key=lambda x: -x[1])))
    print(f'  底噪 {len(data["amb"])} 段，合计 {sum(a["t1"] - a["t0"] for a in data["amb"]):.0f}s；'
          f'脚步 {data["steps"]["t0"]:.1f}–{data["steps"]["t1"]:.1f}s')

    # ③ 画波形图
    _, bed = wavfile.read(ROOT / 'out/sfx/sfx_bed.wav')
    mono = bed.astype(np.float64).mean(1) / 32768
    dur = data['duration']
    W, H = 1800, 520
    img = Image.new('RGB', (W, H), '#0d141b')
    d = ImageDraw.Draw(img)
    f_t = ImageFont.truetype(FONTB, 22)
    f_s = ImageFont.truetype(FONT, 13)
    d.text((16, 10), '2026 高淳马拉松 · 音效床波形（上：压音后的床 / 下：剪影）', fill='#8fd3ff', font=f_t)

    top, bot = 60, H - 120
    mid = (top + bot) // 2
    half = (bot - top) // 2
    n = len(mono)
    # 每像素取 min/max
    step = n // W
    for x in range(W - 40):
        seg = mono[x * step:(x + 1) * step]
        if len(seg) == 0:
            continue
        lo, hi = seg.min(), seg.max()
        d.line([(20 + x, mid - hi * half), (20 + x, mid - lo * half)], fill='#3fa9f5')
    d.line([(20, mid), (20 + W - 40, mid)], fill='#26323d')

    # cue 标记
    for c in data['cues']:
        x = 20 + int(c['t'] / dur * (W - 40))
        col = '#ff9f43' if c['sfx'] in ('gun', 'tape', 'fanfare') else ('#ffd479' if c['sfx'] == 'uturn' else '#6ad2a2')
        d.line([(x, top - 8), (x, bot + 8)], fill=col + '', width=1)
        d.text((x + 2, bot + 10 + (hash(c['id']) % 3) * 13), c['id'], fill=col, font=f_s)
    # 底噪段
    for a in data['amb']:
        x0 = 20 + int(a['t0'] / dur * (W - 40))
        x1 = 20 + int(a['t1'] / dur * (W - 40))
        d.rectangle([x0, bot + 52, x1, bot + 62], fill='#4a5b6b')
        d.text((x0 + 2, bot + 64), a['sfx'].replace('amb_', ''), fill='#7f93a5', font=f_s)
    # 时间刻度
    for s in range(0, int(dur) + 1, 5):
        x = 20 + int(s / dur * (W - 40))
        d.line([(x, bot), (x, bot + 6)], fill='#4a5b6b')
        d.text((x + 2, bot + 30), f'{s}s', fill='#5f7284', font=f_s)

    out = ROOT / 'out' / 'review' / 'sfx-sheet.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f'\n波形图 → {out.relative_to(ROOT)} ({W}×{H})')

    if bad:
        print('\n=== 需要修 ===')
        for b_ in bad:
            print('  ✗', b_)
        return 1
    print('\n✓ 音色体检通过')
    return 0


if __name__ == '__main__':
    sys.exit(main())
