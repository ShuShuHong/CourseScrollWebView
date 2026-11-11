"""
多参考图定点改图（i2i，最多 10 张参考图）。

用途：seedream 只给 ref1 + ref2 时，模型经常只抄 ref2 的一部分；多塞两张
（已通过审图的同款形态、母版定妆图）能显著提高“六条步足”这类结构项的命中率。

用法：
  uv run --with requests python tools/fix_multi.py m0_run --style navi \
      --ref m0_cheer.jpg master.jpg --prompt-file tools/fix_prompts/lv1_legs_m.txt

规则同 fix_variant.py：覆盖前备份到 _work/backup/<style>/<id>_<时间>.jpg，
成功的写进 races/<id>/mascots/manifest.json。
"""
import argparse
import datetime as dt
import importlib.util
import json
import pathlib
import shutil
import sys

import requests
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = MASCOTS
MAN = OUT / 'manifest.json'

spec = importlib.util.spec_from_file_location('rh', pathlib.Path.home() / '.claude/skills/rh-seedream/rh_seedream.py')
RHM = importlib.util.module_from_spec(spec)
spec.loader.exec_module(RHM)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('vid')
    ap.add_argument('--style', default='navi')
    ap.add_argument('--ref', nargs='+', required=True, help='不带 <style>/ 前缀的文件名或路径（相对 races/<id>/mascots/<style>/）')
    ap.add_argument('--prompt-file', required=True)
    ap.add_argument('--res', default='2k')
    ap.add_argument('--dry', action='store_true', help='只打印，不调 API')
    a = ap.parse_args()

    prompt = pathlib.Path(a.prompt_file).read_text(encoding='utf-8').strip()
    target = OUT / a.style / f'{a.vid}.jpg'
    if not target.exists():
        sys.exit(f'缺 {target}')

    refs_local = [target]
    for r in a.ref:
        p = pathlib.Path(r)
        if not p.is_absolute():
            p = OUT / a.style / r
        if not p.exists():
            sys.exit(f'缺参考图 {p}')
        refs_local.append(p)

    print('参考图顺序：')
    for i, p in enumerate(refs_local, 1):
        print(f'  图{i} = {p.relative_to(ROOT) if p.is_relative_to(ROOT) else p}')
    if a.dry:
        return

    rh = RHM.RH(RHM.load_api_key())
    stamp = dt.datetime.now().strftime('%Y%m%d-%H%M%S')
    refs = [rh.upload(p) for p in refs_local]
    payload = {'prompt': prompt, 'outputFormat': 'jpeg', 'resolution': a.res, 'imageUrls': refs}
    tid = rh.submit(RHM.ENDPOINTS['i2i'], payload)
    print(f'task {tid}', flush=True)
    data = rh.wait(tid, interval=4, timeout=900)
    url = data['results'][0]['url']
    r = requests.get(url, timeout=180)
    r.raise_for_status()
    bak = ROOT / '_work' / 'backup' / a.style / f'{a.vid}_{stamp}.jpg'
    bak.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target, bak)
    target.write_bytes(r.content)
    m = json.loads(MAN.read_text(encoding='utf-8')) if MAN.exists() else {}
    m[f'{a.style}/{a.vid}'] = {
        'mode': 'i2i-multi', 'prompt': prompt, 'taskId': tid, 'url': url, 'refs': refs,
        'refFiles': [str(p.relative_to(ROOT)) for p in refs_local],
        'res': a.res, 'file': str(target.relative_to(ROOT)), 'backup': str(bak.relative_to(ROOT)),
    }
    MAN.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'OK → {target.relative_to(ROOT)}  (备份 {bak.relative_to(ROOT)})')


if __name__ == '__main__':
    main()
