"""时间轴密度图：证明“信息密度均匀、画面同步”。

上：公蟹里程曲线（每行旁白的锚点处画点：那句话说出时螃蟹在哪）
下：38 条字幕的时间条（长度 ∝ 字数，间距恒定 ⇒ 密度肉眼可见地均匀）

用法：uv run --with numpy --with pillow python tools/plot_timeline.py
输出：out/review/timeline_chart.png
"""
import json
import math
import pathlib
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / '_work' / 'timeline.json'
OUT = ROOT / 'out' / 'review'
OUT.mkdir(parents=True, exist_ok=True)

D = json.loads(DATA.read_text(encoding='utf-8'))
S, NARR = D['subs'], D['narr']
DUR, TOTAL_K = D['duration'], 42.195

W, H = 2100, 1180
PAD_L, PAD_R, PAD_T = 150, 90, 70
TOPH, BOTH = 380, 560          # 曲线区高度 / 字幕区高度

BG = '#FFFFFF'
INK = '#14284A'
C = {'start': '#5B6B85', 'city': '#2E7BFF', 'bridge': '#00A0C6', 'water': '#1FA463',
     'bridge2': '#C43C3C', 'fork': '#FF7A1A', 'half': '#FF4FA0', 'loop': '#7B4BE0', 'finish': '#E0A100'}

try:
    F = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 22)
    FS = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 16)
    FT = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 28)
except Exception:
    F = FS = FT = ImageFont.load_default()

img = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(img)
x = lambda t: PAD_L + (t / DUR) * (W - PAD_L - PAD_R)
y = lambda k: PAD_T + TOPH - (k / TOTAL_K) * TOPH

d.text((PAD_L, 18), '2026 高淳马拉松 · 口播与画面同步 / 密度图', font=FT, fill=INK)
d.text((PAD_L, 54), f'片长 {DUR:.1f}s · 旁白 {D["chars"]} 字逐字上口播 · 每行时长 = 字数 ÷ {D["cps"]} 字/秒', font=FS, fill='#6B7A90')

# ── 段落底色
for n in NARR:
    if not n.get('km'):
        continue
    x0, x1 = x(n['t0']), x(n['t1'])
    d.rectangle([x0, PAD_T, x1, PAD_T + TOPH + BOTH], fill=C.get(n['id'], '#EEEEEE') + '14' if False else '#F4F7FC')

# ── 网格与坐标
for k in range(0, 45, 5):
    yy = y(k)
    d.line([PAD_L, yy, W - PAD_R, yy], fill='#E3EAF4')
    d.text((PAD_L - 52, yy - 10), f'{k}', font=FS, fill='#8C9AAE')
for t in range(0, int(DUR) + 1, 10):
    xx = x(t)
    d.line([xx, PAD_T, xx, PAD_T + TOPH + BOTH], fill='#EDF2F9')
    d.text((xx - 10, PAD_T + TOPH + BOTH + 8), f'{t}s', font=FS, fill='#8C9AAE')

# ── 公蟹里程曲线
pts = [(x(t), y(k)) for t, k in D['male_km']]
d.line(pts, fill=INK, width=4, joint='curve')

# ── 每行旁白的锚点
for s in S:
    if s.get('km') is None:
        continue
    cx, cy = x(s['t'] + s['d'] / 2), y(s['km'])
    col = C.get(s['block'], INK)
    d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=col, outline=BG)

d.text((PAD_L, PAD_T + TOPH + 26), '公蟹进度（km）—— 每个点 = 那句话说到一半时螃蟹所在位置', font=FS, fill=INK)

# ── 字幕条
SY = PAD_T + TOPH + 70
rowh = 12
for i, s in enumerate(S):
    xx0, xx1 = x(s['t']), x(s['t'] + s['d'])
    yy = SY + i * rowh
    col = C.get(s['block'], INK)
    d.rectangle([xx0, yy, xx1, yy + rowh - 3], fill=col)
    if i % 2 == 0 or s['d'] > 2.2:
        d.text((xx1 + 6, yy - 3), s['text'], font=FS, fill='#4A5B78')

# ── 图例
lx = W - PAD_R - 560
for i, n in enumerate(NARR):
    col = C.get(n['id'], INK)
    cx, cy = lx + (i % 3) * 190, 22 + (i // 3) * 26
    d.rectangle([cx, cy, cx + 16, cy + 12], fill=col)
    d.text((cx + 22, cy - 3), D['segname'].get(n['id'], n['id']), font=FS, fill=INK)

img.save(OUT / 'timeline_chart.png')
print('saved', OUT / 'timeline_chart.png', img.size)
