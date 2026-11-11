"""照片体检 + 智能预裁：决定每张实拍图怎么进 2.66:1 的卡片窗口。（不调 API、不计费）"""
import os
import pathlib
import sys

from PIL import Image, ImageFilter, ImageStat

ROOT = pathlib.Path(__file__).resolve().parents[1]
# 实拍原图目录：命令行参数 > 环境变量 PHOTO_SRC > 当前赛事包 source/实景图/snap
_ACTIVE = (ROOT / 'src' / 'config' / 'active-race.js').read_text(encoding='utf-8')
_pack = (_ACTIVE.split("ACTIVE_RACE = '")[1].split("'")[0]) if "ACTIVE_RACE = '" in _ACTIVE else ''
SRC = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(
    os.environ.get('PHOTO_SRC', ROOT / 'races' / _pack / 'source' / '实景图' / 'snap'))
if not SRC.is_dir():
    raise SystemExit(f'缺少实拍图目录：{SRC}（用参数或 PHOTO_SRC 指定）')
OUT = pathlib.Path('out/cardart/_ref')
WANT = 1600 / 600

MAP = {
    '保圣寺': 'baosi',
    '固城湖大桥': 'bridge',
    '国家城市湿地': 'wetland',
    '老街': 'oldstreet',
    '慢城': 'watertown',
    '水岸滨湖': 'lakepark',
    '水杉': 'sequoia',
}


def energy_rows(im, rows=240):
    """按行统计边缘能量（Sobel 近似的简化版：先模糊再与原图相减）。"""
    g = im.convert('L').resize((400, rows), Image.LANCZOS)
    e = ImageStat.Stat(g.filter(ImageFilter.FIND_EDGES)).mean[0]
    px = g.filter(ImageFilter.FIND_EDGES).load()
    w = 400
    prof = []
    for y in range(rows):
        s = 0
        for x in range(0, w, 2):
            s += px[x, y]
        prof.append(s / (w / 2))
    return prof, e


def choose(im):
    """r = 宽/高。目标 2.66。
    r < 2.66 ⇒ 图比目标“高”，裁上下；r > 2.66 ⇒ 图比目标“宽”，裁左右。
    只在裁完剩下不到 45% 高度时（真正的竖图）改用补边，避免把主体裁没了。
    """
    w, h = im.size
    r = w / h
    if r > WANT:
        nw = round(h * WANT)
        return 'crop', ((w - nw) // 2, 0, (w - nw) // 2 + nw, h), f'裁左右 → 保留宽 {nw / w:.0%}'
    nh = round(w / WANT)
    if nh / h < 0.45:
        return 'pad', (0, 0, w, h), f'竖图 {r:.2f}：补边，不裁'
    prof = energy_rows(im, 200)[0]
    k = len(prof) / h
    nhn = round(nh * k)
    best, bi = -1, 0
    for i in range(0, len(prof) - nhn + 1):
        s = sum(prof[i:i + nhn])
        if s > best:
            best, bi = s, i
    y0 = max(0, min(h - nh, round(bi / k)))
    return 'crop', (0, y0, w, y0 + nh), f'裁上下 → 保留高 {nh / h:.0%}（偏上 {y0 / h:.2f}）'


def pad_wide(im, size=(1600, 600)):
    """竖图/方图：整张放进 2.66:1 画布，两侧用镜像+模糊铺底（不丢主体）。"""
    W, H = size
    bg = im.convert('RGB').resize((H, H), Image.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(18)).resize((W, H))
    fg = im.convert('RGB')
    k = H / fg.height
    if fg.width * k > W:
        k = W / fg.width
    fg = fg.resize((round(fg.width * k), round(fg.height * k)), Image.LANCZOS)
    x = (W - fg.width) // 2
    y = (H - fg.height) // 2
    bg.paste(fg, (x, y))
    return bg


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for p in sorted(SRC.glob('*.png')):
        lid = MAP.get(p.stem)
        if not lid:
            print(f'!! 未知地标 {p.stem}'); continue
        im = Image.open(p).convert('RGB')
        mode, box, why = choose(im)
        if mode == 'pad':
            ref = pad_wide(im)
            note = why
        else:
            ref = im.crop(box)
            ref = ref.resize((1600, 600), Image.LANCZOS)
            note = why + f' 保留高 {box[3] - box[1]}/{im.height} = {(box[3] - box[1]) / im.height:.0%}'
        st = ImageStat.Stat(ref.convert('L'))
        ref.save(OUT / f'{lid}_ref.jpg', quality=94)
        print(f'{p.stem:<8} → {lid:<9} {im.size[0]}×{im.size[1]:<4} {mode:<5} {note:<34} '
              f'亮度 {st.mean[0]:.0f} 对比 {st.stddev[0]:.0f}')


if __name__ == '__main__':
    sys.exit(main())
