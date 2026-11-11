"""把“逐条字幕实拍截图”拼成一张审阅图（4 列），每格标注入点与字幕文字。

用法：uv run --with pillow python tools/sheet_subs.py navi
输出：out/review/subs_<style>_sheet.jpg
"""
import json
import pathlib
import re
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
STYLE = sys.argv[1] if len(sys.argv) > 1 else 'navi'
DIR = ROOT / 'out' / 'review' / f'subs_{STYLE}'
SUBS = json.loads((ROOT / '_work/subs.json').read_text(encoding='utf-8'))
try:
    F = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 22)
except Exception:
    F = ImageFont.load_default()

W, H = 640, 360
COLS = 4
tiles = []
for i, s in enumerate(SUBS):
    p = DIR / f's{i + 1:02d}_{s["t"]:.1f}s.png'
    if not p.exists():
        continue
    im = Image.open(p).convert('RGB').resize((W, H), Image.LANCZOS)
    t = Image.new('RGB', (W, H + 30), '#ffffff')
    t.paste(im, (0, 30))
    d = ImageDraw.Draw(t)
    d.text((8, 4), f'{i + 1:02d}  {s["t"]:.1f}s→{s["t"] + s["d"]:.1f}s   {s["text"]}', font=F, fill='#111')
    tiles.append(t)

rows = (len(tiles) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * W, rows * (H + 30)), '#ffffff')
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % COLS) * W, (i // COLS) * (H + 30)))
out = ROOT / 'out' / 'review' / f'subs_{STYLE}_sheet.jpg'
sheet.save(out, quality=88)
print('saved', out, sheet.size, len(tiles), 'tiles')
