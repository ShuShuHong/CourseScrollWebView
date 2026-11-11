"""生成“萌化前后”三套角色形象对照表（每套两行：旧 / 新，10 个形态并排）。

用法：uv run --with numpy --with pillow python tools/qc_sheet.py
输出：out/qc/v2_sheet_<style>.jpg
"""
import pathlib
from PIL import Image, ImageDraw
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
A = MASCOTS
OLD = ROOT / '_work' / 'backup' / 'v1'
OUT = ROOT / 'out' / 'qc'
OUT.mkdir(parents=True, exist_ok=True)
IDS = ['m0_run', 'm0_cheer', 'm1_run', 'm1_tired', 'm2_win', 'f0_run', 'f0_cheer', 'f1_run', 'f1_tired', 'f2_win']
STYLES = [('cartoon', 'A · 卡通'), ('navi', 'B · 导航地图'), ('papercut', 'C · 剪纸')]

for style, label in STYLES:
    rows = []
    for tag, base in (('旧版', OLD / style), ('新版 萌化', A / style)):
        tiles = []
        for cid in IDS:
            p = base / f'{cid}.jpg'
            if not p.exists():
                tiles.append(None)
                continue
            im = Image.open(p).convert('RGB')
            H = 260
            im = im.resize((round(im.width * H / im.height), H), Image.LANCZOS)
            tiles.append(im)
        if not any(tiles):
            continue
        W = max(t.width for t in tiles if t) + 8
        row = Image.new('RGB', (W * len(IDS), 260 + 26), '#ffffff')
        d = ImageDraw.Draw(row)
        d.text((6, 6), f'{label} · {tag}', fill='#111')
        for i, t in enumerate(tiles):
            if t:
                row.paste(t, (i * W + (W - t.width) // 2, 24))
        rows.append(row)
    if not rows:
        continue
    W = max(r.width for r in rows)
    H = sum(r.height for r in rows)
    sheet = Image.new('RGB', (W, H), '#ffffff')
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    sheet.thumbnail((2400, 4000), Image.LANCZOS)
    sheet.save(OUT / f'v2_sheet_{style}.jpg', quality=92)
    print('saved', OUT / f'v2_sheet_{style}.jpg', sheet.size)
