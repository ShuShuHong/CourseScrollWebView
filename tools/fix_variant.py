"""
定点改图：用 RunningHub seedream-v5-pro 的 i2i，只改一处、其余锁死。

用途举例：蟹后（母蟹 Lv3）胸口花纹与前序形态不一致 → 以“现图 + 已确认的 Lv2 形态”两张参考图
做定点修图，提示词里明确“只改腹部，其余全部保持不变”，避免整只重生成导致形象漂移。

  uv run --with requests python tools/fix_variant.py f2_win \
      --styles cartoon navi papercut \
      --prompt-file tools/fix_prompts/f2_win.txt

规则：
  · 参考图 1 = 现图（races/<id>/mascots/<style>/<id>.jpg），参考图 2 = 同风格母蟹 Lv2 奔跑图
  · 结果覆盖原图前先备份到 _work/backup/<style>/<id>_<时间>.jpg
  · 成功的写进 races/<id>/mascots/manifest.json（记录提示词、任务号、参考图），便于复现
"""
import argparse
import datetime as dt
import importlib.util
import json
import pathlib
import shutil
import sys
import threading

import requests
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = MASCOTS
MAN = OUT / 'manifest.json'
lock = threading.Lock()

spec = importlib.util.spec_from_file_location('rh', pathlib.Path.home() / '.claude/skills/rh-seedream/rh_seedream.py')
RHM = importlib.util.module_from_spec(spec)
spec.loader.exec_module(RHM)


def record(key, info):
    with lock:
        m = json.loads(MAN.read_text(encoding='utf-8')) if MAN.exists() else {}
        m[key] = info
        MAN.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding='utf-8')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('vid', help='目标形象 id，例如 f2_win')
    ap.add_argument('--styles', nargs='*', default=['cartoon', 'navi', 'papercut'])
    ap.add_argument('--prompt-file', required=True)
    ap.add_argument('--ref2', default=None, help='第二张参考图（默认按性别取同级已确认形态，如 f1_run）')
    ap.add_argument('--res', default='2k')
    a = ap.parse_args()

    prompt = pathlib.Path(a.prompt_file).read_text(encoding='utf-8').strip()
    rh = RHM.RH(RHM.load_api_key())
    stamp = dt.datetime.now().strftime('%Y%m%d-%H%M%S')
    ok = fail = 0
    for style in a.styles:
        target = OUT / style / f'{a.vid}.jpg'
        if not target.exists():
            print(f'skip {style}: 缺 {target.relative_to(ROOT)}')
            fail += 1
            continue
        sex = a.vid[0]
        ref2 = OUT / style / (a.ref2 or f'{sex}1_run.jpg')
        if not ref2.exists():
            ref2 = OUT / style / f'{sex}0_run.jpg'
        refs = [rh.upload(target), rh.upload(ref2)]
        payload = {'prompt': prompt, 'outputFormat': 'jpeg', 'resolution': a.res, 'imageUrls': refs}
        tid = rh.submit(RHM.ENDPOINTS['i2i'], payload)
        print(f'{style}: task {tid}', flush=True)
        data = rh.wait(tid, interval=4, timeout=900)
        url = data['results'][0]['url']
        r = requests.get(url, timeout=180)
        r.raise_for_status()
        bak = ROOT / '_work' / 'backup' / style / f'{a.vid}_{stamp}.jpg'
        bak.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, bak)
        target.write_bytes(r.content)
        record(f'{style}/{a.vid}', {
            'mode': 'i2i-fix', 'prompt': prompt, 'taskId': tid, 'url': url, 'refs': refs,
            'res': a.res, 'file': str(target.relative_to(ROOT)), 'backup': str(bak.relative_to(ROOT)),
        })
        print(f'OK {style} → {target.relative_to(ROOT)}  (备份 {bak.relative_to(ROOT)})', flush=True)
        ok += 1
    print(f'done ok={ok} fail={fail}')
    sys.exit(1 if fail else 0)


if __name__ == '__main__':
    main()
