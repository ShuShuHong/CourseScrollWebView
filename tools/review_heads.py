"""头部放大对照表：把每张图的“头部区域”（含眼柄与眼）裁出来放大，专门用来数眼睛。

用法：uv run --with pillow --with numpy python tools/review_heads.py [style ...]
输出：out/review/heads_<style>.jpg
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
IDS = ['m0_run', 'm0_cheer', 'm1_run', 'm1_tired', 'm2_win', 'f0_run', 'f0_cheer', 'f1_run', 'f1_tired', 'f2_win']
STYLES = sys.argv[1:] or ['cartoon', 'navi', 'papercut']
try:
    FJSON = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 20)
except Exception:
    FJSON = ImageFont.load_default()

T = 360
COLS = 5
for style in STYLES:
    tiles = []
    for cid in IDS:
        p = A / style / f'{cid}.jpg'
        if not p.exists():
            continue
        im = Image.open(p).convert('RGB')
        a = np.asarray(im).astype(np.int16)
        mx, mn = a.max(2), a.min(2)
        body = ~np.logical_and(mn > 236, (mx - mn) < 12)
        ys, xs = np.nonzero(body)
        if len(ys) < 500:
            continue
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        W, H = x1 - x0 + 1, y1 - y0 + 1
        # 头部：包围盒上部 0–46%，宽度收紧到中间 70%
        box = (int(x0 + W * 0.10), int(y0), int(x0 + W * 0.90), int(y0 + H * 0.46))
        crop = im.crop(box).resize((T, T), Image.LANCZOS)
        d = ImageDraw.Draw(crop)
        d.rectangle([0, 0, T - 1, T - 1], outline='#e5e5e5')
        d.rectangle([0, 0, T, 22], fill='#ffffff')
        d.text((6, 2), cid, font=FJSON, fill='#c00000')
        tiles.append(crop)
    if not tiles:
        continue
    rws = (len(tiles) + COLS - 1) // COLS
    sheet = Image.new('RGB', (COLS * T, rws * T), '#ffffff')
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % COLS) * T, (i // COLS) * T))
    out = OUT / f'heads_{style}.jpg'
    sheet.save(out, quality=92)
    print('saved', out, sheet.size)
