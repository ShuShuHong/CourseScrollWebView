"""足部一致性自检：量每张图的「脚」——触地足数、腿的粗细、腿的分布宽度、腿色。

方法（纯几何，不依赖模型）：
  1) 取剪影（最大连通域 + 填洞）；
  2) 触地足数：在最底 3 行里按间隙切开，得到若干个“着地点”，过滤掉过小的碎点；
  3) 腿宽：在 72%/80%/88% 体高三条横线上，统计“窄条段”的宽度中位数；
  4) 腿展宽：这三条横线上剪影的横向跨度；
  5) 腿色：体高下方 35% 区域的主色（量化后前三名 + 与基础图的色差）。

用法：uv run --with numpy --with pillow --with scipy python tools/qc_legs.py navi
输出：out/qc/legs_<style>.jpg（腿部放大）+ stdout 表格
"""
import json
import pathlib
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
A = MASCOTS
OUT = ROOT / 'out' / 'qc'
OUT.mkdir(parents=True, exist_ok=True)
STYLE = sys.argv[1] if len(sys.argv) > 1 else 'navi'
IDS = ['m0_run', 'm0_cheer', 'm1_run', 'm1_tired', 'm2_win',
       'f0_run', 'f0_cheer', 'f1_run', 'f1_tired', 'f2_win']
try:
    F = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 18)
except Exception:
    F = ImageFont.load_default()


def silhouette(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    mx, mn = a.max(2), a.min(2)
    fg = ~np.logical_and(mn > 234, (mx - mn) < 14)
    lab, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        fg = lab == (int(np.argmax(sizes)) + 1)
    fg = ndimage.binary_fill_holes(fg)
    return im, fg


def runs_of(row):
    idx = np.nonzero(row)[0]
    if len(idx) == 0:
        return []
    br = np.nonzero(np.diff(idx) > 2)[0]
    starts = np.r_[0, br + 1]
    ends = np.r_[br, len(idx) - 1]
    return [(int(idx[s]), int(idx[e])) for s, e in zip(starts, ends)]


def measure(path):
    im, fg = silhouette(path)
    ys, xs = np.nonzero(fg)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    W, H = x1 - x0 + 1, y1 - y0 + 1
    sub = fg[y0:y1 + 1, x0:x1 + 1]
    # ① 触地足：最底 3 行
    bottom = sub[-3:].any(0)
    feet = [r for r in runs_of(bottom) if (r[1] - r[0] + 1) > W * 0.012]
    # ② 三条横线上的窄条（腿）
    legw, spans = [], []
    for frac in (0.72, 0.80, 0.88):
        y = int(H * frac)
        if y >= H:
            continue
        rr = runs_of(sub[y])
        thin = [r[1] - r[0] + 1 for r in rr if (r[1] - r[0] + 1) <= W * 0.10]
        legw += thin
        if rr:
            spans.append((rr[0][0], rr[-1][1]))
    legspan = np.mean([(b - a + 1) / W for a, b in spans]) if spans else 0
    # ③ 腿色（下方 35%，排除靠中间的身体主体）
    band = np.zeros_like(sub)
    band[int(H * 0.65):, :] = True
    band[:, int(W * 0.30):int(W * 0.70)] = False       # 去掉肚子中线（身体主体）
    m = band & sub
    a = np.asarray(im.crop((x0, y0, x1 + 1, y1 + 1))).astype(np.float32)
    px = a[m][:, :3] if m.any() else np.zeros((0, 3))
    col = px.mean(0).astype(int).tolist() if len(px) else [0, 0, 0]
    q = (px // 32).astype(np.int16) if len(px) else np.zeros((0, 3), np.int16)
    tops = []
    if len(q):
        k = q[:, 0] * 100 + q[:, 1] * 10 + q[:, 2]
        v, c = np.unique(k, return_counts=True)
        for i in np.argsort(c)[::-1][:3]:
            mm = k == v[i]
            top = px[mm].mean(0).astype(int)
            tops.append('#%02X%02X%02X %d%%' % (top[0], top[1], top[2], round(100 * c[i] / len(px))))
    return {
        'feet': len(feet), 'feet_w': [round((b - a + 1) / W, 3) for a, b in feet],
        'legW': round(float(np.median(legw)) / W, 3) if legw else None,
        'legN': len(legw),
        'legSpan': round(float(legspan), 3),
        'legColor': col, 'tops': tops,
        'legLen': round(1 - legY(sub, W, H), 3),
        'crop': (x0, y0, x1, y1),
    }


def legY(sub, W, H):
    """腿的起点：从下往上扫，第一条“宽度骤减到 < 45% 体宽”的行。"""
    for y in range(H - 1, int(H * 0.35), -1):
        r = np.nonzero(sub[y])[0]
        if len(r) == 0:
            continue
        span = (r.max() - r.min() + 1) / W
        if span < 0.45:
            return y / H
    return 0.6


rows, tiles = [], []
for cid in IDS:
    p = A / STYLE / f'{cid}.jpg'
    if not p.exists():
        continue
    m = measure(p)
    rows.append({'id': cid, **{k: v for k, v in m.items() if k != 'crop'}})
    # 腿裁图（下方 42%）
    im = Image.open(p).convert('RGB')
    x0, y0, x1, y1 = m['crop']
    Hh = y1 - y0 + 1
    crop = im.crop((x0, int(y0 + Hh * 0.55), x1 + 1, y1 + 1))
    crop.thumbnail((380, 260), Image.LANCZOS)
    t = Image.new('RGB', (400, 300), 'white')
    t.paste(crop, ((400 - crop.width) // 2, 30))
    d = ImageDraw.Draw(t)
    d.text((6, 6), f'{cid}  feet={m["feet"]} legW={m["legW"]}', font=F, fill='#c00')
    tiles.append(t)

base = {r['id']: r for r in rows}
print('%-9s %5s %-9s %5s %6s %6s %-22s %s' % ('id', 'feet', 'footW', 'legN', 'legW', 'span', 'legColor', 'top3'))
for r in rows:
    print('%-9s %5d %-9s %5d %6s %6.3f #%02X%02X%02X            %s' % (
        r['id'], r['feet'], ','.join(f'{w:.2f}' for w in r['feet_w'])[:9], r['legN'],
        f"{r['legW']:.3f}" if r['legW'] else '-', r['legSpan'], *r['legColor'], ' | '.join(r['tops'])))

cols = 5
tw, th = tiles[0].width, tiles[0].height
rws = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rws * th), 'white')
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
sheet.save(OUT / f'legs_{STYLE}.jpg', quality=92)
print('saved', OUT / f'legs_{STYLE}.jpg', sheet.size)

# 与基础形象的偏差（同性别）
print('\n与基础形象的偏差（足数差 / 腿宽比 / 腿展宽比 / 腿色差）:')
for sex in ('m', 'f'):
    b = base.get(f'{sex}0_run')
    if not b:
        continue
    for r in [x for x in rows if x['id'].startswith(sex)]:
        dw = (r['legW'] / b['legW']) if (r['legW'] and b['legW']) else None
        dc = float(np.abs(np.array(r['legColor']) - np.array(b['legColor'])).mean())
        print('  %-9s 足数 %+d   腿宽 ×%s   展宽 ×%.2f   色差 %.1f' % (
            r['id'], r['feet'] - b['feet'], f'{dw:.2f}' if dw else '-', r['legSpan'] / b['legSpan'], dc))

(OUT / f'legs_{STYLE}.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8')
