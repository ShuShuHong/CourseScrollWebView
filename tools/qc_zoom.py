"""把可疑区域放大，便于人眼确认“是不是第二对眼睛”。

用法：uv run --with numpy --with pillow python tools/qc_zoom.py <style> <id> [x y r] ...
不带坐标时，自动取 qc_eyes 判定的候选眼球逐个放大。
输出：out/review/zoom_<style>_<id>.jpg
"""
import json
import pathlib
import sys
from PIL import Image, ImageDraw, ImageFont
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
A = MASCOTS
OUT = ROOT / 'out' / 'review'
OUT.mkdir(parents=True, exist_ok=True)
try:
    FONT = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 22)
except Exception:
    FONT = ImageFont.load_default()

style, cid = sys.argv[1], sys.argv[2]
img = Image.open(A / style / f'{cid}.jpg').convert('RGB')
rows = json.loads((ROOT / 'out/qc/eyes.json').read_text(encoding='utf-8'))
eyes = [e for r in rows if r['style'] == style and r['id'] == cid for e in r['eyes']]
if len(sys.argv) >= 5:
    x, y, rad = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
    boxes = [(x - rad, y - rad, x + rad, y + rad)]
else:
    boxes = [(e['x'] - e['w'], e['y'] - e['w'], e['x'] + e['w'], e['y'] + e['w']) for e in eyes]

S = 320
sheet = Image.new('RGB', (S * max(1, len(boxes)) + 20, S + 40), '#ffffff')
d = ImageDraw.Draw(sheet)
for i, b in enumerate(boxes):
    b = (max(0, b[0]), max(0, b[1]), min(img.width, b[2]), min(img.height, b[3]))
    crop = img.crop(b).resize((S, S), Image.LANCZOS)
    sheet.paste(crop, (10 + i * S, 34))
    d.rectangle([10 + i * S, 34, 10 + i * S + S - 1, 34 + S - 1], outline='#dddddd')
    d.text((10 + i * S, 8), f'候选 {i + 1}  ({b[0]},{b[1]})-({b[2]},{b[3]})', font=FONT, fill='#111')
out = OUT / f'zoom_{style}_{cid}.jpg'
sheet.save(out, quality=94)
print('saved', out, sheet.size)
