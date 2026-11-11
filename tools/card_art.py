"""
地标图卡的「实拍照片 → 卡通化插画」流水线（RunningHub seedream-v5-pro 图生图）

为什么单独一套：卡片里的图片窗口是 **532×200**（1920 画布），要 cover 铺满、
比例 2.66:1；原来的地标图是 3:2（1632×1024），进卡片时被 slice 裁掉上下各 20%，
所以塔尖、屋檐这种"顶部信息"经常被切。这里直接按卡片比例出图，卡片里再也不会裁。

  # 单张（默认只出到 out/cardart/ 里预览，不动线上素材）
  uv run --with requests --with pillow python tools/card_art.py one assets/photos/museum.jpg --id museum --style cartoon

  # 满意了就装进 assets/landmarks/<style>/<id>.jpg（旧的存 .bak）
  uv run ... tools/card_art.py one ... --style cartoon --install

  # 一次跑整个目录：assets/photos/<id>.jpg → 三个画风全出
  uv run ... tools/card_art.py batch assets/photos

  # 只跑 B 导航地图
  uv run --with requests --with pillow python tools/card_art.py batch assets/photos --styles navi --install

输出尺寸：1600×600（= 卡片 532×200 的 3 倍，4K 成片里 1064×400，仍有余量）。
"""
import argparse
import importlib.util
import json
import pathlib
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import requests
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import crab_prompts as CP  # noqa: E402

spec = importlib.util.spec_from_file_location('rh', pathlib.Path.home() / '.claude/skills/rh-seedream/rh_seedream.py')
RHM = importlib.util.module_from_spec(spec)
spec.loader.exec_module(RHM)

OUT = ROOT / 'out' / 'cardart'
LAND = ROOT / 'assets' / 'landmarks'
PHOTOS = ROOT / 'assets' / 'photos'
MAN = LAND / '_cardart.json'

# 卡片图片窗口 532×200 → 2.66:1；出 1600×600
CARD_W, CARD_H = 1600, 600

# ── 提示词：画风沿用 crab_prompts.LANDMARK_LOOK（和现有卡片同一支笔），
#    后面接"照照片改画"的约束，避免模型自由发挥把地标画成别的东西。
# 卡片里出现、但 crab_prompts 里还没有的地标（桥、塔）
EXTRA_SUBJECT = {
    'bridge': '固城湖大桥：跨湖的独塔双索面斜拉桥，H 型桥塔立在水中，两侧各一组扇形斜拉索斜拉到桥面，'
              '桥面平直延伸向远处，桥下是开阔湖面；',
    'baosi': '保圣寺塔：方形五级砖塔，须弥座台基、层层出檐、四角攒尖顶、顶部塔刹（三圈相轮 + 宝珠），'
             '塔身斑驳的青砖质感，周围有低矮的古建院墙与树木；',
}
SUBJECT = {**CP.LANDMARKS, **EXTRA_SUBJECT}

STYLE_EXTRA = {
    'cartoon': '整体像手绘场景插画，色块干净、明暗分两层，天空与水面通透；',
    'navi': '整体像导航地图里的地点插图，造型几何化、边缘利落、留白讲究；',
    'papercut': '整体像多层剪纸叠贴，纸层之间很薄的投影，宣纸纤维细节；',
}

# ── 客户 2026-11-03 定调：要「清新」那版（= 现有 B 导航地图卡片那支笔），不要粗黑描边。
#    量化基线取自 assets/landmarks/navi/*.bak：亮度 163–206、黑线像素 0–1.3%、对比 38–45。
#    所以 fresh 的画风头单独写，不复用 LANDMARK_LOOK.navi（那句“大色块”会被画成高饱和平涂）。
LOOK = {
    'fresh': (
        '画风：清新通透的现代扁平插画，**色相明确、明度偏高、对比柔和**，笔触干净、几乎不用描边；'
        '天空是**清透的天蓝**（浅蓝有明确蓝色倾向，约 RGB 100,190,240，不要灰白、不要漂成白色），'
        '水面是清透的浅青蓝或青绿，植被是明亮的黄绿／青绿，建筑与铺装是奶油白与浅米灰，阴影极淡且偏冷；'
        '**不用黑色或深灰的轮廓线**（需要分界时用同色系深一档的细边），没有赛璐璐硬分面、没有粗黑描边；'
        '整体像高级文旅宣传插画或画得很干净的绘本书页：明亮、干净、透气，**但颜色要清楚、不能发灰发白**；'
    ),
    'cartoon': CP.LANDMARK_LOOK['cartoon'] + STYLE_EXTRA['cartoon'],
    'navi': CP.LANDMARK_LOOK['navi'] + STYLE_EXTRA['navi'],
    'papercut': CP.LANDMARK_LOOK['papercut'] + STYLE_EXTRA['papercut'],
}

