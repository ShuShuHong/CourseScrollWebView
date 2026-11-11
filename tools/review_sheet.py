"""审图用对照表：每套画风一张 JPG（定妆图 + 10 个形态），标注文件名，供人工目视审图。

用法：uv run --with pillow python tools/review_sheet.py
输出：out/review/<style>.jpg
"""
import pathlib
from PIL import Image, ImageDraw, ImageFont
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
A = MASCOTS
OUT = ROOT / 'out' / 'review'
OUT.mkdir(parents=True, exist_ok=True)

IDS = [
    ('m0_run', '公 Lv1 奔跑'), ('m0_cheer', '公 Lv1 欢呼'), ('m1_run', '公 Lv2 奔跑'),
    ('m1_tired', '公 Lv2 疲惫'), ('m2_win', '公 Lv3 蟹王'),
    ('f0_run', '母 Lv1 奔跑'), ('f0_cheer', '母 Lv1 欢呼'), ('f1_run', '母 Lv2 奔跑'),
    ('f1_tired', '母 Lv2 疲惫'), ('f2_win', '母 Lv3 蟹后'),
]
STYLES = [('cartoon', 'A · 卡通'), ('navi', 'B · 导航地图'), ('papercut', 'C · 剪纸')]

try:
    FONT = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 26)
    FONT_S = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 20)
except Exception:
    FONT = FONT_S = ImageFont.load_default()

TILE = 430
COLS = 5
PAD = 18
TOP = 96

for style, label in STYLES:
    rows = []
    for group, tag in ((IDS[:5], '公蟹 · 全马'), (IDS[5:], '母蟹 · 半马')):
        tiles = []
        for cid, cap in group:
            p = A / style / f'{cid}.jpg'
            if not p.exists():
                continue
            im = Image.open(p).convert('RGB')
            im.thumbnail((TILE, TILE), Image.LANCZOS)
            tiles.append((im, f'{cid}\n{cap}'))
        rows.append((tag, tiles))

    master_p = A / style / 'master.jpg'
    master = Image.open(master_p).convert('RGB') if master_p.exists() else None
    if master:
        master.thumbnail((COLS * TILE, 620), Image.LANCZOS)

    W = COLS * TILE + PAD * 2
    H = TOP + (master.height + 46 if master else 0) + len(rows) * (TILE + 52) + PAD
    sheet = Image.new('RGB', (W, H), '#ffffff')
    d = ImageDraw.Draw(sheet)
    d.text((PAD, 22), f'2026 高淳马拉松 · 螃蟹角色审图 · {label}', font=FONT, fill='#111')
    d.text((PAD, 60), '上：定妆图（公母并排，作为全部形态的参考基准）　下：10 个单只形态（AI 生成 / RunningHub seedream-v5-pro）', font=FONT_S, fill='#666')

    y = TOP
    if master:
        sheet.paste(master, ((W - master.width) // 2, y + 40))
        y += master.height + 46
    for tag, tiles in rows:
        d.text((PAD, y + 6), tag, font=FONT_S, fill='#1475D9')
        y += 34
        for i, (im, cap) in enumerate(tiles):
            x = PAD + i * TILE + (TILE - im.width) // 2
            sheet.paste(im, (x, y + 8))
            d.text((PAD + i * TILE + 8, y + TILE - 4), cap, font=FONT_S, fill='#333')
        y += TILE + 26
    sheet.save(OUT / f'{style}.jpg', quality=92)
    print('saved', OUT / f'{style}.jpg', sheet.size)
