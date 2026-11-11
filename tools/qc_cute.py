"""新版（萌化）定妆图 vs 旧版：生成对比图 + 量化“绒毛感”指标。

绒毛感的代理指标（只在角色前部/螯的区域统计）：
  hf   高频能量：灰度图减去中值模糊后的平均绝对差 —— 毛发细线会显著抬高
  sat  平均饱和度（毛发/写实纹理通常会带来更灰更杂的色）
  edge 每 1000 像素的边缘数（Canny 太贵，用梯度阈值近似）

用法：uv run --with numpy --with pillow python tools/qc_cute.py
"""
import pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
A = MASCOTS
OLD = ROOT / '_work' / 'backup' / 'v1'
OUT = ROOT / 'out' / 'qc'
OUT.mkdir(parents=True, exist_ok=True)
STYLES = [('cartoon', 'A 卡通'), ('navi', 'B 导航地图'), ('papercut', 'C 剪纸')]


def metrics(im):
    im = im.convert('RGB')
    g = np.asarray(im.convert('L')).astype(np.float32)
    blur = np.asarray(im.convert('L').filter(ImageFilter.MedianFilter(7))).astype(np.float32)
    hf = float(np.abs(g - blur).mean())
    a = np.asarray(im).astype(np.float32)
    mx, mn = a.max(2), a.min(2)
    fg = ~np.logical_and(mn > 240, (mx - mn) < 10)
    sat = float((mx - mn)[fg].mean())
    gy, gx = np.gradient(g)
    mag = np.hypot(gx, gy)
    edge = float((mag[fg] > 24).sum() / max(1, fg.sum()) * 1000)
    return {'hf': round(hf, 2), 'sat': round(sat, 1), 'edge': round(edge, 1)}


rows, panels = [], []
for style, label in STYLES:
    new_p, old_p = A / style / 'master.jpg', OLD / style / 'master.jpg'
    if not new_p.exists() or not old_p.exists():
        print('skip', style)
        continue
    new, old = Image.open(new_p), Image.open(old_p)
    rows.append((label, '旧版', metrics(old)))
    rows.append((label, '新版', metrics(new)))
    # 并排：旧 | 新
    H = 620
    ims = []
    for tag, im in (('旧版', old), ('新版（萌化）', new)):
        t = im.convert('RGB')
        t = t.resize((round(t.width * H / t.height), H), Image.LANCZOS)
        ims.append((tag, t))
    W = sum(t.width for _, t in ims) + 30 * (len(ims) + 1)
    sheet = Image.new('RGB', (W, H + 54), '#ffffff')
    d = ImageDraw.Draw(sheet)
    x = 30
    for tag, t in ims:
        sheet.paste(t, (x, 44))
        d.text((x, 18), f'{label} · {tag}', fill='#111')
        x += t.width + 30
    panels.append(sheet)

if panels:
    W = max(p.width for p in panels)
    H = sum(p.height for p in panels)
    all_sheet = Image.new('RGB', (W, H), '#ffffff')
    y = 0
    for p in panels:
        all_sheet.paste(p, (0, y))
        y += p.height
    all_sheet.save(OUT / 'cute_before_after.jpg', quality=92)
    print('saved', OUT / 'cute_before_after.jpg', all_sheet.size)

print('%-12s %-10s %6s %6s %6s' % ('style', 'ver', 'hf', 'sat', 'edge'))
for label, ver, m in rows:
    print('%-12s %-10s %6.2f %6.1f %6.1f' % (label, ver, m['hf'], m['sat'], m['edge']))
