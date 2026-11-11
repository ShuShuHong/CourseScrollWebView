"""量“描边有多重 / 有多清新”：黑线占比、饱和度、对比。用来判断出图是不是走了粗描边路线。"""
import glob
import pathlib
import sys

from PIL import Image, ImageStat

ROOT = pathlib.Path(__file__).resolve().parents[1]


def metrics(p):
    im = Image.open(p).convert('RGB')
    g = im.convert('L')
    px = list(g.resize((320, 120)).getdata())
    n = len(px)
    ink = sum(1 for v in px if v < 60) / n                    # 黑线（粗描边的特征）
    hsv = im.convert('HSV').resize((320, 120))
    sat = ImageStat.Stat(hsv).mean[1] / 255                   # 平均饱和度
    st = ImageStat.Stat(g.resize((320, 120)))
    return dict(ink=ink, sat=sat, mean=st.mean[0], sd=st.stddev[0])


def main(globs):
    rows = []
    for pat in globs:
        for p in sorted(glob.glob(str(ROOT / pat))):
            m = metrics(p)
            rows.append((pat, pathlib.Path(p).name, m))
    print(f'{"组":<14}{"文件":<26}{"黑线":>6}{"饱和":>7}{"亮度":>7}{"对比":>7}')
    for pat, name, m in rows:
        print(f'{pat.split("/")[-1] if "/" in pat else pat:<14}{name:<26}{m["ink"]:>6.1%}{m["sat"]:>7.2f}'
              f'{m["mean"]:>7.0f}{m["sd"]:>7.0f}')


if __name__ == '__main__':
    main(sys.argv[1:] or ['assets/landmarks/navi/*.bak', 'assets/landmarks/navi/*.jpg'])
