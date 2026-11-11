"""足部前后对照：上一版（_work/backup/v3/navi）vs 现在，只看下半身。

用法：uv run --with numpy --with pillow --with scipy python tools/review_legs_ba.py
输出：out/review/legs_before_after.jpg（每行一个形态：左=上一版，右=现在）
"""
import pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
A = MASCOTS / 'navi'
OLD = ROOT / '_work' / 'backup' / 'v3' / 'navi'
OUT = ROOT / 'out' / 'review'
OUT.mkdir(parents=True, exist_ok=True)
IDS = ['m0_cheer', 'm1_run', 'm1_tired', 'm2_win', 'f0_cheer', 'f1_run', 'f1_tired', 'f2_win']
try:
    F = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 20)
except Exception:
    F = ImageFont.load_default()


def lower(path, W=380, H=300):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    mx, mn = a.max(2), a.min(2)
    fg = ~np.logical_and(mn > 234, (mx - mn) < 14)
    lab, n = ndimage.label(fg)
    if n > 1:
        s = ndimage.sum(fg, lab, range(1, n + 1))
        fg = lab == (int(np.argmax(s)) + 1)
    ys, xs = np.nonzero(fg)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    h = y1 - y0 + 1
    crop = im.crop((x0, int(y0 + h * 0.52), x1 + 1, y1 + 1))
    crop.thumbnail((W, H), Image.LANCZOS)
    t = Image.new('RGB', (W, H + 26), '#ffffff')
    t.paste(crop, ((W - crop.width) // 2, 24))
    return t


cols = 8
tw, th = 380, 326
sheet = Image.new('RGB', (cols * tw + 20, 2 * th + 60), '#ffffff')
d = ImageDraw.Draw(sheet)
d.text((10, 10), 'B · 导航地图 · 足部前后对照（上：上一版　下：现在）', font=F, fill='#111')
for i, cid in enumerate(IDS):
    for r, (base, tag) in enumerate(((OLD, '旧'), (A, '新'))):
        p = base / f'{cid}.jpg'
        if not p.exists():
            continue
        t = lower(p)
        sheet.paste(t, (10 + i * tw, 40 + r * th))
        d.text((16 + i * tw, 44 + r * th), f'{cid} · {tag}', font=F, fill='#c00' if tag == '旧' else '#080')
sheet.save(OUT / 'legs_before_after.jpg', quality=92)
print('saved', OUT / 'legs_before_after.jpg', sheet.size)
