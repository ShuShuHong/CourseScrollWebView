"""字幕实拍核查：从截图里核对“该出现的字幕是否真的出现了”。

思路（不依赖视觉模型）：字幕条是画面底部中央的一块亮色圆角矩形，文字是深色。
对每一帧：
  · 取底部 y ∈ [56%, 68%] 区域，统计亮像素（字幕条）占比与深色像素（文字）占比；
  · 输出一个表格，方便判断“某条字幕没渲染出来 / 渲染了两条”。

用法：uv run --with numpy --with pillow python tools/qc_subs_shots.py navi
"""
import json
import pathlib
import re
import sys
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
STYLE = sys.argv[1] if len(sys.argv) > 1 else 'navi'
DIR = ROOT / 'out' / 'review' / f'subs_{STYLE}'

rows = []
for p in sorted(DIR.glob('s*.png')):
    m = re.match(r's(\d+)_([\d.]+)s', p.stem)
    idx, t = int(m.group(1)), float(m.group(2))
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
    H, W, _ = a.shape
    band = a[int(H * 0.55):int(H * 0.70), int(W * 0.10):int(W * 0.90)]
    lum = band.mean(2)
    light = float((lum > 205).mean())
    dark = float((lum < 90).mean())
    rows.append({'n': idx, 't': t, 'light': round(light, 3), 'dark': round(dark, 3)})

print('%-4s %6s %7s %7s  %s' % ('#', 't', 'light', 'dark', '判定'))
for r in rows:
    ok = r['light'] > 0.02 and r['dark'] > 0.004
    print('%-4d %6.2f %7.3f %7.3f  %s' % (r['n'], r['t'], r['light'], r['dark'], '字幕在' if ok else '⚠ 底部没找到字幕条/文字'))
(ROOT / 'out/review' / f'subs_{STYLE}_check.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8')
