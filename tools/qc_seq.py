"""
运动序列相位审计：判断一段“动作分解图”到底有没有真的在动。

  uv run --with numpy --with pillow --with scipy python tools/qc_seq.py navi

每个形象输出：
  stance  每一帧“脚下 8% 高度带”里最左到最右不透明像素的宽度（站距） → 变化越大越像迈步
  lift    每一帧包围盒底边 y（相对画布底） → 有的帧脚离地说明有腾空
  legIoU  帧间“下身 35% 区域”剪影 IoU（越小 = 腿的姿势差得越多）
  fullIoU 帧间整体剪影 IoU（太大 = 几乎没变）
结论：OK / WEAK（stance 变化 <15% 且 legIoU 中位 >0.90）/ FLAT（几乎不动）
"""
import json
import pathlib
import sys
import itertools

import numpy as np
from PIL import Image
from scipy import ndimage
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
style = sys.argv[1] if len(sys.argv) > 1 else 'navi'
meta = json.loads((MASCOTS / 'cut.json').read_text(encoding='utf-8'))
seqs = (meta.get('seq') or {}).get(style) or {}
ORDER = ['m0_run', 'm0_cheer', 'm1_run', 'm1_tired', 'm2_win',
         'f0_run', 'f0_cheer', 'f1_run', 'f1_tired', 'f2_win']
ids = [i for i in ORDER if i in seqs] or sorted(seqs)


def load(fr):
    im = Image.open(MASCOTS / fr['file']).convert('RGBA')
    A = np.asarray(im)[:, :, 3] > 128
    return A


print(f'{"id":12s} {"stance(px)":26s} {"spread":>6s} {"lift(px)":18s} {"legIoU":>7s} {"fullIoU":>7s}  结论')
bad = []
for cid in ids:
    frames = [load(fr) for fr in seqs[cid]]
    H = frames[0].shape[0]
    stance, lift = [], []
    for A in frames:
        ys, xs = np.nonzero(A)
        yb = int(ys.max())
        band = A[max(0, yb - int(H * 0.08)):yb + 1]
        xs2 = np.nonzero(band.any(0))[0]
        stance.append(int(xs2.max() - xs2.min() + 1) if len(xs2) else 0)
        lift.append(int(H - 1 - yb))
    legs, full = [], []
    for a, b in itertools.combinations(range(len(frames)), 2):
        A, B = frames[a], frames[b]
        full.append((A & B).sum() / max(1, (A | B).sum()))
        band = slice(int(H * 0.65), H)
        A2, B2 = A[band], B[band]
        legs.append((A2 & B2).sum() / max(1, (A2 | B2).sum()))
    spread = (max(stance) - min(stance)) / max(1, np.mean(stance))
    legm = float(np.median(legs))
    fullm = float(np.median(full))
    if legm > 0.93 and spread < 0.15:
        verdict = 'FLAT'
    elif spread < 0.15 or legm > 0.90:
        verdict = 'WEAK'
    else:
        verdict = 'OK'
    if verdict != 'OK':
        bad.append(cid)
    print(f'{cid:12s} {str(stance):26s} {spread*100:5.0f}% {str([int(x) for x in lift]):18s} {legm:7.3f} {fullm:7.3f}  {verdict}')
print()
print('需要重出：', ', '.join(bad) if bad else '无')
