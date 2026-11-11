"""
白底角色图 → 透明 PNG（抠图 + 裁边 + 统一尺寸）→ races/<id>/mascots/<style>/cut/<id>.png，并写 races/<id>/mascots/cut.json（锚点、尺寸）

方法：从四边做“近白色”泛洪填充得到背景，角色内部的白色（眼白、肚皮）不会被误删；
边缘做 1px 羽化 + 去白边（颜色向内收）。锚点 = 角色最低不透明像素的中点（脚底）。

用法：uv run --with numpy --with pillow --with scipy python tools/cutout.py [style ...]
"""
import json, pathlib, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from mascot_path import MASCOTS, CUT_JSON  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = MASCOTS
OUT_H = 720          # 统一输出高度（角色包围盒）
PAD = 16


def strip_bands(fg, sat, lum):
    """剔除下半部的低饱和长横条（AI 顺手画的地面阴影 / 文字水印）。

    主角色的描边是细线，单行连续长度远小于角色宽度的 10%，所以不会被误删；
    地面投影是一条横贯角色的灰色长带，能被稳定识别。
    """
    ys, xs = np.nonzero(fg)
    if len(ys) == 0:
        return fg, 0
    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())
    W, H = x1 - x0 + 1, y1 - y0 + 1
    low = fg & (sat < 34) & (lum < 248)
    if not low.any():
        return fg, 0
    drop = np.zeros_like(fg)
    thr = max(40, int(W * 0.25))
    for y in range(y0 + int(H * 0.92), y1 + 1):
        row = np.nonzero(low[y])[0]
        if len(row) < thr:
            continue
        breaks = np.nonzero(np.diff(row) > 3)[0]
        starts = np.r_[0, breaks + 1]
        ends = np.r_[breaks, len(row) - 1]
        for s, e in zip(starts, ends):
            a, b = row[s], row[e]
            if b - a + 1 >= thr:
                drop[y, a:b + 1] = True
    return fg & ~drop, int(drop.sum())


def cut(path: pathlib.Path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    # “近白”：亮且低饱和
    mx, mn = a.max(2), a.min(2)
    sat, lum = (mx - mn), a.mean(2)
    whiteish = (mn > 228) & (sat < 22)
    # 从边框泛洪
    lab, n = ndimage.label(whiteish)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # 背景里允许有轻微灰度阴影：再把与背景相连、亮度>205 的低饱和像素并进来
    soft = (mn > 205) & (sat < 26)
    lab2, _ = ndimage.label(soft | bg)
    b2 = set(np.unique(lab2[bg])) - {0}
    bg = np.isin(lab2, list(b2))
    fg = ~bg
    # 去掉小碎块（保留最大连通 + 面积>0.4% 的块，例如分离的爪子）
    lab3, n3 = ndimage.label(fg)
    if n3 > 1:
        sizes = ndimage.sum(fg, lab3, range(1, n3 + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s > fg.sum() * 0.004]
        fg = np.isin(lab3, keep)
    fg = ndimage.binary_fill_holes(fg) | fg
    # 去掉脚下阴影 / 文字水印带（剔除过猛就放弃这步）
    fg2, dropped = strip_bands(fg, sat, lum)
    if fg2.sum() > fg.sum() * 0.5:
        fg = fg2
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.9))
    # 去白边：边缘像素向前景内部颜色靠拢
    rgb = np.asarray(im).astype(np.float32)
    inner = ndimage.binary_erosion(fg, iterations=2)
    idx = ndimage.distance_transform_edt(~inner, return_distances=False, return_indices=True)
    edge = fg & ~inner
    rgb[edge] = rgb[idx[0][edge], idx[1][edge]]
    out = Image.fromarray(rgb.clip(0, 255).astype(np.uint8)).convert('RGBA')
    out.putalpha(alpha)
    ys, xs = np.nonzero(fg)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    out = out.crop((max(0, x0 - PAD), max(0, y0 - PAD), min(im.width, x1 + PAD), min(im.height, y1 + PAD)))
    s = OUT_H / out.height
    out = out.resize((round(out.width * s), OUT_H), Image.LANCZOS)
    # 脚底锚点：最低 3% 行里不透明像素的 x 中位
    A = np.asarray(out)[:, :, 3]
    rows = np.nonzero(A.max(1) > 128)[0]
    yb = rows.max()
    band = A[max(0, yb - int(out.height * 0.06)):yb + 1] > 128
    xs2 = np.nonzero(band.any(0))[0]
    ax = float(np.median(xs2)) if len(xs2) else out.width / 2
    # 视觉中心（用于左右翻转）：不透明像素 x 均值
    cx = float(np.nonzero(A > 128)[1].mean())
    return out, {'w': out.width, 'h': out.height, 'ax': round(ax / out.width, 4), 'ay': round((yb + 1) / out.height, 4), 'cx': round(cx / out.width, 4), '_drop': dropped}


def main():
    styles = sys.argv[1:] or [p.name for p in SRC.iterdir() if p.is_dir()]
    meta_p = CUT_JSON
    meta = json.loads(meta_p.read_text(encoding='utf-8')) if meta_p.exists() else {}
    for s in styles:
        d = SRC / s
        (d / 'cut').mkdir(exist_ok=True)
        for f in sorted(d.glob('*.jpg')):
            if f.stem == 'master':
                continue
            out, m = cut(f)
            dest = d / 'cut' / (f.stem + '.png')
            out.save(dest, optimize=True)
            meta[f'{s}/{f.stem}'] = {k: v for k, v in m.items() if not k.startswith('_')}
            print(s, f.stem, m, ('band -%d px' % m.get('_drop', 0)) if m.get('_drop') else '', flush=True)
    meta_p.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
