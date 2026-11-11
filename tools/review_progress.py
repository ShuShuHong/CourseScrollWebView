"""形态递进对照表：同一只螃蟹 Lv1 → Lv2 → Lv3 并排，专门看“身体是否一致、披风与皇冠是否到位”。

用法：uv run --with numpy --with pillow python tools/review_progress.py [style]
输出：out/review/progress_<style>.jpg
"""
import pathlib
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
A = MASCOTS
OUT = ROOT / 'out' / 'review'
OUT.mkdir(parents=True, exist_ok=True)
STYLE = sys.argv[1] if len(sys.argv) > 1 else 'navi'
try:
    F = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 24)
    FS = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 19)
except Exception:
    F = FS = ImageFont.load_default()

PLAN = [
    ('公蟹 · 全马', [('m0_run', 'Lv1 新手 · 奔跑'), ('m1_run', 'Lv2 升级 · 奔跑（应有披风）'),
                     ('m2_win', 'Lv3 蟹王 · 冲线（披风 + 大皇冠）')]),
    ('母蟹 · 半马', [('f0_run', 'Lv1 新手 · 奔跑'), ('f1_run', 'Lv2 升级 · 奔跑（应有披风）'),
                     ('f2_win', 'Lv3 蟹后 · 冲线（披风 + 大后冠）')]),
]
T = 520
HEAD = 360
W = T * 3 + 40
H = 90 + len(PLAN) * (T + 60 + HEAD + 40)
sheet = Image.new('RGB', (W, H), '#ffffff')
d = ImageDraw.Draw(sheet)
d.text((20, 18), f'B · 导航地图 · 螃蟹形态递进（身体一致性 / 披风 / 皇冠）', font=F, fill='#111')
d.text((20, 54), '每行：Lv1 → Lv2 → Lv3；下方为 Lv3 头部放大（看皇冠大小是否够明显）', font=FS, fill='#666')

y = 92
for tag, items in PLAN:
    d.text((20, y), tag, font=F, fill='#2E7BFF')
    y += 40
    for i, (cid, cap) in enumerate(items):
        p = A / STYLE / f'{cid}.jpg'
        if not p.exists():
            continue
        im = Image.open(p).convert('RGB')
        im.thumbnail((T, T), Image.LANCZOS)
        x = 20 + i * T
        sheet.paste(im, (x + (T - im.width) // 2, y))
        d.text((x + 8, y + T + 6), cap, font=FS, fill='#333')
    y += T + 34
    # Lv3 头部放大
    lv3 = A / STYLE / items[-1][0] + '.jpg' if False else A / STYLE / f'{items[-1][0]}.jpg'
    if lv3.exists():
        im = Image.open(lv3).convert('RGB')
        a = np.asarray(im).astype(np.int16)
        mx, mn = a.max(2), a.min(2)
        body = ~np.logical_and(mn > 236, (mx - mn) < 12)
        ys, xs = np.nonzero(body)
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        Wd, Hd = x1 - x0 + 1, y1 - y0 + 1
        crop = im.crop((int(x0 + Wd * 0.08), int(y0), int(x0 + Wd * 0.92), int(y0 + Hd * 0.5)))
        crop.thumbnail((HEAD * 2, HEAD), Image.LANCZOS)
        sheet.paste(crop, (20, y))
        d.text((20 + crop.width + 16, y + 8), f'{items[-1][0]} 头部放大\n（皇冠应明显大于头部其它配饰）', font=FS, fill='#999')
    y += HEAD + 26

sheet.thumbnail((1800, 4000), Image.LANCZOS)
sheet.save(OUT / f'progress_{STYLE}.jpg', quality=93)
print('saved', OUT / f'progress_{STYLE}.jpg', sheet.size)
