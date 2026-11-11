"""
把“动作分解图”切成逐帧透明 PNG，并对齐成同一块画布（播放时不跳动）。

  uv run --with numpy --with pillow --with scipy python tools/slice_seq.py navi [m0_run,...]

步骤：
  1) 白底宫格图 → 前景掩码 → 列投影 / 行投影找“大空隙”，把图切成 N 格（从上到下、从左到右）；
  2) 每格复用 cutout.cut() 抠图（同样的白底泛洪 + 去阴影带 + 羽化）；
  3) 归一化：每帧按包围盒高度统一缩放到 H；贴到同一块画布上——底线对齐、水平按视觉中心对齐；
  4) 输出 races/<id>/mascots/<style>/seq/<id>/f00.webp … 并写入 races/<id>/mascots/cut.json 的 seq 段。

切格不对时先看 out/qc/seq_sheet_<style>_<id>.jpg（带红框编号），再调 --gap。
"""
import json
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from cutout import cut  # noqa: E402
from mascot_path import MASCOTS, CUT_JSON  # 角色素材跟着赛事包走（races/<id>/mascots）

SRC = MASCOTS
QC = ROOT / 'out' / 'qc'
QC.mkdir(parents=True, exist_ok=True)
H = 720            # 每帧统一高度
PAD_FRAC = 0.06    # 画布左右额外留白（占画布高度）


def bands(profile, gap_min):
    """一维投影 → 内容段列表；空隙窄于 gap_min 的相邻内容段合并"""
    on = profile > 0
    segs, i, n = [], 0, len(on)
    while i < n:
        if not on[i]:
            i += 1
            continue
        j = i
        while j + 1 < n and on[j + 1]:
            j += 1
        if segs and (i - (segs[-1][1] + 1)) < gap_min:
            segs[-1] = (segs[-1][0], j)
        else:
            segs.append((i, j))
        while j + 1 < n and not on[j + 1]:
            j += 1
        i = j + 1
    return segs


