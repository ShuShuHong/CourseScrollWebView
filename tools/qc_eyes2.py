"""眼睛自检 v2：成对识别，判定“是否出现两对眼睛”。

规则：
  1) 深色 + 近圆 + 面积合理的暗色团 = 候选眼球；
  2) 两个候选若尺寸相近（±35%）、纵坐标接近（≤0.07H）、横向间隔在 0.55–3.4 倍直径之间 → 判为“一对”；
  3) 已合并成一个横团（宽>高×1.2）的也算一对（两眼相接）；
  4) 出现 ≥2 对且两对纵向间距 > 0.12H → 判为“两对眼睛”，需要重画。

用法：uv run --with numpy --with pillow --with scipy python tools/qc_eyes2.py [--sheet]
输出：out/qc/eyes_check.jpg（红圈标出判定的眼球 + 每张结论）
"""
import json
import pathlib
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
A = MASCOTS
OUT = ROOT / 'out' / 'qc'
OUT.mkdir(parents=True, exist_ok=True)
SHEET = '--sheet' in sys.argv
IDS = ['m0_run', 'm0_cheer', 'm1_run', 'm1_tired', 'm2_win', 'f0_run', 'f0_cheer', 'f1_run', 'f1_tired', 'f2_win']


def candidates(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    g = np.asarray(im.convert('L')).astype(np.float32)
    mx, mn = a.max(2), a.min(2)
    body = ~np.logical_and(mn > 236, (mx - mn) < 12)
    ys, xs = np.nonzero(body)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    W, H = x1 - x0 + 1, y1 - y0 + 1
    dark = body & (g < 80)
    lab, n = ndimage.label(dark)
    out = []
    for i in range(1, n + 1):
        m = lab == i
        area = int(m.sum())
        if area < W * H * 0.0008 or area > W * H * 0.05:
            continue
        my, mxs = np.nonzero(m)
        w, h = mxs.max() - mxs.min() + 1, my.max() - my.min() + 1
        aspect = min(w, h) / max(w, h)
        fill = area / (w * h)
        if aspect < 0.62 or fill < 0.55:
            continue
        r = max(w, h) / 2
        rnd = area / (np.pi * r * r)
        if rnd < 0.62:
            continue
        rel_y = (my.mean() - y0) / H
        if rel_y > 0.56:                     # 眼球在头部，忽略下半身
            continue
        if w > W * 0.26:                     # 太大 = 整块壳/阴影
            continue
        out.append({'x': float(mxs.mean()), 'y': float(my.mean()), 'w': int(w), 'h': int(h), 'area': area,
                    'rel_y': round(float(rel_y), 3), 'flat': w / max(1, h)})
    return im, out, (x0, y0, W, H)


def pairs_of(eyes, H):
    used, pairs = set(), []
    es = sorted(eyes, key=lambda e: -e['area'])
    for i, e in enumerate(es):
        if i in used:
            continue
        for j in range(i + 1, len(es)):
            if j in used:
                continue
            f = es[j]
            if abs(e['w'] - f['w']) > max(e['w'], f['w']) * 0.35:
                continue
            if abs(e['y'] - f['y']) > H * 0.07:
                continue
            gap = abs(e['x'] - f['x'])
            if not (min(e['w'], f['w']) * 0.55 <= gap <= max(e['w'], f['w']) * 3.4):
                continue
            used |= {i, j}
            pairs.append((e, f))
            break
    singles = [e for i, e in enumerate(es) if i not in used]
    merged = [e for e in singles if e['flat'] >= 1.45]
    return pairs, merged


rows, tiles = [], []
for style in ('cartoon', 'navi', 'papercut'):
    for cid in IDS:
        p = A / style / f'{cid}.jpg'
        if not p.exists():
            continue
        im, eyes, (x0, y0, W, H) = candidates(p)
        pairs, merged = pairs_of(eyes, H)
        groups = [float(np.mean([e['y'] for e in pr])) for pr in pairs] + [m['y'] for m in merged]
        if len(groups) >= 2 and max(groups) - min(groups) > H * 0.12:
            verdict = 'TWO_PAIRS'
        elif len(groups) >= 2:
            verdict = 'check'
        elif len(groups) == 1:
            verdict = 'ok'
        else:
            verdict = 'no_eyes_found'
        rows.append({'style': style, 'id': cid, 'verdict': verdict, 'groups': len(groups),
                     'eyes': [{'x': round(e['x']), 'y': round(e['y']), 'w': e['w'], 'flat': round(e['flat'], 2)} for e in eyes]})
        if SHEET:
            t = im.convert('RGB').copy()
            t.thumbnail((520, 520), Image.LANCZOS)
            d = ImageDraw.Draw(t)
            k = t.width / im.width
            for e in eyes:
                d.ellipse([e['x'] * k - e['w'] * k / 2 - 4, e['y'] * k - e['w'] * k / 2 - 4,
                           e['x'] * k + e['w'] * k / 2 + 4, e['y'] * k + e['w'] * k / 2 + 4], outline='#ff0000', width=2)
            d.rectangle([0, 0, t.width, 18], fill='#ffffff')
            d.text((4, 4), f'{style}/{cid}  {verdict}  groups={len(groups)}', fill='#c00')
            tiles.append(t)

if SHEET and tiles:
    cols = 5
    tw, th = max(t.width for t in tiles), max(t.height for t in tiles) + 4
    rws = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * tw, rws * th), '#ffffff')
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
    sheet.save(OUT / 'eyes_check.jpg', quality=90)
    print('saved', OUT / 'eyes_check.jpg', sheet.size)

print('%-9s %-9s %-14s %s' % ('style', 'id', 'verdict', 'groups'))
for r in rows:
    print('%-9s %-9s %-14s %d' % (r['style'], r['id'], r['verdict'], r['groups']))
(OUT / 'eyes.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8')
bad = [f"{r['style']}/{r['id']}" for r in rows if r['verdict'] in ('TWO_PAIRS', 'check')]
print('\n需人眼复核:', bad or 'none')
