"""腹部“花纹”量化：同一风格里 Lv2 与 Lv3 的腹甲应当是同一块素色奶白。

指标（只在腹部区域内、alpha>200 的像素上统计）：
  novelty  非“腹甲主色”的像素占比 —— 花纹/徽章/垂饰越多越高
  tex      高频纹理强度（原图减去中值模糊后的平均绝对差）
  ncol     量化后出现的颜色数

用法：uv run --with numpy --with pillow --with scipy python tools/qc_belly.py
"""
import json
import pathlib
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
A = MASCOTS
OUT = ROOT / 'out' / 'qc'
OUT.mkdir(parents=True, exist_ok=True)


def belly_box(im):
    al = np.asarray(im)[:, :, 3]
    ys, xs = np.nonzero(al > 128)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    w, h = x1 - x0 + 1, y1 - y0 + 1
    return (int(x0 + w * 0.30), int(y0 + h * 0.42), int(x0 + w * 0.70), int(y0 + h * 0.68))


def measure(im, ref_color=None):
    crop = im.crop(belly_box(im))
    a = np.asarray(crop).astype(np.float32)
    rgb, al = a[:, :, :3], a[:, :, 3]
    m = al > 200
    px = rgb[m]
    if len(px) < 80:
        return None
    # 主色（腹甲色）：最亮的 25% 像素的均值
    lum = px.mean(1)
    base = px[lum >= np.quantile(lum, 0.75)].mean(0)
    if ref_color is not None:
        base = np.array(ref_color, dtype=np.float32)
    dist = np.linalg.norm(px - base, axis=1)
    novelty = float((dist > 46).mean())
    ncol = int(len(np.unique((px // 32).astype(np.int16) @ np.array([1, 10, 100]))))
    g = Image.fromarray(np.asarray(crop.convert('L'))).filter(ImageFilter.MedianFilter(5))
    d = np.abs(np.asarray(crop.convert('L')).astype(np.float32) - np.asarray(g).astype(np.float32))[m]
    tex = float(d.mean())
    return {'base': [int(v) for v in base], 'novelty': round(novelty, 3), 'tex': round(tex, 2), 'ncol': ncol, 'n': int(m.sum())}


res = {}
for style in ('cartoon', 'navi', 'papercut'):
    for sex in ('f', 'm'):
        ref = None
        for cid in [f'{sex}{i}_{m}' for i in range(3) for m in ('run', 'tired', 'cheer', 'win')]:
            p = A / style / 'cut' / f'{cid}.png'
            if not p.exists():
                continue
            im = Image.open(p)
            r = measure(im, ref)
            if r is None:
                continue
            if ref is None and cid.startswith(f'{sex}1'):
                ref = r['base']          # 以 Lv2 的腹甲色为基准
            res[f'{style}/{cid}'] = r
            print('%-22s base #%02X%02X%02X  novelty %.3f  tex %5.2f  ncol %3d' % (
                f'{style}/{cid}', r['base'][0], r['base'][1], r['base'][2], r['novelty'], r['tex'], r['ncol']))
    print('-')
(OUT / 'belly.json').write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf-8')
