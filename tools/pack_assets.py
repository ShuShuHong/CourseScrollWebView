"""
打包位图资产 → dist/assets_<style>.js（window.__ASSETS = {crabs:{id:{src,w,h,ax,ay,cx}}, landmarks:{id:src}}）

  螃蟹：races/<id>/mascots/<style>/cut/*.png → WebP（高 DEFAULT_H，含透明）
  地标：assets/landmarks/<style>/*.jpg → JPEG（宽 640）
  定妆图：races/<id>/mascots/<style>/master.jpg → JPEG（宽 1200，设定集用）

成片 4K 渲染时用 --hd 打出高清版（螃蟹高 720、地标宽 1280）。

用法：uv run --with pillow python tools/pack_assets.py [--hd] [style ...]
"""
import base64, io, json, pathlib, sys
from PIL import Image
from mascot_path import MASCOTS, CUT_JSON  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
A = ROOT / 'assets'
HD = '--hd' in sys.argv


def opt(name, default):
    if name in sys.argv:
        return int(sys.argv[sys.argv.index(name) + 1])
    return default


# 取位置参数（风格名）：跳过 --h/--suffix 及其取值
args, skip = [], False
for a in sys.argv[1:]:
    if skip:
        skip = False
        continue
    if a in ('--h', '--suffix', '--lmw'):
        skip = True
        continue
    if a.startswith('--'):
        continue
    args.append(a)
STYLES = args or ['cartoon', 'navi', 'papercut']
CRAB_H = opt('--h', 720 if HD else 400)
LM_W = opt('--lmw', 1280 if HD else 640)
SUFFIX = sys.argv[sys.argv.index('--suffix') + 1] if '--suffix' in sys.argv else ('_hd' if HD else '')
ENDCARD_W = 2560                     # 落版底图内嵌宽（成片 4K 时再放大 1.5×，插画看不出）


def b64(im, fmt, **kw):
    buf = io.BytesIO(); im.save(buf, fmt, **kw)
    mime = {'WEBP': 'image/webp', 'JPEG': 'image/jpeg', 'PNG': 'image/png'}[fmt]
    return f'data:{mime};base64,' + base64.b64encode(buf.getvalue()).decode()


def main():
    cut = json.loads(CUT_JSON.read_text(encoding='utf-8'))
    seq_meta = cut.get('seq', {})
    for s in STYLES:
        out = {'style': s, 'crabs': {}, 'landmarks': {}, 'master': None}
        # cut/ 存**无损 WebP**（同画面比 PNG 小三成）；老素材可能还是 PNG，两种都收
        for p in sorted(list((MASCOTS / s / 'cut').glob('*.webp')) + list((MASCOTS / s / 'cut').glob('*.png'))):
            im = Image.open(p)
            k = CRAB_H / im.height
            im = im.resize((round(im.width * k), CRAB_H), Image.LANCZOS)
            m = cut[f'{s}/{p.stem}']
            out['crabs'][p.stem] = {'src': b64(im, 'WEBP', quality=88, method=6), 'w': im.width, 'h': im.height,
                                    'ax': m['ax'], 'ay': float(m['ay']), 'cx': m['cx']}
        # 运动序列帧（切格产物）：同一形象多帧，画布与锚点已对齐
        for cid, frames in (seq_meta.get(s) or {}).items():
            if cid not in out['crabs']:
                continue
            out['crabs'][cid]['seq'] = []
            for fr in frames:
                fp = MASCOTS / fr['file']
                if not fp.exists():
                    # 容错：cut.json 记的是 .webp，但老素材可能还是 .png（反之同理）
                    for alt in ('.webp', '.png'):
                        cand = fp.with_suffix(alt)
                        if cand.exists():
                            fp = cand
                            break
                if not fp.exists():
                    continue
                im2 = Image.open(fp)
                k = CRAB_H / im2.height
                im2 = im2.resize((max(1, round(im2.width * k)), CRAB_H), Image.LANCZOS)
                out['crabs'][cid]['seq'].append({
                    'src': b64(im2, 'WEBP', quality=86, method=6),
                    'w': im2.width, 'h': im2.height,
                    'ax': fr['ax'], 'ay': float(fr['ay']), 'cx': fr['cx']})
        for p in sorted((A / 'landmarks' / s).glob('*.jpg')):
            im = Image.open(p).convert('RGB')
            im = im.resize((LM_W, round(im.height * LM_W / im.width)), Image.LANCZOS)
            out['landmarks'][p.stem] = b64(im, 'JPEG', quality=84)
        # 落版底图（客户 2026-11-04）：assets/endcard/<style>.jpg，1920 宽显示、4K 时 1:1
        ec = A / 'endcard' / f'{s}.jpg'
        if ec.exists():
            im = Image.open(ec).convert('RGB')
            if im.width > ENDCARD_W:          # 4K 屏上放大 1.5× 也看不出软
                im = im.resize((ENDCARD_W, round(im.height * ENDCARD_W / im.width)), Image.LANCZOS)
            out['endcard'] = b64(im, 'JPEG', quality=85)
        # 大地图门头的字条（客户 2026-11-06）：mainset/arch-white.png —— 白字透明底，压蓝梁上
        aw = ROOT / 'mainset' / 'arch-white.png'
        if aw.exists():
            im = Image.open(aw).convert('RGBA')
            if im.width > 1627:
                im = im.resize((1627, round(im.height * 1627 / im.width)), Image.LANCZOS)
            out['archLogo'] = b64(im, 'PNG')
        # 主舞台背景（客户 2026-11-06）：mainset/stage-back.png —— 16:9 版面，斜撑大屏
        sb = ROOT / 'mainset' / 'stage-back.png'
        if sb.exists():
            im = Image.open(sb).convert('RGB')
            if im.width > 1920:
                im = im.resize((1920, round(im.height * 1920 / im.width)), Image.LANCZOS)
            out['stageBack'] = b64(im, 'JPEG', quality=90)
        # 门头 logo（客户 2026-11-05 ⑤）：mainset/logo+title.png → PNG（带 alpha，16:1 横版）
        lg = ROOT / 'mainset' / 'logo+title.png'
        if lg.exists():
            im = Image.open(lg).convert('RGBA')
            if im.width > 3200:               # 4K 上按 ~31 m 宽显示，3200 够锐
                im = im.resize((3200, round(im.height * 3200 / im.width)), Image.LANCZOS)
            out['venueLogo'] = b64(im, 'PNG')
        mp = MASCOTS / s / 'master.jpg'
        if mp.exists():
            im = Image.open(mp).convert('RGB'); im.thumbnail((1200, 1200))
            out['master'] = b64(im, 'JPEG', quality=86)
        dest = ROOT / 'dist' / f'assets_{s}{SUFFIX}.js'
        dest.parent.mkdir(exist_ok=True)
        dest.write_text('window.__ASSETS=' + json.dumps(out, separators=(',', ':')) + ';', encoding='utf-8')
        print(s, len(out['crabs']), 'crabs', len(out['landmarks']), 'landmarks', dest.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