# 双参考图：图1 = 实景照片（定内容/构图），图2 = 既有同画风卡片图（定笔触/明度/配色）
TWO_REF = (
    '两张参考图分工：图1 是实景照片，画面内容、建筑造型、透视与构图以它为准；'
    '图2 是同系列既有的卡片插图，**只参考它的画风**（线的粗细、明度高低、配色的清淡程度、笔触的松紧），'
    '不要照搬图2里的建筑造型与场景内容。'
)

FAITHFUL = (
    '以提供的实景照片为依据改画：**保留照片里主体的真实形状**——建筑的层数、屋顶形式、开窗节奏、'
    '塔／阁／牌坊的数量和位置，树木的高低疏密，水岸线的走向，以及原照片的拍摄视角与透视关系；'
    '只把材质、光色、笔触换成上面的画风，不要新增或删除建筑，不要改变主体在画面里的位置；'
    '地平线保持水平，主体不要顶到画面边缘。'
)

TAIL = '横幅构图（2.66:1，宽是高的 2.66 倍），场景铺满整个画面，没有边框、没有文字、没有人物、没有水印。'


def prompt(style, lid, note='', two_ref=False):
    head = LOOK[style]
    subject = SUBJECT.get(lid, '')
    body = subject + (note + '；' if note else '') + (TWO_REF if two_ref else '') + FAITHFUL + TAIL
    return head + body


def style_ref_for(lid: str, ref_dir: str) -> pathlib.Path | None:
    """同地标的既有卡片图（优先 .bak = 换图前的原版，就是客户说的那版清新风格）。"""
    d = pathlib.Path(ref_dir)
    if not d.is_absolute():
        d = ROOT / d
    for ext in ('.bak', '.jpg', '.jpeg', '.png'):
        p = d / f'{lid}{ext}'
        if p.exists():
            return p
    return None


