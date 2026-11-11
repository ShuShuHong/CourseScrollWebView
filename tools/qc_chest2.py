"""螃蟹形象一致性检查（只看不透明像素）：定位“腹部花纹”是否发生漂移。

同一风格、同一性别的 5 张形态图应当共用同一套壳色 + 腹甲花纹。
这里裁“腹部”区域（避开头部与腿），只统计 alpha>200 的像素，量化后比对主色与纹理密度。
偏离群体的那张 = 花纹变了。

用法：uv run --with numpy --with pillow --with scipy python tools/qc_chest2.py
输出 out/qc/chest_all.jpg（裁切对比图，每行一组）与 stdout 表格。
"""
import json
import pathlib
import numpy as np
from PIL import Image, ImageDraw
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
A = MASCOTS
OUT = ROOT / 'out' / 'qc'
OUT.mkdir(parents=True, exist_ok=True)
STYLES = ('cartoon', 'navi', 'papercut')


def belly(im):
    """腹部（胸口）区域：水平居中 46%，竖向 38%–70% 的身体高度。"""
    al = np.asarray(im)[:, :, 3]
    ys, xs = np.nonzero(al > 128)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    w, h = x1 - x0 + 1, y1 - y0 + 1
    box = (int(x0 + w * 0.27), int(y0 + h * 0.38), int(x0 + w * 0.73), int(y0 + h * 0.70))
    return im.crop(box)


def stats(crop):
    a = np.asarray(crop).astype(np.float32)          # RGBA
    rgb, al = a[:, :, :3], a[:, :, 3]
    m = al > 200
    if m.sum() < 50:
        return None
    px = rgb[m]
    q = (px // 32).astype(np.int16)
    key = q[:, 0] * 100 + q[:, 1] * 10 + q[:, 2]
    vals, cnt = np.unique(key, return_counts=True)
    order = np.argsort(cnt)[::-1]
    top = []
    for i in order[:5]:
        sel = key == vals[i]
        top.append({'c': [int(v) for v in px[sel].mean(0)], 'r': round(float(cnt[i] / len(px)), 3)})
    g = np.asarray(crop.convert('L')).astype(np.float32)[m]
    tex = float(np.abs(g - g.mean()).mean())        # 纹理密度：花纹越多越大
    return {'top': top, 'tex': round(tex, 1), 'mean': [int(v) for v in px.mean(0)]}


rows, sheets = [], []
for style in STYLES:
    for sex in ('f', 'm'):
        files = sorted((A / style / 'cut').glob(f'{sex}[0-2]_*.png'))
        if not files:
            continue
        crops = [belly(Image.open(f)) for f in files]
        st = [stats(c) for c in crops]
        means = np.array([s['mean'] for s in st if s], dtype=float)
        if len(means) == 0:
            continue
        med = np.median(means, axis=0)
        for f, s in zip(files, st):
            if not s:
                continue
            d = float(np.abs(np.array(s['mean']) - med).mean())
            rows.append({'style': style, 'sex': sex, 'id': f.stem, 'dE': round(d, 1), 'tex': s['tex'], 'top': s['top'][:3]})
        H = max(c.height for c in crops) + 18
        W = max(c.width for c in crops)
        row = Image.new('RGB', (W * len(crops), H), '#f2f2f2')
        for i, (c, f) in enumerate(zip(crops, files)):
            t = Image.new('RGB', (W, H), '#f2f2f2')
            t.paste(c, ((W - c.width) // 2, 18), c)
            ImageDraw.Draw(t).text((2, 3), f'{style}/{f.stem}', fill='#000')
            row.paste(t, (i * W, 0))
        sheets.append(row)

if sheets:
    SW = max(r.width for r in sheets)
    SH = sum(r.height for r in sheets)
    sheet = Image.new('RGB', (SW, SH), '#ffffff')
    y = 0
    for r in sheets:
        sheet.paste(r, (0, y))
        y += r.height
    sheet.save(OUT / 'chest_all.jpg', quality=92)

print('%-9s %-2s %-9s %6s %6s  top3' % ('style', 'sex', 'id', 'dE', 'tex'))
for r in sorted(rows, key=lambda r: -r['dE']):
    print('%-9s %-2s %-9s %6.1f %6.1f  %s' % (r['style'], r['sex'], r['id'], r['dE'], r['tex'],
                                              ' '.join('#%02X%02X%02X' % tuple(t['c']) for t in r['top'])))
(OUT / 'chest_all.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8')
print('sheet:', OUT / 'chest_all.jpg')
