"""体型一致性自检：把同一性别各形态的“身体”轮廓/配色/尺寸与已通过的基础形象对比。

思路：
  · 用“近白去除 + 最大连通域”得到角色剪影；
  · 归一到同一高度后比较：宽度比、圆度（面积/外接矩形）、上半身与下半身宽比；
  · 再把“被服装遮挡”的部分排除：只在包围盒的下部 45%（腿与腹）比轮廓，披风主要影响上部。
  · 结果给出一张归一化剪影叠图（红=基础形象，蓝=当前形态），重叠度越高越好。

用法：uv run --with numpy --with pillow --with scipy python tools/qc_body.py [style]
输出：out/qc/body_<style>.jpg + stdout 表格
"""
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
STYLE = sys.argv[1] if len(sys.argv) > 1 else 'navi'
IDS = ['m0_run', 'm0_cheer', 'm1_run', 'm1_tired', 'm2_win', 'f0_run', 'f0_cheer', 'f1_run', 'f1_tired', 'f2_win']
N = 256


def silo(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    mx, mn = a.max(2), a.min(2)
    fg = ~np.logical_and(mn > 234, (mx - mn) < 14)
    lab, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        fg = lab == (int(np.argmax(sizes)) + 1)
    fg = ndimage.binary_fill_holes(fg)
    ys, xs = np.nonzero(fg)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    crop = im.crop(box)
    m = Image.fromarray((fg[box[1]:box[3], box[0]:box[2]] * 255).astype(np.uint8))
    # 归一：高度固定，宽度按等比（保留真实胖瘦比）
    h = N
    w = max(8, round(crop.width * N / crop.height))
    crop = crop.resize((w, h), Image.LANCZOS)
    m = m.resize((w, h), Image.LANCZOS)
    canvas_m = Image.new('L', (N * 2, N), 0)
    canvas_c = Image.new('RGB', (N * 2, N), 'white')
    ox = (N * 2 - w) // 2
    canvas_m.paste(m, (ox, 0))
    canvas_c.paste(crop, (ox, 0))
    return np.asarray(canvas_m) > 128, canvas_c, w


def feats(mask, w):
    ys, xs = np.nonzero(mask)
    H = ys.max() - ys.min() + 1
    area = mask.sum()
    # 下部 45%（腿/腹）宽度
    low = mask[int(ys.min() + H * 0.55):ys.max() + 1]
    loww = (low.any(0).sum()) if low.size else 0
    upp = mask[ys.min():int(ys.min() + H * 0.45)]
    upw = (upp.any(0).sum()) if upp.size else 0
    return {'aspect': round(w / H, 3), 'fill': round(float(area / (w * H)), 3),
            'lowW': round(loww / H, 3), 'upW': round(upw / H, 3), 'w': w}


rows, tiles = [], []
for sex in ('m', 'f'):
    base_id = f'{sex}0_run'
    bmask, bimg, bw = silo(A / STYLE / f'{base_id}.jpg')
    bf = feats(bmask, bw)
    for cid in [i for i in IDS if i.startswith(sex)]:
        p = A / STYLE / f'{cid}.jpg'
        if not p.exists():
            continue
        m, img, w = silo(p)
        f = feats(m, w)
        iou = float((m & bmask).sum() / max(1, (m | bmask).sum()))
        rows.append({'style': STYLE, 'id': cid, 'iou': round(iou, 3), 'aspect': f['aspect'],
                     'base_aspect': bf['aspect'], 'lowW': f['lowW'], 'base_lowW': bf['lowW'],
                     'upW': f['upW'], 'base_upW': bf['upW']})
        # 叠图
        vis = Image.new('RGB', (N * 2, N), 'white')
        arr = np.full((N, N * 2, 3), 255, np.uint8)
        arr[bmask] = [255, 120, 120]
        arr[m] = np.where(bmask[m][:, None], [150, 120, 220], [120, 150, 255])
        vis = Image.fromarray(arr)
        d = ImageDraw.Draw(vis)
        d.text((4, 4), f'{cid}  IoU {iou:.2f}', fill='#000')
        tiles.append(vis)

cols = 5
tw, th = tiles[0].width, tiles[0].height
rws = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rws * th), 'white')
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
sheet.save(OUT / f'body_{STYLE}.jpg', quality=90)
print('saved', OUT / f'body_{STYLE}.jpg', sheet.size)
print('%-9s %6s %7s %7s %7s %7s %7s' % ('id', 'IoU', 'aspect', 'base', 'lowW', 'base', 'upW'))
for r in rows:
    print('%-9s %6.3f %7.3f %7.3f %7.3f %7.3f %7.3f' % (r['id'], r['iou'], r['aspect'], r['base_aspect'],
                                                       r['lowW'], r['base_lowW'], r['upW']))
