"""
运动序列总览图：每个形象一行（4 帧 × 缩放），底部标注 id 与帧数。
  uv run --with pillow python tools/sheet_seq.py navi
输出 out/review/seq_all_<style>.jpg
"""
import json
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
style = sys.argv[1] if len(sys.argv) > 1 else 'navi'
cut = json.loads((MASCOTS / 'cut.json').read_text(encoding='utf-8'))
seqs = (cut.get('seq') or {}).get(style) or {}
OUT = ROOT / 'out' / 'review'
OUT.mkdir(parents=True, exist_ok=True)
ORDER = ['m0_run', 'm0_cheer', 'm1_run', 'm1_tired', 'm2_win',
         'f0_run', 'f0_cheer', 'f1_run', 'f1_tired', 'f2_win']
ids = [i for i in ORDER if i in seqs] or sorted(seqs)
if not ids:
    sys.exit('没有序列可画')

try:
    F = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 20)
    FB = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 24)
except Exception:
    F = FB = ImageFont.load_default()

TH = 190          # 每帧显示高度
LAB = 34
rows = []
for cid in ids:
    frames = seqs[cid]
    ims = []
    for fr in frames:
        p = MASCOTS / fr['file']
        if not p.exists():
            continue
        im = Image.open(p)
        ims.append(im.resize((round(im.width * TH / im.height), TH), Image.LANCZOS))
    if ims:
        rows.append((cid, ims))

cw = max(sum(i.width for i in ims) + 12 * (len(ims) - 1) for _, ims in rows)
W = cw + 210
Hh = LAB + sum(TH + 16 for _ in rows) + 50
sheet = Image.new('RGB', (W, Hh), 'white')
d = ImageDraw.Draw(sheet)
d.text((18, 12), f'运动序列 · {style} · {len(rows)} 个形象 × 4 帧', font=FB, fill=(20, 30, 50))
y = 50
for cid, ims in rows:
    d.text((18, y + TH // 2 - 12), cid, font=FB, fill=(30, 60, 140))
    x = 200
    for im in ims:
        # 浅格底
        d.rectangle([x, y, x + im.width, y + TH], fill=(243, 246, 250))
        sheet.paste(im, (x, y), im)
        x += im.width + 12
    y += TH + 16
sheet.save(OUT / f'seq_all_{style}.jpg', quality=92)
print('saved', OUT / f'seq_all_{style}.jpg', sheet.size)
