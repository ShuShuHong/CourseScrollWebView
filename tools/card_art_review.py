"""图卡出图验收：尺寸 / 与参考图的结构相似度 / 是否有大面积死白死黑；并拼对比图。"""
import pathlib

from PIL import Image, ImageDraw, ImageFont, ImageStat

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'out' / 'cardart'
REF = OUT / '_ref'
REV = ROOT / 'out' / 'review'
IDS = ['baosi', 'museum', 'bridge', 'oldstreet', 'sequoia', 'watertown', 'lakepark', 'wetland']
STYLES = ['cartoon', 'navi', 'papercut']
FONT = None
for cand in ('C:/Windows/Fonts/msyhbd.ttc', 'C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf'):
    if pathlib.Path(cand).exists():
        FONT = ImageFont.truetype(cand, 26)
        break
FONT_S = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 18) if pathlib.Path('C:/Windows/Fonts/msyh.ttc').exists() else FONT


def lum(im, w=64, h=24):
    g = im.convert('L').resize((w, h), Image.LANCZOS)
    return list(g.getdata())


def corr(a, b):
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    va = sum((x - ma) ** 2 for x in a) ** .5
    vb = sum((x - mb) ** 2 for x in b) ** .5
    if not va or not vb:
        return 0.0
    return sum((a[i] - ma) * (b[i] - mb) for i in range(n)) / (va * vb)


def dead(im):
    """极暗 / 极亮像素占比：判断有没有糊成一片或过曝。"""
    g = im.convert('L')
    px = list(g.resize((160, 60)).getdata())
    n = len(px)
    return sum(1 for v in px if v < 12) / n, sum(1 for v in px if v > 250) / n


def main():
    rows = []
    for lid in IDS:
        for s in STYLES:
            f = OUT / f'{lid}_{s}.jpg'
            if not f.exists():
                continue
            im = Image.open(f).convert('RGB')
            r = REF / f'{lid}_ref.jpg'
            c = corr(lum(im), lum(Image.open(r))) if r.exists() else None
            st = ImageStat.Stat(im.convert('L'))
            dk, br = dead(im)
            rows.append((lid, s, im.size, c, st.mean[0], st.stddev[0], dk, br))
            flag = ''
            if c is not None and c < 0.55:
                flag = '  ← 结构偏离参考'
            if br > 0.18:
                flag += '  ← 过曝'
            if dk > 0.30:
                flag += '  ← 死黑'
            print(f'{lid:<9} {s:<9} {im.size[0]}×{im.size[1]}  相关 {"  n/a" if c is None else format(round(c, 2), ">5")}  '
                  f'亮度 {st.mean[0]:3.0f} 对比 {st.stddev[0]:3.0f}  暗区 {dk:.0%} 亮区 {br:.0%}{flag}')
    # 对比图：每行 = 一个地标，上=参考(预裁)，下=出图
    W = 1600
    pad = 34
    tiles = [(lid, s) for lid in IDS for s in STYLES if (OUT / f'{lid}_{s}.jpg').exists()]
    groups = {}
    for lid, s in tiles:
        groups.setdefault(lid, []).append(s)
    hh = 600 + 22
    total_h = sum(pad + hh * (1 + len(v)) + 30 for k, v in groups.items()) + 20
    sheet = Image.new('RGB', (W + 40, total_h), '#101820')
    d = ImageDraw.Draw(sheet)
    y = 16
    for lid, styles in groups.items():
        r = REF / f'{lid}_ref.jpg'
        if r.exists():
            d.text((20, y), f'{lid} · 参考（预裁到 2.66:1）', fill='#7fd3ff', font=FONT_S)
            y += 24
            sheet.paste(Image.open(r).convert('RGB').resize((W, 600)), (20, y))
            y += hh
        for s in styles:
            im = Image.open(OUT / f'{lid}_{s}.jpg').convert('RGB').resize((W, 600))
            d.text((20, y), f'{lid} · {s}', fill='#ffd479', font=FONT_S)
            y += 24
            sheet.paste(im, (20, y))
            y += hh
        y += 30
    REV.mkdir(parents=True, exist_ok=True)
    dst = REV / 'cardart-sheet.jpg'
    sheet.save(dst, quality=88)
    print('\n对比图 →', dst.relative_to(ROOT), f'{sheet.width}×{sheet.height}')
    # 逐张单图也留一份（卡片尺寸 532×200 的 1:1 预览）
    for lid, s, *_ in rows:
        im = Image.open(OUT / f'{lid}_{s}.jpg').convert('RGB').resize((532, 200), Image.LANCZOS)
        im.save(REV / f'card_{lid}_{s}.png')


if __name__ == '__main__':
    main()
