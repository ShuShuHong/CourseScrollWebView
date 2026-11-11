"""定点修图后的前后对比：把“参考形态 / 修改前 / 修改后”并排摆出来，并量腹部配色。

用法：uv run --with numpy --with pillow python tools/qc_fix.py [id]（默认 f2_win）
输出：out/qc/fix_<style>.jpg（全身 + 腹部特写），stdout 腹部主色对比。
"""
import glob
import json
import pathlib
import sys
import numpy as np
from PIL import Image, ImageDraw
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
A = MASCOTS
OUT = ROOT / 'out' / 'qc'
OUT.mkdir(parents=True, exist_ok=True)
VID = sys.argv[1] if len(sys.argv) > 1 else 'f2_win'
SEX = VID[0]


def belly_colors(im, n=3):
    al = np.asarray(im)[:, :, 3]
    ys, xs = np.nonzero(al > 128)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    w, h = x1 - x0 + 1, y1 - y0 + 1
    crop = im.crop((int(x0 + w * 0.27), int(y0 + h * 0.38), int(x0 + w * 0.73), int(y0 + h * 0.70)))
    a = np.asarray(crop).astype(np.float32)
    m = a[:, :, 3] > 200
    px = a[:, :, :3][m]
    if len(px) < 50:
        return [], crop
    q = (px // 32).astype(np.int16)
    key = q[:, 0] * 100 + q[:, 1] * 10 + q[:, 2]
    vals, cnt = np.unique(key, return_counts=True)
    order = np.argsort(cnt)[::-1][:n]
    return [(tuple(int(v) for v in px[key == vals[i]].mean(0)), round(float(cnt[i] / len(px)), 2)) for i in order], crop


rows = []
for style in ('cartoon', 'navi', 'papercut'):
    cur = A / style / 'cut' / f'{VID}.png'
    ref = A / style / 'cut' / f'{SEX}1_run.png'
    baks = sorted(glob.glob(str(ROOT / '_work' / 'backup' / style / f'{VID}_*.jpg')))
    if not cur.exists() or not ref.exists():
        print('skip', style, '缺 cut 图')
        continue
    panels = [('参考 Lv2', Image.open(ref)), ('修改前', Image.open(baks[-1]) if baks else None), ('修改后', Image.open(cur))]
    panels = [(t, im) for t, im in panels if im is not None]
    # 全身一排
    H = 620
    ims = []
    for t, im in panels:
        im2 = im.convert('RGBA')
        if im2.height != H:
            im2 = im2.resize((round(im2.width * H / im2.height), H), Image.LANCZOS)
        ims.append((t, im2))
    W = sum(i.width for _, i in ims) + 20 * (len(ims) + 1)
    sheet = Image.new('RGB', (W, H + 60), '#ffffff')
    d = ImageDraw.Draw(sheet)
    x = 20
    for t, im in ims:
        sheet.paste(im, (x, 40), im)
        d.text((x, 14), f'{style} · {t}', fill='#111')
        x += im.width + 20
    # 腹部一排
    belly = []
    for t, im in panels:
        cols, crop = belly_colors(im.convert('RGBA'))
        crop = crop.convert('RGB')
        belly.append((t, crop, cols))
        rows.append({'style': style, 'panel': t, 'colors': cols})
    bw = max(c.width for _, c, _ in belly)
    bh = max(c.height for _, c, _ in belly)
    bsheet = Image.new('RGB', (bw * len(belly) + 20, bh + 60), '#f4f4f4')
    db = ImageDraw.Draw(bsheet)
    for i, (t, crop, cols) in enumerate(belly):
        bsheet.paste(crop, (i * bw + 10, 40))
        db.text((i * bw + 12, 14), t + '  腹部', fill='#111')
        db.text((i * bw + 12, bh + 44), ' '.join('#%02X%02X%02X' % c for c, _ in cols), fill='#333')
    both = Image.new('RGB', (max(sheet.width, bsheet.width), sheet.height + bsheet.height), '#ffffff')
    both.paste(sheet, (0, 0))
    both.paste(bsheet, (0, sheet.height))
    both.save(OUT / f'fix_{style}.jpg', quality=92)
    print('saved', OUT / f'fix_{style}.jpg')

for s in ('cartoon', 'navi', 'papercut'):
    for r in [r for r in rows if r['style'] == s]:
        print('%-9s %-6s %s' % (s, r['panel'], ' '.join('#%02X%02X%02X(%.2f)' % (c[0][0], c[0][1], c[0][2], c[1]) for c in r['colors'])))
(OUT / 'fix_colors.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8')