def fg_mask(im):
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    mx, mn = a.max(2), a.min(2)
    sat, lum = mx - mn, a.mean(2)
    whiteish = (mn > 228) & (sat < 22)
    lab, _ = ndimage.label(whiteish)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    soft = (mn > 205) & (sat < 26)
    lab2, _ = ndimage.label(soft | bg)
    b2 = set(np.unique(lab2[bg])) - {0}
    bg = np.isin(lab2, list(b2))
    fg = ~bg
    lab3, n3 = ndimage.label(fg)
    if n3 > 1:
        sizes = ndimage.sum(fg, lab3, range(1, n3 + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s > fg.sum() * 0.002]
        fg = np.isin(lab3, keep)
    return fg


def cells_of(im, gap_frac=0.035):
    W, Hh = im.size
    fg = fg_mask(im)
    out = []
    for (x0, x1) in bands(fg.sum(0), gap_min=int(W * gap_frac)):
        sub = fg[:, x0:x1 + 1]
        for (y0, y1) in bands(sub.sum(1), gap_min=int(Hh * gap_frac)):
            if (y1 - y0 + 1) < Hh * 0.12 or (x1 - x0 + 1) < W * 0.05:
                continue
            out.append((x0, y0, x1, y1))
    return out


def cut_cell(im):
    tmp = ROOT / '_work' / 'cell_tmp.jpg'
    tmp.parent.mkdir(parents=True, exist_ok=True)
    im.save(tmp, quality=96)
    rgba, _m = cut(tmp)
    # 清掉切格时带进来的碎块：邻格阴影、地面投影碎片。
    # 规则一：面积 < 最大块 3% 的一律丢；规则二：贴底（底部 15%）的低饱和灰色块也丢（那是地面阴影，不是蟹腿）
    A = np.asarray(rgba).copy()
    mask = A[:, :, 3] > 40
    lab, n = ndimage.label(mask)
    if n > 1:
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        big = sizes.max()
        H = mask.shape[0]
        drop = []
        for k in range(1, n + 1):
            s = sizes[k - 1]
            ys, xs = np.nonzero(lab == k)
            small = s < big * 0.03
            rgb = A[ys, xs][:, :3].astype(int)
            sat = float((rgb.max(1) - rgb.min(1)).mean()) if len(rgb) else 0
            bottom = ys.min() > H * 0.85
            if small or (bottom and sat < 30 and s < big * 0.12):
                drop.append(k)
        if drop:
            A[:, :, 3] = np.where(np.isin(lab, drop), 0, A[:, :, 3])
            rgba = Image.fromarray(A)
    return rgba


def body_height(mask):
    """躯干高度：腐蚀掉细腿后最大连通块的高度（用于兜底）"""
    h = mask.shape[0]
    k = max(3, int(h * 0.05))
    er = ndimage.binary_erosion(mask, iterations=k)
    lab, n = ndimage.label(er)
    if n == 0:
        return h
    sizes = ndimage.sum(er, lab, range(1, n + 1))
    t = lab == (int(np.argmax(sizes)) + 1)
    t = ndimage.binary_dilation(t, iterations=k + 1) & mask
    ys, _ = np.nonzero(t)
    if len(ys) == 0:
        return h
    return int(ys.max() - ys.min() + 1)


def find_eyes(rgba):
    """在一帧里找那对眼球：返回 (eye_cx, eye_cy, ipd) 或 None。

    复用 qc_eyes2 的判定：深色 + 近圆 + 面积合理；两眼尺寸相近、纵向接近、横向间隔成比例。
    眼睛是最稳的尺度基准——宫格里每帧腿的张开度不同，但眼睛大小从不乱变。
    """
    bg = Image.new('RGB', rgba.size, (255, 255, 255))
    bg.paste(rgba, (0, 0), rgba)
    a = np.asarray(bg).astype(np.float32)
    g = np.asarray(bg.convert('L')).astype(np.float32)
    mx, mn = a.max(2), a.min(2)
    body = ~np.logical_and(mn > 236, (mx - mn) < 12)
    ys, xs = np.nonzero(body)
    if len(ys) == 0:
        return None
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    W, Hh = x1 - x0 + 1, y1 - y0 + 1
    dark = body & (g < 80)
    lab, n = ndimage.label(dark)
    cand = []
    for i in range(1, n + 1):
        m = lab == i
        area = int(m.sum())
        if area < W * Hh * 0.0008 or area > W * Hh * 0.05:
            continue
        my, mxs = np.nonzero(m)
        w, h = mxs.max() - mxs.min() + 1, my.max() - my.min() + 1
        if min(w, h) / max(w, h) < 0.62 or area / (w * h) < 0.55:
            continue
        r = max(w, h) / 2
        if area / (np.pi * r * r) < 0.62:
            continue
        if (my.mean() - y0) / Hh > 0.60 or w > W * 0.26:
            continue
        cand.append({'x': float(mxs.mean()), 'y': float(my.mean()), 'w': int(w), 'h': int(h),
                     'area': area, 'flat': w / max(1, h)})
    cand.sort(key=lambda e: -e['area'])
    for i, e in enumerate(cand):
        for f in cand[i + 1:]:
            if abs(e['w'] - f['w']) > max(e['w'], f['w']) * 0.35:
                continue
            if abs(e['y'] - f['y']) > Hh * 0.07:
                continue
            gap = abs(e['x'] - f['x'])
            if not (min(e['w'], f['w']) * 0.55 <= gap <= max(e['w'], f['w']) * 3.4):
                continue
            return ((e['x'] + f['x']) / 2, (e['y'] + f['y']) / 2, gap)
    merged = [e for e in cand if e['flat'] >= 1.45]
    if merged:
        e = merged[0]
        return (e['x'], e['y'], float(e['w']))
    return None


def strip_debris(rgba, bottom_frac=0.97, min_frac=0.03):
    """去掉输出画布上的碎屑：小连通域 + 贴底低饱和灰块。

    用 alpha>110 做判定（更高的阈值能避免半透明抗锯齿像素把碎屑和身体“粘”成一个连通域），
    命中的区域再向外扩 4px 把它的淡边一起去掉。
    """
    A = np.asarray(rgba).copy()
    m = A[:, :, 3] > 110
    lab, n = ndimage.label(m)
    if n < 2:
        return rgba
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    big = sizes.max()
    H = m.shape[0]
    drop = np.zeros_like(m)
    for k in range(1, n + 1):
        s = sizes[k - 1]
        ys, xs = np.nonzero(lab == k)
        rgb = A[ys, xs][:, :3].astype(int)
        sat = float((rgb.max(1) - rgb.min(1)).mean()) if len(rgb) else 0
        if s < big * min_frac or (ys.min() > H * bottom_frac and sat < 30 and s < big * 0.12):
            drop |= lab == k
    if drop.any():
        drop = ndimage.binary_dilation(drop, iterations=4)
        A[:, :, 3] = np.where(drop, 0, A[:, :, 3])
        return Image.fromarray(A)
    return rgba


def build(style, vid, gap_frac=0.035):
    sheet = SRC / style / 'seq_sheet' / f'{vid}.jpg'
    if not sheet.exists():
        print(f'  -- {vid}: 没有宫格图，跳过')
        return None
    im = Image.open(sheet).convert('RGB')
    cells = cells_of(im, gap_frac)
    if len(cells) < 2:
        print(f'  !! {vid}: 只切出 {len(cells)} 格，跳过（检查 --gap）')
        return None

    dbg = im.copy()
    d = ImageDraw.Draw(dbg)
    for i, (x0, y0, x1, y1) in enumerate(cells, 1):
        d.rectangle([x0, y0, x1, y1], outline=(220, 30, 30), width=6)
        d.text((x0 + 10, y0 + 8), str(i), fill=(220, 30, 30))
    dbg.resize((900, round(900 * im.height / im.width)), Image.LANCZOS).save(
        QC / f'seq_sheet_{style}_{vid}.jpg', quality=92)

    # 1) 逐格抠图；pad 只留 3px（pad 大了会把邻格/地面阴影带进来）
    trims = []
    for (x0, y0, x1, y1) in cells:
        pad = 3
        box = (max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad))
        trims.append(cut_cell(im.crop(box)))

    # 2) 尺度基准：优先用“瞳孔间距”对齐到已审图的那张静图；找不到眼睛就退回躯干高度中位数
    base_p = SRC / style / 'cut' / f'{vid}.png'
    base = Image.open(base_p).convert('RGBA') if base_p.exists() else None
    ref = find_eyes(base) if base else None
    eyes = [find_eyes(t) for t in trims]
    mode = 'eyes'
    use_eye = [False] * len(trims)

    if ref and any(e for e in eyes):
        # 逐帧按“瞳孔间距 = 基准静图”缩放；个别帧眼睛没识别到或明显误检 → 用中位数 + 轮廓面积补偿
        ipds = [e[2] for e in eyes if e]
        med_ipd = float(np.median(ipds))
        areas = [int((np.asarray(t)[:, :, 3] > 128).sum()) for t in trims]
        med_area = float(np.median(areas))
        sizes, use_eye = [], []
        for t, e, ar in zip(trims, eyes, areas):
            ok = bool(e) and abs(e[2] / med_ipd - 1) <= 0.12
            use_eye.append(ok)
            k = ref[2] / med_ipd
            if ok:
                k = ref[2] / e[2]
            else:
                k *= (med_area / max(1, ar)) ** 0.5      # 面积 ∝ 尺寸²
            sizes.append((max(1, round(t.width * k)), max(1, round(t.height * k))))
        hmax = max(s[1] for s in sizes)
        if hmax > H:
            k2 = H / hmax
            sizes = [(max(1, round(w * k2)), max(1, round(h * k2))) for (w, h) in sizes]
        # 基准静图里眼睛的相对位置（占总高的比例）
        A0 = np.asarray(base)[:, :, 3] > 128
        ys0, _ = np.nonzero(A0)
        base_h = ys0.max() - ys0.min() + 1
        eye_frac = (ref[1] - ys0.min()) / base_h
        scaled = [t.resize(s, Image.LANCZOS) for t, s in zip(trims, sizes)]
    else:
        mode = 'body'
        body = [body_height(np.asarray(t)[:, :, 3] > 128) for t in trims]
        med = float(np.median(body))
        scaled = [t.resize((max(1, round(t.width * med / max(1, b))), max(1, round(t.height * med / max(1, b)))),
                           Image.LANCZOS) for t, b in zip(trims, body)]
        mx = max(s.height for s in scaled)
        if mx > H:
            k2 = H / mx
            scaled = [s.resize((max(1, round(s.width * k2)), max(1, round(s.height * k2))), Image.LANCZOS) for s in scaled]
        eye_frac = 0.0

    cw = max(s.width for s in scaled) + 2 * int(H * PAD_FRAC)
    outdir = SRC / style / 'seq' / vid
    outdir.mkdir(parents=True, exist_ok=True)
    # 模板结构：序列帧存**无损 WebP**（同画面比 PNG 小三分之一以上）；
    #   clear 时两种后缀都清，换格式不会留下孤儿文件
    for old in list(outdir.glob('f*.png')) + list(outdir.glob('f*.webp')):
        old.unlink()

    saved = []
    for i, t in enumerate(scaled):
        canvas = Image.new('RGBA', (cw, H), (0, 0, 0, 0))
        e = find_eyes(t) if mode == 'eyes' else None
        if e:
            # 眼睛对齐：横向居中、纵向落在基准静图的相对高度上
            x = int(round(cw / 2 - e[0]))
            y = int(round(eye_frac * H - e[1]))
        else:
            A = np.asarray(t)[:, :, 3]
            cx_trim = float(np.nonzero(A > 128)[1].mean())
            x = int(round(cw / 2 - cx_trim))
            y = H - t.height
        canvas.paste(t, (x, y), t)
        canvas = strip_debris(canvas)
        A2 = np.asarray(canvas)[:, :, 3]
        ys, xs = np.nonzero(A2 > 128)
        yb = int(ys.max())
        band = A2[max(0, yb - int(H * 0.04)):yb + 1] > 128
        xs2 = np.nonzero(band.any(0))[0]
        ax = float(np.median(xs2)) / cw if len(xs2) else 0.5
        p = outdir / f'f{i:02d}.webp'
        canvas.save(p, 'WEBP', lossless=True, method=6)
        # 记**相对赛事包 mascots/ 的路径**（不再带 races/<id>/mascots 前缀，包可以整体搬走）
        saved.append({'file': p.relative_to(MASCOTS).as_posix(), 'w': cw, 'h': H,
                      'ax': round(ax, 4), 'ay': round((yb + 1) / H, 4),
                      'cx': round(float(xs.mean()) / cw, 4)})
    bh = [body_height(np.asarray(Image.open(f['file']))[:, :, 3] > 128) for f in saved]
    print(f'  {style}/{vid}: {len(saved)} 帧 · 画布 {cw}x{H} · 切格 {len(cells)} · 基准={mode} · 躯干高 {min(bh)}–{max(bh)}px')
    return saved


def main():
    style = sys.argv[1] if len(sys.argv) > 1 else 'navi'
    only = sys.argv[2].split(',') if len(sys.argv) > 2 else None
    ids = only or sorted(p.stem for p in (SRC / style / 'seq_sheet').glob('*.jpg'))
    meta_p = CUT_JSON
    meta = json.loads(meta_p.read_text(encoding='utf-8')) if meta_p.exists() else {}
    seqs = meta.setdefault('seq', {})
    seqs.setdefault(style, {})
    for vid in ids:
        frames = build(style, vid)
        if frames:
            seqs[style][vid] = frames
    meta_p.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')
    n = sum(len(v) for v in seqs[style].values())
    print(f'cut.json seq.{style}: {len(seqs[style])} 个形象 / {n} 帧')


if __name__ == '__main__':
    main()