def crop_ref(src: pathlib.Path, anchor: str, max_w=1600) -> pathlib.Path:
    """把参考图预裁成卡片比例：模型看到什么比例，就画什么比例（省得它自己乱构图）。"""
    im = Image.open(src).convert('RGB')
    w, h = im.size
    want = CARD_W / CARD_H
    if w / h > want:                      # 太宽 → 裁左右
        nw, nh = round(h * want), h
        x0 = {'left': 0, 'center': (w - nw) // 2, 'right': w - nw}[anchor]
        im = im.crop((x0, 0, x0 + nw, nh))
    else:                                  # 太高 → 裁上下
        nw, nh = w, round(w / want)
        y0 = {'top': 0, 'center': (h - nh) // 2, 'bottom': h - nh}[anchor]
        im = im.crop((0, y0, nw, y0 + nh))
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    tmp = OUT / '_ref' / (src.stem + f'_{anchor}.jpg')
    tmp.parent.mkdir(parents=True, exist_ok=True)
    im.save(tmp, quality=95)
    return tmp


def record(key, info):
    MAN.parent.mkdir(parents=True, exist_ok=True)
    m = json.loads(MAN.read_text(encoding='utf-8')) if MAN.exists() else {}
    m[key] = info
    MAN.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding='utf-8')


STYLE_DIR = {'fresh': 'navi', 'cartoon': 'cartoon', 'navi': 'navi', 'papercut': 'papercut'}


def run_one(rh, photo: pathlib.Path, lid: str, style: str, anchor='center', note='', install=False, keep_ref=False,
            ref_dir=None, style_ref_dir=None):
    photo = photo.resolve()                      # 相对路径先定住，否则 manifest 里的 relative_to 会炸
    if not photo.exists():
        raise FileNotFoundError(f'照片不存在：{photo}')
    # 优先用 photo_prep.py 预先算好的参考图（已锁成 1600×600、主体不被切）
    prepared = pathlib.Path(ref_dir or (OUT / '_ref')) / f'{lid}_ref.jpg'
    if prepared.exists():
        ref, from_prep = prepared, True
    else:
        ref, from_prep = crop_ref(photo, anchor), False
    # 图2：既有同画风卡片图（客户 2026-11-03：要“清新”那版，所以拿 navi 原版当风格锚）
    sref = style_ref_for(lid, style_ref_dir) if style_ref_dir else None
    p = prompt(style, lid, note, two_ref=bool(sref))
    t0 = time.time()
    urls = [rh.upload(ref)]
    if sref:
        urls.append(rh.upload(crop_ref(sref, 'center', max_w=1200)))
    tid = rh.submit(RHM.ENDPOINTS['i2i'], {
        'prompt': p, 'outputFormat': 'jpeg',
        'imageUrls': urls, 'width': CARD_W, 'height': CARD_H,
    })
    data = rh.wait(tid, interval=4, timeout=900)
    res_url = data['results'][0]['url']
    r = requests.get(res_url, timeout=180)
    r.raise_for_status()
    raw = OUT / '_raw' / f'{lid}_{style}.jpg'
    raw.parent.mkdir(parents=True, exist_ok=True)
    raw.write_bytes(r.content)
    # 统一尺寸（服务端偶尔给不等比的图，这里硬锁 1600×600，cover 裁、不拉变形）
    im = Image.open(raw).convert('RGB')
    if im.size != (CARD_W, CARD_H):
        im = im.resize((CARD_W, CARD_H), Image.LANCZOS)
    dest = OUT / f'{lid}_{style}.jpg' if not install else LAND / STYLE_DIR[style] / f'{lid}.jpg'
    dest.parent.mkdir(parents=True, exist_ok=True)
    if install and dest.exists() and not dest.with_suffix('.bak').exists():
        dest.with_suffix('.bak').write_bytes(dest.read_bytes())   # 只在没有原版备份时才写，别再覆盖真原版
    im.save(dest, quality=93, subsampling=1)
    dt = time.time() - t0
    record(f'{style}/{lid}', {
        'photo': str(photo.relative_to(ROOT)).replace('\\', '/') if photo.is_relative_to(ROOT) else str(photo),
        'ref': 'prepared' if from_prep else anchor,
        'style_ref': sref.name if sref else None,
        'prompt': p, 'taskId': tid, 'url': res_url,
        'size': [im.width, im.height], 'seconds': round(dt, 1), 'installed': bool(install),
        'at': time.strftime('%Y-%m-%d %H:%M'),
    })
    if not keep_ref and not from_prep:      # 只删自己临时裁的；预裁参考图是共享资产，不能删
        ref.unlink(missing_ok=True)
    print(f'  {style:<9} {lid:<10} {im.width}×{im.height}  {dt:5.1f}s  → {dest.relative_to(ROOT)}')
    return dest


def install_file(src: pathlib.Path, lid: str, style: str, note=''):
    """把已经生成好、人工看过的图直接装上（不再调 API、不再计费）。"""
    src = src.resolve()
    im = Image.open(src).convert('RGB')
    if im.size != (CARD_W, CARD_H):
        im = im.resize((CARD_W, CARD_H), Image.LANCZOS)
    dest = LAND / STYLE_DIR[style] / f'{lid}.jpg'
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not dest.with_suffix('.bak').exists():
        dest.with_suffix('.bak').write_bytes(dest.read_bytes())   # 真原版只备份一次，别被二次覆盖
    im.save(dest, quality=93, subsampling=1)
    record(f'{style}/{lid}', {'source': str(src), 'size': [im.width, im.height],
                             'installed': True, 'note': note, 'at': time.strftime('%Y-%m-%d %H:%M')})
    print(f'  install   {style:<9} {lid:<10} {im.width}×{im.height} → {dest.relative_to(ROOT)}')
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('mode', choices=['one', 'batch', 'install'])
    ap.add_argument('src', help='照片（one）/ 装照片的目录（batch）/ 已生成的图（install）')
    ap.add_argument('--id', help='one 模式下的地标 id（museum/oldstreet/sequoia/watertown/lakepark/wetland/baosi/hospital）')
    ap.add_argument('--style', action='append', help='画风，可重复：cartoon / navi / papercut（默认三种都出）')
    ap.add_argument('--styles', help='同上，逗号分隔')
    ap.add_argument('--anchor', default='center', choices=['top', 'center', 'bottom', 'left', 'right'],
                    help='预裁时保留哪一边（塔尖怕被切就 top）')
    ap.add_argument('--note', default='', help='追加到提示词的一句补充说明')
    ap.add_argument('--install', action='store_true', help='直接写进 assets/landmarks/<style>/<id>.jpg（旧图存 .bak）')
    ap.add_argument('--keep-ref', action='store_true', help='保留预裁后的参考图，便于核对')
    ap.add_argument('--workers', type=int, default=4, help='并发数（默认 4）')
    ap.add_argument('--ref-dir', default='', help='用 photo_prep.py 预裁好的参考图目录（默认 out/cardart/_ref）')
    ap.add_argument('--style-ref-dir', default='assets/landmarks/navi',
                    help='图2 风格锚目录（同 id 的既有卡片图；传空字符串关掉双参考图）')
    a = ap.parse_args()

    styles = a.style or (a.styles.split(',') if a.styles else list(CP.STYLES))
    if a.mode == 'install':
        if not a.id:
            sys.exit('install 模式要 --id')
        for s in styles:
            install_file(pathlib.Path(a.src), a.id, s, a.note)
        print('\n记得重打素材：uv run --with pillow python tools/pack_assets.py ' + ' '.join(styles) + ' && npm run preview')
        return
    rh = RHM.RH(RHM.load_api_key())
    jobs = []
    if a.mode == 'one':
        if not a.id:
            sys.exit('one 模式要 --id')
        jobs.append((pathlib.Path(a.src), a.id))
    else:
        d = pathlib.Path(a.src)
        if not d.is_dir():
            sys.exit(f'{d} 不是目录')
        for p in sorted([q for q in list(d.glob('*.jpg')) + list(d.glob('*.jpeg')) + list(d.glob('*.png')) if not q.stem.startswith('_') and q.stem != 'README']):
            jobs.append((p, p.stem))
        if not jobs:
            sys.exit(f'{d} 里没有照片')
    print(f'{len(jobs)} 张照片 × {len(styles)} 个画风 = {len(jobs) * len(styles)} 次调用（每次计费）')
    ok, bad, lock = 0, [], threading.Lock()

    def do(job):
        nonlocal ok
        photo, lid, s = job
        try:
            run_one(rh, photo, lid, s, a.anchor, a.note, a.install, a.keep_ref, a.ref_dir or None,
                    a.style_ref_dir or None)
            with lock:
                ok += 1
        except Exception as e:                      # 单张失败不拖垮整批
            with lock:
                bad.append(f'{lid}/{s}: {str(e)[:160]}')
            print(f'  {s:<9} {lid:<10} ✗ {str(e)[:120]}')

    work = [(photo, lid, s) for photo, lid in jobs for s in styles]
    with ThreadPoolExecutor(max_workers=max(1, a.workers)) as ex:
        list(ex.map(do, work))
    print(f'\n完成 {ok} 张，失败 {len(bad)} 张')
    for b in bad:
        print('  ✗', b)
    if not a.install:
        print(f'\n预览在 {OUT.relative_to(ROOT)}/；满意后加 --install 才替换线上素材')


if __name__ == '__main__':
    main()
