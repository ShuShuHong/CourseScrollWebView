"""足部一致性 v2：用「腐蚀求躯干 → 减去躯干 → 数残余枝干」的方式数腿，比扫线更稳。

步骤：
  1) 剪影（最大连通域 + 填洞）；
  2) 躯干 = 强腐蚀 k 次后取最大连通域，再膨胀回 k 次（把细腿吃掉又补回形状）；
  3) 残余 = 剪影 − 躯干，只保留下半身（y>0.5H）且面积 > 0.15% 的连通块 = 一条腿（或一只螯）；
  4) 记录每条腿的长度（块高/体高）、平均宽度、与躯干的夹角（x 方向偏移方向）。

用法：uv run --with numpy --with pillow --with scipy python tools/qc_legs2.py <dir> [label]
      dir 例如 races/<id>/mascots/navi 或 _work/backup/v3/navi
输出：stdout 表格 + out/qc/legs2_<label>.jpg（每条腿描色）
"""
import json
import pathlib
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIR = pathlib.Path(sys.argv[1])
LABEL = sys.argv[2] if len(sys.argv) > 2 else DIR.parent.name
OUT = ROOT / 'out' / 'qc'
OUT.mkdir(parents=True, exist_ok=True)
IDS = ['m0_run', 'm0_cheer', 'm1_run', 'm1_tired', 'm2_win',
       'f0_run', 'f0_cheer', 'f1_run', 'f1_tired', 'f2_win']
try:
    F = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 17)
except Exception:
    F = ImageFont.load_default()


def silo(im):
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    mx, mn = a.max(2), a.min(2)
    fg = ~np.logical_and(mn > 234, (mx - mn) < 14)
    lab, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        fg = lab == (int(np.argmax(sizes)) + 1)
    return ndimage.binary_fill_holes(fg)


def legs_of(im):
    fg = silo(im)
    ys, xs = np.nonzero(fg)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    W, H = x1 - x0 + 1, y1 - y0 + 1
    k = max(3, int(H * 0.045))
    er = ndimage.binary_erosion(fg, iterations=k)
    lab, n = ndimage.label(er)
    if n == 0:
        return fg, [], (x0, y0, W, H)
    sizes = ndimage.sum(er, lab, range(1, n + 1))
    torso = lab == (int(np.argmax(sizes)) + 1)
    torso = ndimage.binary_dilation(torso, iterations=k + 1)
    rest = fg & ~torso
    rest[: int(y0 + H * 0.50)] = False                     # 只看下半身（排除螯）
    lab2, n2 = ndimage.label(rest)
    out = []
    for i in range(1, n2 + 1):
        m = lab2 == i
        area = int(m.sum())
        if area < fg.sum() * 0.0015:
            continue
        my, mxs = np.nonzero(m)
        h = my.max() - my.min() + 1
        w = mxs.max() - mxs.min() + 1
        if h < H * 0.05:                                    # 太短 = 噪声
            continue
        out.append({'cx': int(mxs.mean()), 'cy': int(my.mean()), 'h': int(h), 'w': int(w),
                    'side': 'L' if mxs.mean() < (x0 + x1) / 2 else 'R', 'area': area})
    out.sort(key=lambda d: d['cx'])
    return fg, out, (x0, y0, W, H)


rows, tiles = [], []
for cid in IDS:
    p = DIR / f'{cid}.jpg'
    if not p.exists():
        continue
    im = Image.open(p).convert('RGB')
    fg, legs, (x0, y0, W, H) = legs_of(im)
    L = [l for l in legs if l['side'] == 'L']
    R = [l for l in legs if l['side'] == 'R']
    lens = [l['h'] / H for l in legs]
    widths = [l['w'] / W for l in legs]
    rows.append({'id': cid, 'n': len(legs), 'left': len(L), 'right': len(R),
                 'len_med': round(float(np.median(lens)), 3) if lens else None,
                 'len_spread': round(float(np.std(lens) / (np.mean(lens) or 1)), 3) if lens else None,
                 'w_med': round(float(np.median(widths)), 4) if widths else None})
    # 可视化
    vis = im.copy()
    vis.thumbnail((420, 420), Image.LANCZOS)
    d = ImageDraw.Draw(vis)
    kk = vis.width / im.width
    for l in legs:
        d.ellipse([l['cx'] * kk - 4, l['cy'] * kk - 4, l['cx'] * kk + 4, l['cy'] * kk + 4],
                  fill='#ff0000' if l['side'] == 'L' else '#0066ff')
    d.rectangle([0, 0, vis.width, 18], fill='white')
    d.text((4, 4), f'{cid} legs={len(legs)} L{L}/R{R}', font=F, fill='#c00')
    tiles.append(vis)

print('== %s 足部统计 ==' % LABEL)
print('%-9s %4s %4s %4s %8s %8s %8s' % ('id', 'n', 'L', 'R', 'lenMed', 'lenCV', 'wMed'))
for r in rows:
    print('%-9s %4d %4d %4d %8s %8s %8s' % (r['id'], r['n'], r['left'], r['right'],
                                            r['len_med'], r['len_spread'], r['w_med']))
ns = [r['n'] for r in rows]
if ns:
    print('\n腿数：min %d  max %d  median %.1f   （目标：全部 6 条，左右各 3）' % (min(ns), max(ns), np.median(ns)))

if tiles:
    cols = 5
    tw, th = max(t.width for t in tiles), max(t.height for t in tiles)
    rws = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * tw, rws * th), 'white')
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
    dest = OUT / f'legs2_{LABEL}.jpg'
    sheet.save(dest, quality=90)
    print('saved', dest, sheet.size)

(OUT / f'legs2_{LABEL}.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8')
